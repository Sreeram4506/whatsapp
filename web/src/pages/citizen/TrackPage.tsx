import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { CircleCheck, Search } from "lucide-react";
import { api } from "../../lib/api";
import { fmtDate, STATUS_META } from "../../lib/format";
import type { PublicTenant } from "../../lib/types";
import { PublicHeader } from "../../components/PublicHeader";
import { Button, Card, Field, Input, Notice, Select, StatusBadge } from "../../components/ui";

interface TrackResult {
  ticket: string;
  status: string;
  statusLabel: { en: string; te: string };
  category: { en: string; te: string };
  village: string | null;
  mandal: string;
  team: string | null;
  createdAt: string;
  updatedAt: string;
  timeline: { createdAt: string; message: string; toStatus: string | null; kind: string }[];
}

export default function TrackPage() {
  const [params] = useSearchParams();
  const [tenants, setTenants] = useState<PublicTenant[]>([]);
  const [slug, setSlug] = useState(params.get("w") ?? "");
  const [ticket, setTicket] = useState(params.get("t") ?? "");
  const [last4, setLast4] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TrackResult | null>(null);

  useEffect(() => {
    api.get<{ tenants: PublicTenant[] }>("/api/public/tenants").then((r) => {
      setTenants(r.tenants);
      setSlug((s) => s || r.tenants[0]?.slug || "");
    });
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.post<TrackResult>("/api/public/track", { slug, ticket, phoneLast4: last4 }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-full">
      <PublicHeader />
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-[26px] font-extrabold tracking-tight text-navy-900">Track your complaint</h1>
        <p className="mt-1 text-[14px] text-slate-600">
          <span className="telugu">మీ ఫిర్యాదు స్థితి తెలుసుకోండి</span> · Enter your ticket number and the last 4 digits of the mobile number you used.
        </p>
        <Card className="mt-6 p-5">
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="MLA office">
                <Select value={slug} onChange={(e) => setSlug(e.target.value)}>
                  {tenants.map((t) => (
                    <option key={t.slug} value={t.slug}>
                      {t.officeName}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Ticket number">
              <Input value={ticket} onChange={(e) => setTicket(e.target.value.toUpperCase())} placeholder="COS-2026-000123" required className="font-mono" />
            </Field>
            <Field label="Last 4 digits of mobile">
              <Input value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" required pattern="\d{4}" />
            </Field>
            <Button type="submit" loading={busy} className="sm:col-span-2" icon={<Search className="h-4 w-4" />}>
              Check status
            </Button>
          </form>
        </Card>
        {error && <Notice tone="warn" className="mt-4">{error}</Notice>}
        {result && (
          <Card className="mt-6 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-navy-900 px-5 py-4 text-white">
              <div>
                <div className="font-mono text-[17px] font-bold">{result.ticket}</div>
                <div className="text-[12.5px] text-navy-100/80">
                  {result.category.en} · {result.village ?? "—"}, {result.mandal}
                </div>
              </div>
              <StatusBadge status={result.status} />
            </div>
            <div className="p-5">
              <p className="text-[14px] text-slate-700">
                <strong>{result.statusLabel.en}</strong> <span className="telugu text-slate-500">· {result.statusLabel.te}</span>
              </p>
              {result.team && <p className="mt-1 text-[13px] text-slate-500">Handled by: {result.team}</p>}
              <ol className="mt-5 space-y-4 border-l-2 border-teal-100 pl-5">
                {result.timeline.map((u, i) => (
                  <li key={i} className="relative">
                    <CircleCheck className="absolute -left-[29px] top-0 h-4 w-4 rounded-full bg-white text-teal-600" />
                    <div className="text-[12px] text-slate-500">
                      {fmtDate(u.createdAt, true)}
                      {u.toStatus && ` · ${STATUS_META[u.toStatus]?.label}`}
                    </div>
                    <div className="text-[13.5px] text-slate-800">{u.message}</div>
                  </li>
                ))}
              </ol>
              <p className="mt-5 text-[12px] text-slate-500">This page shows only citizen-visible updates. Internal notes and personal details are never shown here.</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
