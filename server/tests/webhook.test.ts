import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app, makeTenant, sign } from "./helpers";
import { prisma } from "../src/lib/prisma";
import { drainWebhookQueue } from "../src/routes/webhook";

function inbound(phoneNumberId: string, from: string, id: string, msg: Record<string, unknown>) {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: "WABA", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: phoneNumberId, display_phone_number: "15550000000" }, contacts: [{ wa_id: from, profile: { name: "Test" } }], messages: [{ from, id, timestamp: String(Math.floor(Date.now() / 1000)), ...msg }] } }] }],
  });
}
function statusEvent(phoneNumberId: string, wamid: string, status: string) {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: "WABA", changes: [{ field: "messages", value: { metadata: { phone_number_id: phoneNumberId }, statuses: [{ id: wamid, status, timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: "919" }] } }] }],
  });
}
const post = (body: string, signature = sign(body)) =>
  request(app()).post("/webhooks/whatsapp").set("content-type", "application/json").set("x-hub-signature-256", signature).send(body);

afterEach(() => vi.restoreAllMocks());

describe("WhatsApp Cloud API webhook", () => {
  it("completes the verification handshake only with the right token", async () => {
    const ok = await request(app()).get("/webhooks/whatsapp").query({ "hub.mode": "subscribe", "hub.verify_token": "verify-me", "hub.challenge": "12345" });
    expect(ok.status).toBe(200);
    expect(ok.text).toBe("12345");
    const bad = await request(app()).get("/webhooks/whatsapp").query({ "hub.mode": "subscribe", "hub.verify_token": "nope", "hub.challenge": "1" });
    expect(bad.status).toBe(403);
  });

  it("rejects deliveries with a missing or invalid signature", async () => {
    const body = inbound("000", "919000000001", "wamid.bad", { type: "text", text: { body: "hi" } });
    expect((await post(body, "sha256=deadbeef")).status).toBe(401);
    expect((await request(app()).post("/webhooks/whatsapp").set("content-type", "application/json").send(body)).status).toBe(401);
  });

  it("processes a message once even when Meta retries the delivery, and sends replies via the Cloud API", async () => {
    const f = await makeTenant({ phoneNumberId: `pn${Date.now()}` });
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: f.tenantId } });
    let n = 0;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ messaging_product: "whatsapp", messages: [{ id: `wamid.out${n++}` }] }), { status: 200, headers: { "content-type": "application/json" } }));
    const body = inbound(tenant.whatsappPhoneNumberId!, "919444400001", `wamid.in.${Date.now()}`, { type: "text", text: { body: "Hello" } });
    expect((await post(body)).status).toBe(200);
    expect((await post(body)).status).toBe(200); // duplicate delivery
    await drainWebhookQueue();
    const inboundMsgs = await prisma.message.count({ where: { tenantId: f.tenantId, direction: "INBOUND" } });
    expect(inboundMsgs).toBe(1);
    const out = await prisma.message.findMany({ where: { tenantId: f.tenantId, direction: "OUTBOUND" } });
    expect(out.length).toBe(1); // language prompt
    expect(out[0].status).toBe("SENT");
    expect(out[0].externalId).toMatch(/^wamid\.out/);
    const sendCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/messages"));
    const payload = JSON.parse(String((sendCalls[0][1] as RequestInit).body));
    expect(payload.messaging_product).toBe("whatsapp");
    expect(payload.type).toBe("interactive");
    expect(payload.interactive.action.buttons).toHaveLength(2);

    // Delivery status updates, never downgraded by out-of-order webhooks
    await post(statusEvent(tenant.whatsappPhoneNumberId!, out[0].externalId!, "read"));
    await post(statusEvent(tenant.whatsappPhoneNumberId!, out[0].externalId!, "delivered"));
    await drainWebhookQueue();
    expect((await prisma.message.findUniqueOrThrow({ where: { id: out[0].id } })).status).toBe("READ");
  });

  it("records failures safely when the Cloud API is down (bounded retries, no crash)", async () => {
    const f = await makeTenant({ phoneNumberId: `pn${Date.now()}x` });
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: f.tenantId } });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ error: { code: 131000, message: "Something went wrong" } }), { status: 500 }));
    await post(inbound(tenant.whatsappPhoneNumberId!, "919444400002", `wamid.in2.${Date.now()}`, { type: "text", text: { body: "Hi" } }));
    await drainWebhookQueue();
    const out = await prisma.message.findFirstOrThrow({ where: { tenantId: f.tenantId, direction: "OUTBOUND" } });
    expect(out.status).toBe("FAILED");
    expect(out.attempts).toBe(3);
    expect(out.error).toContain("HTTP 500");
    // 3 send attempts; the extra call (if any) is the best-effort read receipt
    const sendAttempts = fetchMock.mock.calls.filter(([, init]) => JSON.parse(String((init as RequestInit).body)).type === "interactive");
    expect(sendAttempts).toHaveLength(3);
  });

  it("marks replies NOT_CONFIGURED (never 'sent') when a workspace has no access token", async () => {
    const saved = process.env.WHATSAPP_ACCESS_TOKEN;
    const f = await makeTenant({ phoneNumberId: `pn${Date.now()}y` });
    await prisma.tenant.update({ where: { id: f.tenantId }, data: { whatsappTokenEnvKey: "MISSING_TOKEN_ENV" } });
    process.env.WHATSAPP_ACCESS_TOKEN = "";
    try {
      const { config } = await import("../src/config");
      const prev = config.WHATSAPP_ACCESS_TOKEN;
      (config as { WHATSAPP_ACCESS_TOKEN: string }).WHATSAPP_ACCESS_TOKEN = "";
      const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: f.tenantId } });
      await post(inbound(tenant.whatsappPhoneNumberId!, "919444400003", `wamid.in3.${Date.now()}`, { type: "text", text: { body: "Hi" } }));
      await drainWebhookQueue();
      (config as { WHATSAPP_ACCESS_TOKEN: string }).WHATSAPP_ACCESS_TOKEN = prev;
      const out = await prisma.message.findFirstOrThrow({ where: { tenantId: f.tenantId, direction: "OUTBOUND" } });
      expect(out.status).toBe("NOT_CONFIGURED");
    } finally {
      process.env.WHATSAPP_ACCESS_TOKEN = saved;
    }
  });

  it("accepts BSUID-only senders (WhatsApp usernames) and replies using `recipient`, not `to`", async () => {
    const f = await makeTenant({ phoneNumberId: `pn${Date.now()}b` });
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: f.tenantId } });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ messaging_product: "whatsapp", messages: [{ id: `wamid.b${Date.now()}` }] }), { status: 200 }));
    const bsuid = `IN.${Date.now()}ABC`;
    const raw = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{ id: "W", changes: [{ field: "messages", value: { metadata: { phone_number_id: tenant.whatsappPhoneNumberId }, contacts: [{ user_id: bsuid, profile: { name: "Uname", username: "@uname" } }], messages: [{ from_user_id: bsuid, id: `wamid.in.b.${Date.now()}`, timestamp: "1", type: "text", text: { body: "hi" } }] } }] }],
    });
    expect((await post(raw)).status).toBe(200);
    await drainWebhookQueue();
    const citizen = await prisma.citizen.findFirstOrThrow({ where: { tenantId: f.tenantId } });
    expect(citizen.bsuid).toBe(bsuid);
    expect(citizen.phone).toBe(`bsuid:${bsuid}`);
    const sent = fetchMock.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body))).find((b) => b.type === "interactive");
    expect(sent.recipient).toBe(bsuid);
    expect(sent.to).toBeUndefined();

    // Same user later shares a phone number → same citizen record is upgraded, not duplicated
    const raw2 = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{ id: "W", changes: [{ field: "messages", value: { metadata: { phone_number_id: tenant.whatsappPhoneNumberId }, contacts: [{ wa_id: "919555500001", user_id: bsuid }], messages: [{ from: "919555500001", from_user_id: bsuid, id: `wamid.in.b2.${Date.now()}`, timestamp: "1", type: "text", text: { body: "menu" } }] } }] }],
    });
    await post(raw2);
    await drainWebhookQueue();
    const all = await prisma.citizen.findMany({ where: { tenantId: f.tenantId } });
    expect(all).toHaveLength(1);
    expect(all[0].phone).toBe("919555500001");

    // BSUID rotation keeps the same citizen
    const rotated = `${bsuid}-NEW`;
    await post(JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "W", changes: [{ field: "user_id_update", value: { metadata: { phone_number_id: tenant.whatsappPhoneNumberId }, user_id_update: [{ user_id: { previous: bsuid, current: rotated } }] } }] }] }));
    await drainWebhookQueue();
    expect((await prisma.citizen.findUniqueOrThrow({ where: { id: all[0].id } })).bsuid).toBe(rotated);
  });

  it("never downgrades a delivery status, even when status webhooks are processed concurrently", async () => {
    const f = await makeTenant({ phoneNumberId: `pn${Date.now()}c` });
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: f.tenantId } });
    const convo = await prisma.conversation.create({ data: { tenantId: f.tenantId, channel: "WHATSAPP", citizenPhone: "919666600001" } });
    for (let i = 0; i < 12; i++) {
      const wamid = `wamid.race.${f.slug}.${i}`;
      const m = await prisma.message.create({ data: { tenantId: f.tenantId, conversationId: convo.id, direction: "OUTBOUND", channel: "WHATSAPP", externalId: wamid, type: "text", body: "x", status: "SENT" } });
      // arrival order shuffled; all in flight at once
      const order = i % 2 ? ["delivered", "read", "sent"] : ["read", "sent", "delivered"];
      await Promise.all(order.map((st) => post(statusEvent(tenant.whatsappPhoneNumberId!, wamid, st))));
      await drainWebhookQueue();
      expect((await prisma.message.findUniqueOrThrow({ where: { id: m.id } })).status).toBe("READ");
    }
  });

  it("ignores events for unknown phone numbers and unknown payload shapes", async () => {
    expect((await post(inbound("unknown-number", "919", `wamid.x.${Date.now()}`, { type: "text", text: { body: "hi" } }))).status).toBe(200);
    expect((await post(JSON.stringify({ object: "page", entry: [] }))).status).toBe(200);
    await drainWebhookQueue();
  });
});
