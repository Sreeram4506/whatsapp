import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  BadgeInfo,
  Camera,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  Ellipsis,
  ExternalLink,
  FlaskConical,
  Landmark,
  Lock,
  MapPin,
  MessageCircle,
  Mic,
  Phone as PhoneIcon,
  Plus,
  RotateCcw,
  Settings as SettingsIcon,
  ShieldCheck,
  Smile,
  Square,
  Trash2,
  X,
} from "lucide-react";
import type { PublicTenant } from "../../lib/types";
import { fmtTime } from "../../lib/format";
import { BotBubble, CitizenBubble, DateChip, TypingBubble } from "./Bubbles";
import { AttachSheet, EmojiTray, ListSheet } from "./Sheets";
import { StatusBar } from "./PhoneFrame";
import { stripWa } from "./format";
import type { BotContent, ReplyButton, SimMessage } from "./types";
import { useSimulator } from "./useSimulator";

const GLOBAL_IDS = ["menu:", "nav:", "fb:", "info:", "lang:"];
const IOS_GREEN = "#25d366";
const IOS_TINT = "#00a884";

function Avatar({ size = 40 }: { name?: string; size?: number }) {
  return (
    <div className="flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-600 to-navy-800 text-white" style={{ width: size, height: size }} aria-hidden>
      <Landmark style={{ width: size * 0.5, height: size * 0.5 }} />
    </div>
  );
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(Date.now() - 86400000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Today";
  if (same(d, y)) return "Yesterday";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

export interface SimulatorEvents {
  lastBot?: SimMessage;
  tickets: string[];
}

interface Props {
  tenant: PublicTenant;
  phone: string;
  /** true when drawn inside the iPhone frame (adds status-bar / home-indicator spacing) */
  framed?: boolean;
  onEvents?: (e: SimulatorEvents) => void;
  quickSend?: { text: string; nonce: number } | null;
  resetNonce?: number;
}

const MAX_BYTES = 5 * 1024 * 1024;

export function WhatsAppApp({ tenant, phone, framed = true, onEvents, quickSend, resetNonce }: Props) {
  const sim = useSimulator(tenant.slug, phone);
  const [screen, setScreen] = useState<"chats" | "chat" | "info">("chat");
  const [text, setText] = useState("");
  const [listSheet, setListSheet] = useState<Extract<BotContent, { kind: "list" }> | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [banner, setBanner] = useState<SimMessage | null>(null);
  const [unread, setUnread] = useState(0);
  const [recording, setRecording] = useState<{ startedAt: number } | null>(null);
  const [, forceTick] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const scroller = useRef<HTMLDivElement>(null);
  const fileDoc = useRef<HTMLInputElement>(null);
  const fileImg = useRef<HTMLInputElement>(null);
  const fileCam = useRef<HTMLInputElement>(null);
  const screenRef = useRef(screen);
  screenRef.current = screen;

  const msgs = sim.messages;
  const topPad = framed ? 54 : undefined; // iOS status bar height
  const topStyle = { paddingTop: framed ? topPad : "env(safe-area-inset-top)" };
  const bottomStyle = { paddingBottom: framed ? 28 : "max(10px, env(safe-area-inset-bottom))" };

  // Report events to the demo studio panel
  useEffect(() => {
    const lastBot = [...msgs].reverse().find((m) => m.direction === "OUTBOUND");
    const tickets = new Set<string>();
    for (const m of msgs) {
      const body = m.payload.content?.body ?? "";
      if (/Complaint registered|ఫిర్యాదు నమోదైంది/.test(body)) {
        const t = body.match(/[A-Z]{2,6}-\d{4}-\d{6}/);
        if (t) tickets.add(t[0]);
      }
    }
    onEvents?.({ lastBot, tickets: [...tickets] });
  }, [msgs, onEvents]);

  useEffect(() => {
    if (screen !== "chat") return;
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [msgs.length, sim.typing, screen]);

  // Office-initiated notifications (arrive via polling)
  useEffect(() => {
    if (!sim.incoming.length) return;
    const latest = sim.incoming[sim.incoming.length - 1];
    if (screenRef.current !== "chat") setUnread((u) => u + sim.incoming.length);
    setBanner(latest);
    sim.clearIncoming();
    const id = setTimeout(() => setBanner(null), 6000);
    return () => clearTimeout(id);
  }, [sim.incoming]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (quickSend?.text) {
      setScreen("chat");
      void sim.send({ kind: "text", text: quickSend.text });
    }
  }, [quickSend?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (resetNonce) void sim.reset();
  }, [resetNonce]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (sim.error) setToast(sim.error);
  }, [sim.error]);

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => forceTick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [recording]);

  const lastInboundIdx = useMemo(() => {
    for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].direction === "INBOUND") return i;
    return -1;
  }, [msgs]);

  const isInteractive = (idx: number, m: SimMessage) => {
    if (idx > lastInboundIdx) return !sim.typing;
    const c = m.payload.content;
    if (!c || c.kind === "text") return false;
    if (c.kind === "buttons") return c.buttons.every((b) => GLOBAL_IDS.some((g) => b.id.startsWith(g)));
    return false;
  };

  const sendText = () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    setEmojiOpen(false);
    void sim.send({ kind: "text", text: t });
  };

  const onButton = (b: ReplyButton) => void sim.send({ kind: "reply", id: b.id, title: b.title });

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    setAttachOpen(false);
    if (!f) return;
    if (f.size > MAX_BYTES) return setToast("File is larger than 5 MB");
    void sim.uploadAndSend(f);
  };

  const shareLocation = () => {
    setAttachOpen(false);
    if (!navigator.geolocation) return setToast("Location is not available in this browser");
    setToast("Requesting your location…");
    navigator.geolocation.getCurrentPosition(
      (pos) => void sim.send({ kind: "location", latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => setToast("Location permission was not granted — nothing was shared"),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      return setToast("Voice recording is not supported in this browser");
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (ev) => ev.data.size && chunks.current.push(ev.data);
      rec.onstop = () => stream.getTracks().forEach((t) => t.stop());
      rec.start();
      recorder.current = rec;
      setRecording({ startedAt: Date.now() });
    } catch {
      setToast("Microphone permission was not granted");
    }
  };

  const stopRecording = (sendIt: boolean) => {
    const rec = recorder.current;
    if (!rec) return;
    rec.onstop = () => {
      rec.stream.getTracks().forEach((t) => t.stop());
      if (sendIt && chunks.current.length) {
        void sim.sendVoice(new Blob(chunks.current, { type: rec.mimeType.split(";")[0] || "audio/webm" }));
      }
    };
    rec.stop();
    recorder.current = null;
    setRecording(null);
  };

  const lastMsg = [...msgs].reverse().find((m) => !m.pending);
  const preview = lastMsg
    ? lastMsg.direction === "OUTBOUND"
      ? stripWa(lastMsg.payload.content?.body ?? "")
      : lastMsg.payload.input?.kind === "text"
        ? lastMsg.payload.input.text
        : lastMsg.payload.input?.kind === "reply"
          ? lastMsg.payload.input.title
          : "📎 Attachment"
    : "Tap to chat with the helpdesk";

  const mediaUrl = (id: string) => `/api/simulator/${tenant.slug}/media/${id}?phone=${phone}`;
  const showSend = !!recording || !!text.trim();

  return (
    <div className="ios-font relative flex h-full w-full flex-col overflow-hidden bg-white text-black">
      {framed && <StatusBar />}

      {/* iOS notification banner */}
      {banner && (
        <button
          type="button"
          onClick={() => {
            setBanner(null);
            setUnread(0);
            setScreen("chat");
          }}
          style={{ top: framed ? 58 : 10 }}
          className="animate-slide-down absolute left-2.5 right-2.5 z-50 flex items-start gap-3 rounded-[24px] bg-[#f2f2f7]/90 p-3.5 text-left shadow-[0_10px_34px_rgba(0,0,0,0.28)] ring-1 ring-black/5 backdrop-blur-xl"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#25d366] text-white">
            <MessageCircle className="h-6 w-6 fill-white" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <span className="truncate text-[15px] font-semibold text-black">{tenant.officeName}</span>
              <span className="pl-2 text-[12.5px] text-[#8e8e93]">now</span>
            </div>
            <div className="text-[11.5px] uppercase tracking-wide text-[#8e8e93]">WhatsApp · simulated</div>
            <div className="line-clamp-2 text-[14px] leading-[18px] text-black/85">{stripWa(banner.payload.content?.body ?? "")}</div>
          </div>
        </button>
      )}

      {/* ───────── Chats list ───────── */}
      {screen === "chats" && (
        <div className="flex flex-1 flex-col bg-white" style={topStyle}>
          <div className="px-4 pb-2 pt-2">
            <div className="flex items-center justify-between">
              <h2 className="text-[34px] font-bold leading-[1.15] tracking-tight">Chats</h2>
              <span className="flex items-center gap-1 rounded-full bg-[#e8f5ef] px-2.5 py-1 text-[12px] font-medium text-[#0b6b4f]">
                <FlaskConical className="h-3.5 w-3.5" /> Simulator
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setUnread(0);
              setScreen("chat");
            }}
            className="flex items-center gap-3 px-4 py-2.5 text-left active:bg-[#f2f2f7]"
          >
            <Avatar size={54} />
            <div className="min-w-0 flex-1 border-b border-black/[0.08] pb-2.5">
              <div className="flex items-center justify-between">
                <span className="truncate text-[17px] font-semibold">{tenant.officeName}</span>
                <span className={`pl-2 text-[13px] ${unread ? "text-[#25d366]" : "text-[#8e8e93]"}`}>{lastMsg ? fmtTime(lastMsg.createdAt) : ""}</span>
              </div>
              <div className="mt-0.5 flex items-center gap-1">
                {lastMsg?.direction === "INBOUND" && <CheckCheck className="h-4 w-4 shrink-0 text-wa-tick" />}
                <span className="line-clamp-2 flex-1 text-[15px] leading-[19px] text-[#8e8e93]">{preview}</span>
                {unread > 0 && <span className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-[#25d366] px-1.5 text-[13px] font-semibold text-white">{unread}</span>}
              </div>
            </div>
          </button>
          <div className="px-8 pt-6 text-center text-[12.5px] leading-relaxed text-[#8e8e93]">
            <Lock className="mr-1 inline h-3 w-3" />
            Simulated iPhone for demonstrations. Messages are processed by the ConstituencyOS server and are not sent through WhatsApp.
          </div>
          <TabBar active="chats" unread={unread} onChats={() => undefined} onSettings={() => setScreen("info")} framed={framed} />
        </div>
      )}

      {/* ───────── Business info ───────── */}
      {screen === "info" && (
        <div className="flex flex-1 flex-col bg-[#f2f2f7]" style={topStyle}>
          <div className="relative flex h-[46px] shrink-0 items-center justify-center border-b border-black/10 bg-[#f7f7f7]">
            <button type="button" onClick={() => setScreen("chat")} className="absolute left-1 flex items-center text-[17px]" style={{ color: IOS_TINT }}>
              <ChevronLeft className="h-7 w-7" strokeWidth={2.4} /> Chat
            </button>
            <span className="text-[17px] font-semibold">Business info</span>
          </div>
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pb-[30px]">
            <div className="flex flex-col items-center bg-white pb-5 pt-5">
              <Avatar size={90} />
              <div className="mt-3 px-6 text-center text-[20px] font-semibold">{tenant.officeName}</div>
              <div className="text-[14px] text-[#8e8e93]">Business account · citizen helpdesk</div>
            </div>
            {tenant.isSampleBranding && (
              <div className="mx-4 mt-3 rounded-xl bg-amber-50 p-3 text-[12.5px] leading-snug text-amber-900 ring-1 ring-amber-200">
                <strong>Sample branding.</strong> This is a demonstration workspace. It is not an official account of any MLA and does not imply endorsement.
              </div>
            )}
            <div className="mx-4 mt-4 divide-y divide-black/[0.07] overflow-hidden rounded-xl bg-white">
              {[
                { icon: BadgeInfo, label: "Constituency", value: `${tenant.constituency}, ${tenant.district}` },
                { icon: MapPin, label: "Address", value: tenant.officeAddress ?? "—" },
                { icon: Clock, label: "Office hours", value: tenant.officeHours ?? "—" },
                { icon: PhoneIcon, label: "Phone", value: tenant.officePhone ?? "—" },
              ].map((r) => (
                <div key={r.label} className="flex gap-3.5 px-4 py-3">
                  <r.icon className="mt-0.5 h-5 w-5 shrink-0 text-[#8e8e93]" />
                  <div>
                    <div className="text-[15px]">{r.value}</div>
                    <div className="text-[12.5px] text-[#8e8e93]">{r.label}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mx-4 mt-4 divide-y divide-black/[0.07] overflow-hidden rounded-xl bg-white">
              <a href={`/privacy/${tenant.slug}`} target="_blank" rel="noreferrer" className="flex items-center gap-3.5 px-4 py-3.5 text-[15.5px] active:bg-[#f2f2f7]">
                <ShieldCheck className="h-5 w-5 text-[#25d366]" /> Privacy notice <ExternalLink className="ml-auto h-4 w-4 text-[#c7c7cc]" />
              </a>
              <a href={`/track?w=${tenant.slug}`} target="_blank" rel="noreferrer" className="flex items-center gap-3.5 px-4 py-3.5 text-[15.5px] active:bg-[#f2f2f7]">
                <ChevronRight className="h-5 w-5 text-[#8e8e93]" /> Track a complaint online <ExternalLink className="ml-auto h-4 w-4 text-[#c7c7cc]" />
              </a>
            </div>
            <div className="mx-4 mt-4 overflow-hidden rounded-xl bg-white">
              <button
                type="button"
                onClick={() => {
                  void sim.reset();
                  setScreen("chat");
                }}
                className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left text-[15.5px] text-[#ff3b30] active:bg-[#f2f2f7]"
              >
                <Trash2 className="h-5 w-5" /> Clear simulated chat
              </button>
            </div>
            <p className="px-8 py-5 text-center text-[12px] leading-relaxed text-[#8e8e93]">
              {tenant.whatsappLive
                ? `This workspace also has a live WhatsApp number (${tenant.whatsappDisplayNumber ?? "configured"}). This simulator stays separate from it.`
                : "No live WhatsApp number is connected to this workspace yet. See docs/WHATSAPP_SETUP.md."}
            </p>
          </div>
        </div>
      )}

      {/* ───────── Chat ───────── */}
      {screen === "chat" && (
        <>
          <div className="relative z-20 shrink-0 border-b border-black/10 bg-[#f7f7f7]" style={topStyle}>
            <div className="flex h-[50px] items-center gap-1 pl-1 pr-2">
              <button type="button" onClick={() => setScreen("chats")} aria-label="Back to chats" className="flex items-center py-1 pr-1" style={{ color: IOS_TINT }}>
                <ChevronLeft className="h-8 w-8" strokeWidth={2.2} />
                {unread > 0 && <span className="-ml-1 mr-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#25d366] px-1.5 text-[12px] font-semibold text-white">{unread}</span>}
              </button>
              <button type="button" onClick={() => setScreen("info")} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                <Avatar size={36} />
                <span className="min-w-0">
                  <span className="block truncate text-[16.5px] font-semibold leading-tight">{tenant.officeName}</span>
                  <span className="block truncate text-[12.5px] leading-tight text-[#8e8e93]">{sim.typing ? "typing…" : "Business account"}</span>
                </span>
              </button>
              <div className="relative">
                <button type="button" onClick={() => setMenuOpen((o) => !o)} aria-label="More" className="rounded-full p-2" style={{ color: IOS_TINT }}>
                  <Ellipsis className="h-6 w-6" />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-11 z-40 w-52 overflow-hidden rounded-[14px] bg-white/95 text-[16px] shadow-[0_10px_34px_rgba(0,0,0,0.25)] ring-1 ring-black/5 backdrop-blur" onMouseLeave={() => setMenuOpen(false)}>
                    {[
                      ["Business info", () => setScreen("info")],
                      ["Show menu", () => void sim.send({ kind: "text", text: "menu" })],
                      ["Clear chat", () => void sim.reset()],
                    ].map(([label, fn]) => (
                      <button key={label as string} type="button" className="block w-full border-b border-black/[0.07] px-4 py-3 text-left last:border-b-0 active:bg-black/5" onClick={() => { setMenuOpen(false); (fn as () => void)(); }}>
                        {label as string}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Messages */}
          <div ref={scroller} className="wa-wallpaper scrollbar-thin relative min-h-0 flex-1 overflow-y-auto pb-3 pt-1" onClick={() => { setMenuOpen(false); setEmojiOpen(false); }}>
            <div className="mx-auto mt-2 flex max-w-[92%] justify-center">
              <button type="button" onClick={() => setScreen("info")} className="rounded-[12px] bg-wa-chip px-3 py-1.5 text-center text-[12.5px] leading-snug text-[#54656f] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
                <Lock className="mr-1 inline h-3 w-3 -translate-y-px" />
                <strong>Simulation mode.</strong> Messages here are processed by the ConstituencyOS server and are <strong>not</strong> sent through WhatsApp. Tap for info.
              </button>
            </div>

            {sim.loaded && msgs.length === 0 && (
              <div className="mx-6 mt-6 rounded-2xl bg-white/90 p-4 text-center text-[14px] leading-relaxed text-[#3b4a54] shadow-sm">
                Say <strong>Hi</strong> or <strong className="telugu">నమస్కారం</strong> to start chatting with the citizen helpdesk.
                <div className="mt-3 flex justify-center gap-2">
                  {["Hi", "నమస్కారం"].map((t) => (
                    <button key={t} type="button" onClick={() => void sim.send({ kind: "text", text: t })} className="rounded-full bg-[#25d366] px-5 py-2 text-[14.5px] font-semibold text-white active:brightness-95">
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {msgs.map((m, i) => {
              const prev = msgs[i - 1];
              const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
              const first = !prev || prev.direction !== m.direction || newDay;
              return (
                <div key={m.id}>
                  {newDay && <DateChip label={dayLabel(m.createdAt)} />}
                  {m.direction === "OUTBOUND" ? (
                    <BotBubble m={m} first={first} interactive={isInteractive(i, m)} onButton={onButton} onOpenList={setListSheet} />
                  ) : (
                    <CitizenBubble m={m} first={first} read={i < lastInboundIdx || (i === lastInboundIdx && msgs.length - 1 > i)} mediaUrl={mediaUrl} />
                  )}
                </div>
              );
            })}
            {sim.typing && <TypingBubble />}
          </div>

          {/* iOS composer */}
          <div className="relative z-20 shrink-0 border-t border-black/10 bg-[#f7f7f7] px-2 pt-2" style={bottomStyle}>
            <div className="flex items-end gap-2">
              {!recording && (
                <button type="button" onClick={() => setAttachOpen((o) => !o)} aria-label="Attach" className="mb-[2px] flex h-[34px] w-[34px] shrink-0 items-center justify-center text-[#8e8e93]">
                  <Plus className="h-[30px] w-[30px]" strokeWidth={1.6} />
                </button>
              )}
              {recording ? (
                <div className="flex min-h-[38px] flex-1 items-center gap-3 rounded-[19px] border border-[#d1d1d6] bg-white px-4">
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#ff3b30]" />
                  <span className="text-[16px] tabular-nums">
                    {Math.floor((Date.now() - recording.startedAt) / 60000)}:{String(Math.floor(((Date.now() - recording.startedAt) / 1000) % 60)).padStart(2, "0")}
                  </span>
                  <span className="flex-1 text-[13.5px] text-[#8e8e93]">Recording voice note…</span>
                  <button type="button" onClick={() => stopRecording(false)} aria-label="Discard recording" className="rounded-full p-1 text-[#8e8e93]">
                    <X className="h-5 w-5" />
                  </button>
                </div>
              ) : (
                <div className="flex min-h-[38px] flex-1 items-end rounded-[19px] border border-[#d1d1d6] bg-white pl-3.5 pr-1.5">
                  <textarea
                    rows={1}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendText();
                      }
                    }}
                    placeholder="Message"
                    aria-label="Message"
                    className="max-h-28 min-h-[38px] flex-1 resize-none bg-transparent py-[8px] text-[17px] leading-[22px] outline-none placeholder:text-[#aeaeb2]"
                  />
                  <button type="button" onClick={() => setEmojiOpen((o) => !o)} aria-label="Emoji" className="mb-[5px] p-1 text-[#8e8e93]">
                    <Smile className="h-[26px] w-[26px]" strokeWidth={1.6} />
                  </button>
                </div>
              )}
              {showSend ? (
                <button
                  type="button"
                  onClick={() => (recording ? stopRecording(true) : sendText())}
                  aria-label={recording ? "Send voice note" : "Send"}
                  className="mb-[2px] flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-white active:scale-95"
                  style={{ background: IOS_GREEN }}
                >
                  <ArrowUp className="h-5 w-5" strokeWidth={2.8} />
                </button>
              ) : (
                <>
                  <button type="button" onClick={() => fileCam.current?.click()} aria-label="Camera" className="mb-[2px] flex h-[34px] w-[30px] shrink-0 items-center justify-center text-[#8e8e93]">
                    <Camera className="h-[26px] w-[26px]" strokeWidth={1.6} />
                  </button>
                  <button type="button" onClick={() => void startRecording()} aria-label="Record voice note" className="mb-[2px] flex h-[34px] w-[30px] shrink-0 items-center justify-center text-[#8e8e93]">
                    <Mic className="h-[26px] w-[26px]" strokeWidth={1.6} />
                  </button>
                </>
              )}
            </div>
            {recording && (
              <button type="button" onClick={() => stopRecording(true)} className="sr-only">
                <Square /> Stop
              </button>
            )}
            {emojiOpen && <EmojiTray onPick={(e) => setText((t) => t + e)} />}
          </div>

          {attachOpen && (
            <AttachSheet
              onClose={() => setAttachOpen(false)}
              onDocument={() => fileDoc.current?.click()}
              onGallery={() => fileImg.current?.click()}
              onCamera={() => fileCam.current?.click()}
              onLocation={shareLocation}
            />
          )}
          {listSheet && (
            <ListSheet
              content={listSheet}
              onClose={() => setListSheet(null)}
              onSelect={(row) => {
                setListSheet(null);
                void sim.send({ kind: "reply", id: row.id, title: row.title });
              }}
            />
          )}
        </>
      )}

      <input ref={fileDoc} type="file" accept="application/pdf" hidden onChange={onFile} />
      <input ref={fileImg} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onFile} />
      <input ref={fileCam} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />

      {toast && (
        <div className="absolute bottom-28 left-1/2 z-50 max-w-[85%] -translate-x-1/2 rounded-full bg-[#1c1c1e]/90 px-4 py-2 text-center text-[13.5px] text-white shadow-lg backdrop-blur" role="status">
          {toast}
        </div>
      )}
      {!sim.loaded && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60">
          <RotateCcw className="h-6 w-6 animate-spin" style={{ color: IOS_GREEN }} />
        </div>
      )}
    </div>
  );
}

function TabBar({ active, unread, onChats, onSettings, framed }: { active: "chats" | "settings"; unread: number; onChats: () => void; onSettings: () => void; framed: boolean }) {
  const tab = (key: "chats" | "settings", label: string, icon: React.ReactNode, onClick: () => void, badge?: number) => (
    <button key={key} type="button" onClick={onClick} className={`relative flex flex-1 flex-col items-center gap-0.5 pt-2 text-[10.5px] font-medium ${active === key ? "text-[#25d366]" : "text-[#8e8e93]"}`}>
      {icon}
      {label}
      {!!badge && <span className="absolute left-[56%] top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#ff3b30] px-1 text-[11px] font-semibold text-white">{badge}</span>}
    </button>
  );
  return (
    <div className="mt-auto flex border-t border-black/10 bg-[#f7f7f7]/95 backdrop-blur" style={{ paddingBottom: framed ? 24 : "env(safe-area-inset-bottom)" }}>
      {tab("chats", "Chats", <MessageCircle className="h-[26px] w-[26px]" strokeWidth={active === "chats" ? 2.4 : 1.8} />, onChats, unread)}
      {tab("settings", "Business info", <SettingsIcon className="h-[26px] w-[26px]" strokeWidth={1.8} />, onSettings)}
    </div>
  );
}
