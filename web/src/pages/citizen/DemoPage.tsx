import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router";
import {
  Bot,
  BrainCircuit,
  CheckCircle2,
  Code2,
  ExternalLink,
  FlaskConical,
  Mic,
  RefreshCw,
  RotateCcw,
  Shuffle,
  Ticket,
  Wifi,
  WifiOff,
} from "lucide-react";
import { api } from "../../lib/api";
import type { PublicTenant, SystemStatus } from "../../lib/types";
import { PublicHeader } from "../../components/PublicHeader";
import { DemoRibbon } from "../../components/Brand";
import { PhoneFrame } from "../../components/whatsapp/PhoneFrame";
import { SimulatorEvents, WhatsAppApp } from "../../components/whatsapp/WhatsAppApp";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { Card, ErrorState, Select, Spinner } from "../../components/ui";

const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* storage unavailable */
    }
  },
};

/** Fictional demo numbers: 91 90000 xxxxx */
const randomPhone = () => `9190000${String(Math.floor(Math.random() * 100000)).padStart(5, "0")}`;
const pretty = (p: string) => `+${p.slice(0, 2)} ${p.slice(2, 7)} ${p.slice(7)}`;

export default function DemoPage() {
  const [tenants, setTenants] = useState<PublicTenant[] | null>(null);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slug, setSlug] = useState<string | null>(store.get("cos.sim.slug"));
  const [phone, setPhone] = useState<string>(store.get("cos.sim.phone") ?? randomPhone());
  const [events, setEvents] = useState<SimulatorEvents>({ tickets: [] });
  const [quick, setQuick] = useState<{ text: string; nonce: number } | null>(null);
  const [resetNonce, setResetNonce] = useState(0);
  const [showJson, setShowJson] = useState(true);
  const desktop = useMediaQuery("(min-width: 640px)");
  // On a real phone the chat fills whatever is left of the viewport below the page header
  const mobileBox = useRef<HTMLDivElement>(null);
  const [mobileH, setMobileH] = useState(640);
  useLayoutEffect(() => {
    if (desktop) return;
    const calc = () => {
      const top = (mobileBox.current?.getBoundingClientRect().top ?? 100) + window.scrollY;
      setMobileH(Math.max(520, window.innerHeight - top));
    };
    calc();
    window.addEventListener("resize", calc);
    // header/ribbon height changes when web fonts load or text wraps — re-measure
    const ro = new ResizeObserver(calc);
    ro.observe(document.body);
    void document.fonts?.ready.then(calc);
    return () => {
      window.removeEventListener("resize", calc);
      ro.disconnect();
    };
  }, [desktop, tenants, status]);

  useEffect(() => {
    Promise.all([api.get<{ tenants: PublicTenant[] }>("/api/public/tenants"), api.get<SystemStatus>("/api/public/status")])
      .then(([t, s]) => {
        setTenants(t.tenants);
        setStatus(s);
        setSlug((cur) => (cur && t.tenants.some((x) => x.slug === cur) ? cur : t.tenants[0]?.slug ?? null));
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (slug) store.set("cos.sim.slug", slug);
    store.set("cos.sim.phone", phone);
  }, [slug, phone]);

  const onEvents = useCallback((e: SimulatorEvents) => setEvents(e), []);
  const tenant = tenants?.find((t) => t.slug === slug) ?? null;
  const say = (text: string) => setQuick({ text, nonce: Date.now() });

  const phoneApp =
    tenant && status?.simulatorEnabled ? (
      <WhatsAppApp key={`${tenant.slug}:${phone}:${desktop}`} tenant={tenant} phone={phone} framed={desktop} onEvents={onEvents} quickSend={quick} resetNonce={resetNonce} />
    ) : null;

  return (
    <div className="min-h-full bg-[radial-gradient(1200px_600px_at_50%_-10%,#dff4f1_0%,#f6f7f9_55%)]">
      <PublicHeader />
      <DemoRibbon />
      {error && (
        <div className="mx-auto max-w-xl p-6">
          <ErrorState error={`${error}. Is the API server running on port 4000?`} />
        </div>
      )}
      {!tenants && !error && <Spinner label="Starting the simulator…" />}
      {tenants && status && !status.simulatorEnabled && (
        <div className="mx-auto max-w-xl p-6">
          <ErrorState error="The WhatsApp simulator is disabled on this server (SIMULATOR_ENABLED=false)." />
        </div>
      )}

      {tenants && tenant && status?.simulatorEnabled && (
        <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-6 px-0 pb-10 pt-0 sm:px-6 sm:pt-6 lg:grid-cols-[minmax(0,1fr)_auto] xl:grid-cols-[minmax(280px,1fr)_auto_minmax(340px,1fr)]">
          {/* Intro & controls */}
          <section className="order-2 min-w-0 space-y-4 px-4 sm:px-0 lg:order-1 xl:pt-6">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-teal-600/10 px-2.5 py-1 text-[11.5px] font-semibold uppercase tracking-wider text-teal-800">
                <FlaskConical className="h-3.5 w-3.5" /> Citizen experience · simulated WhatsApp
              </div>
              <h1 className="mt-3 text-[28px] font-extrabold leading-tight tracking-tight text-navy-900 sm:text-[32px]">
                Talk to the MLA office <span className="text-teal-700">on WhatsApp</span>
              </h1>
              <p className="mt-2 text-[14.5px] leading-relaxed text-slate-600">
                Register a grievance in <span className="telugu font-medium">తెలుగు</span> or English, share photos and location, get a ticket number and receive status updates — all in chat. This phone runs the{" "}
                <strong>same bot engine</strong> the real WhatsApp Cloud API webhook uses.
              </p>
            </div>

            <Card className="p-4">
              <div className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-slate-500">Try saying</div>
              <div className="flex flex-wrap gap-2">
                {[
                  ["Hi", "Start in any language"],
                  ["నమస్కారం", "Telugu greeting"],
                  ["menu", "Main menu"],
                  ["STOP", "Opt out of updates"],
                  ["START", "Opt back in"],
                ].map(([t, hint]) => (
                  <button key={t} onClick={() => say(t)} title={hint} className="rounded-full bg-[#d9fdd3] px-3.5 py-1.5 text-[13px] font-medium text-[#0b3d2e] ring-1 ring-[#b6e8ad] transition hover:brightness-95">
                    {t}
                  </button>
                ))}
              </div>
            </Card>

            <Card className="space-y-3 p-4">
              <div className="text-[12px] font-semibold uppercase tracking-wider text-slate-500">Demo persona</div>
              <label className="block">
                <span className="mb-1 block text-[13px] font-medium text-slate-700">MLA workspace</span>
                <Select value={slug ?? ""} onChange={(e) => setSlug(e.target.value)}>
                  {tenants.map((t) => (
                    <option key={t.slug} value={t.slug}>
                      {t.officeName}
                    </option>
                  ))}
                </Select>
              </label>
              <div>
                <span className="mb-1 block text-[13px] font-medium text-slate-700">Citizen's WhatsApp number (fictional)</span>
                <div className="flex gap-2">
                  <div className="flex h-10 flex-1 items-center rounded-lg bg-slate-50 px-3 font-mono text-sm text-slate-800 ring-1 ring-slate-200">{pretty(phone)}</div>
                  <button onClick={() => setPhone(randomPhone())} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-white px-3 text-[13px] font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50" title="New citizen">
                    <Shuffle className="h-4 w-4" /> New
                  </button>
                </div>
                <p className="mt-1 text-[12px] text-slate-500">Each number is a separate citizen with its own chat and complaints.</p>
              </div>
              <button onClick={() => setResetNonce(Date.now())} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-red-600 hover:underline">
                <RotateCcw className="h-3.5 w-3.5" /> Clear this chat (complaints already filed are kept)
              </button>
            </Card>
          </section>

          {/* Phone */}
          <section className="order-1 min-w-0 lg:order-2" aria-label="Simulated iPhone running WhatsApp">
            {desktop ? (
              <div className="px-2">
                <PhoneFrame>{phoneApp}</PhoneFrame>
                <p className="mt-3 text-center text-[12px] text-slate-500">Simulated iPhone · not connected to WhatsApp</p>
              </div>
            ) : (
              <div ref={mobileBox} className="w-full" style={{ height: mobileH }}>{phoneApp}</div>
            )}
          </section>

          {/* Live system panel */}
          <section className="order-3 min-w-0 space-y-4 px-4 sm:px-0 lg:col-span-2 xl:col-span-1 xl:pt-6">
            <Card className="p-4">
              <div className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-slate-500">What's real in this demo</div>
              <ul className="space-y-2.5 text-[13px]">
                <li className="flex gap-2.5">
                  <Bot className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
                  <span><strong>Bot engine & database — live.</strong> Every message is processed by the server; complaints, tickets and updates are stored in PostgreSQL.</span>
                </li>
                <li className="flex gap-2.5">
                  {tenant.whatsappLive ? <Wifi className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" /> : <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
                  <span>
                    <strong>WhatsApp — {tenant.whatsappLive ? "live number configured" : "simulated"}.</strong>{" "}
                    {tenant.whatsappLive
                      ? `Real citizens reach this workspace at ${tenant.whatsappDisplayNumber ?? "its configured number"}; this phone stays a simulation.`
                      : "Replies are stored with status SIMULATED and never sent. Connect the Cloud API to go live (docs/WHATSAPP_SETUP.md)."}
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <BrainCircuit className={`mt-0.5 h-4 w-4 shrink-0 ${status.ai.live ? "text-teal-700" : "text-amber-600"}`} />
                  <span>
                    <strong>AI — {status.ai.live ? "connected" : "demo mode"}.</strong> {status.ai.label}.
                  </span>
                </li>
                <li className="flex gap-2.5">
                  <Mic className={`mt-0.5 h-4 w-4 shrink-0 ${status.speechToText ? "text-teal-700" : "text-slate-400"}`} />
                  <span>
                    <strong>Voice notes — {status.speechToText ? "transcribed" : "integration point only"}.</strong> {status.speechToText ? "Telugu/English speech-to-text is configured." : "The bot explains that voice is unavailable and asks the citizen to type."}
                  </span>
                </li>
              </ul>
            </Card>

            <Card className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-[12px] font-semibold uppercase tracking-wider text-slate-500">Tickets from this chat</div>
                <Ticket className="h-4 w-4 text-slate-400" />
              </div>
              {events.tickets.length === 0 ? (
                <p className="text-[13px] text-slate-500">Register a complaint in the phone — its ticket number appears here with links to the office console.</p>
              ) : (
                <ul className="space-y-2">
                  {events.tickets.map((t) => (
                    <li key={t} className="flex items-center justify-between gap-2 rounded-lg bg-teal-50 px-3 py-2 ring-1 ring-teal-100">
                      <span className="flex items-center gap-2 font-mono text-[13px] font-semibold text-teal-900">
                        <CheckCircle2 className="h-4 w-4 text-teal-600" /> {t}
                      </span>
                      <span className="flex gap-3 text-[12.5px] font-medium">
                        <a className="text-navy-700 hover:underline" href={`/app/grievances?q=${t}`} target="_blank" rel="noreferrer">
                          Office console
                        </a>
                        <a className="text-navy-700 hover:underline" href={`/track?w=${tenant.slug}&t=${t}`} target="_blank" rel="noreferrer">
                          Track
                        </a>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="overflow-hidden">
              <button onClick={() => setShowJson((s) => !s)} className="flex w-full items-center justify-between px-4 py-3 text-left">
                <span className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-slate-500">
                  <Code2 className="h-4 w-4" /> Cloud API payload of last reply
                </span>
                <span className="text-[12px] text-slate-400">{showJson ? "Hide" : "Show"}</span>
              </button>
              {showJson && (
                <div className="border-t border-slate-100">
                  <p className="px-4 pt-3 text-[12px] leading-relaxed text-slate-500">
                    The exact body for <code className="rounded bg-slate-100 px-1">POST /{status.graphApiVersion}/&#123;phone-number-id&#125;/messages</code>. In simulation it is stored for review, not sent.
                  </p>
                  <pre className="scrollbar-thin m-3 max-h-72 overflow-auto rounded-lg bg-navy-950 p-3 text-[11.5px] leading-relaxed text-teal-100">
                    {events.lastBot?.payload.cloudApi ? JSON.stringify(events.lastBot.payload.cloudApi, null, 2) : "// Send a message to see the payload"}
                  </pre>
                </div>
              )}
            </Card>

            <Card className="p-4">
              <div className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-slate-500">End-to-end demo script</div>
              <ol className="space-y-2 text-[13px] text-slate-700">
                {[
                  <>Say <b>Hi</b>, pick a language and <b>Register a complaint</b> — note the ticket number.</>,
                  <>
                    <Link className="font-medium text-navy-700 underline" to="/login?as=admin" target="_blank">Sign in as Office Admin</Link> → open the ticket → <b>Assign</b> a team and field officer.
                  </>,
                  <>Watch this phone: the citizen receives the "assigned" update.</>,
                  <>
                    <Link className="font-medium text-navy-700 underline" to="/login?as=field" target="_blank">Sign in as Field Officer</Link> → mark <b>In progress</b>, add inspection notes and before/after photos, report work complete.
                  </>,
                  <>Admin marks <b>Resolved</b> → the citizen gets "Has your problem been solved?" → tap 👍 and rate.</>,
                  <>
                    <Link className="font-medium text-navy-700 underline" to="/login?as=mla" target="_blank">Sign in as MLA</Link> → Command Center updates from the database; ask Constituency AI for the Monday review.
                  </>,
                ].map((s, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-navy-900 text-[11px] font-bold text-white">{i + 1}</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
              <a href="/" onClick={(e) => { e.preventDefault(); window.location.reload(); }} className="mt-3 inline-flex items-center gap-1 text-[12px] text-slate-500 hover:underline">
                <RefreshCw className="h-3 w-3" /> Reload simulator
              </a>
              <a href={`/privacy/${tenant.slug}`} className="ml-4 mt-3 inline-flex items-center gap-1 text-[12px] text-slate-500 hover:underline">
                Privacy notice <ExternalLink className="h-3 w-3" />
              </a>
            </Card>
          </section>
        </div>
      )}
    </div>
  );
}
