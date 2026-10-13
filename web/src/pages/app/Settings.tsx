import { useEffect, useState } from "react";
import { BrainCircuit, CheckCircle2, CircleDashed, Mic, Play, Smartphone } from "lucide-react";
import { api } from "../../lib/api";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../lib/auth";
import type { Meta } from "../../lib/types";
import { Badge, Button, Card, CardHeader, ErrorState, Field, Input, Notice, PageHeader, Select, Spinner } from "../../components/ui";
import { useToast } from "../../components/ui/toast";

interface SettingsResp {
  tenant: Record<string, string | boolean | null>;
  settings: { slaDays: Record<string, number>; escalationAfterOverdueHours: number; retentionMonths: number; mlaCanViewCitizenContact: boolean; privacyNoticeVersion: string };
  integrations: {
    whatsapp: { phoneNumberIdSet: boolean; accessTokenAvailable: boolean; webhookVerifyTokenSet: boolean; appSecretSet: boolean; statusTemplateSet: boolean; graphApiVersion: string; mode: string };
    simulator: { enabled: boolean };
    ai: { provider: string; label: string; live: boolean };
    speechToText: { configured: boolean };
  };
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-[13px]">
      {ok ? <CheckCircle2 className="h-4 w-4 text-teal-600" /> : <CircleDashed className="h-4 w-4 text-slate-400" />}
      <span className={ok ? "text-slate-800" : "text-slate-500"}>{label}</span>
    </div>
  );
}

export default function Settings() {
  const { me } = useAuth();
  const toast = useToast();
  const isAdmin = me?.user.role === "OFFICE_ADMIN";
  const { data, error, loading, reload } = useApi<SettingsResp>("/api/settings");
  const meta = useApi<Meta>("/api/meta");
  const [form, setForm] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    if (data) setForm({ ...data.tenant, ...data.settings, sla: { ...data.settings.slaDays } });
  }, [data]);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data || !form) return null;
  const wa = data.integrations.whatsapp;
  const set = (k: string, v: unknown) => setForm({ ...form, [k]: v });
  const str = (k: string) => (form[k] as string | null) ?? "";

  const save = async () => {
    try {
      await api.patch("/api/settings", {
        officeAddress: str("officeAddress") || null,
        officeHours: str("officeHours") || null,
        officePhone: str("officePhone") || null,
        defaultLanguage: form.defaultLanguage,
        whatsappPhoneNumberId: str("whatsappPhoneNumberId") || null,
        whatsappDisplayNumber: str("whatsappDisplayNumber") || null,
        whatsappBusinessAccountId: str("whatsappBusinessAccountId") || null,
        whatsappTokenEnvKey: str("whatsappTokenEnvKey") || null,
        settings: {
          slaDays: form.sla,
          escalationAfterOverdueHours: Number(form.escalationAfterOverdueHours),
          retentionMonths: Number(form.retentionMonths),
          mlaCanViewCitizenContact: !!form.mlaCanViewCitizenContact,
        },
      });
      toast({ tone: "success", text: "Settings saved" });
      void reload();
    } catch (e) {
      toast({ tone: "error", text: (e as Error).message });
    }
  };

  return (
    <div>
      <PageHeader title="Workspace Settings" subtitle={`${data.tenant.officeName} · ${data.tenant.constituency}`} actions={isAdmin && <Button onClick={save}>Save changes</Button>} />
      {data.tenant.isSampleBranding && (
        <Notice tone="warn" className="mb-4">
          This workspace uses <strong>sample branding</strong>. Real MLA names, photos, logos or designations may only be enabled by the platform administrator after written authorisation is recorded.
        </Notice>
      )}
      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Integrations status" subtitle="Secrets live in server environment variables — never in the database or browser" />
          <div className="grid gap-5 p-5 md:grid-cols-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[13.5px] font-semibold text-navy-900">
                <Smartphone className="h-4 w-4" /> WhatsApp Cloud API
                <Badge className={wa.mode === "LIVE" ? "bg-teal-50 text-teal-800 ring-teal-200" : "bg-amber-50 text-amber-800 ring-amber-200"}>{wa.mode === "LIVE" ? "Live" : "Awaiting credentials"}</Badge>
              </div>
              <Check ok={wa.phoneNumberIdSet} label="Phone number ID set" />
              <Check ok={wa.accessTokenAvailable} label="Access token available (env)" />
              <Check ok={wa.webhookVerifyTokenSet} label="Webhook verify token (env)" />
              <Check ok={wa.appSecretSet} label="App secret for signatures (env)" />
              <Check ok={wa.statusTemplateSet} label="Approved status-update template" />
              <div className="text-[12px] text-slate-500">Graph API {wa.graphApiVersion} · see docs/WHATSAPP_SETUP.md</div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[13.5px] font-semibold text-navy-900">
                <BrainCircuit className="h-4 w-4" /> AI provider
                <Badge className={data.integrations.ai.live ? "bg-teal-50 text-teal-800 ring-teal-200" : "bg-amber-50 text-amber-800 ring-amber-200"}>{data.integrations.ai.live ? "Connected" : "Demo mode"}</Badge>
              </div>
              <p className="text-[13px] text-slate-600">{data.integrations.ai.label}</p>
              <p className="text-[12px] text-slate-500">AI only suggests: it never rejects complaints, decides eligibility, promises benefits or resolves cases.</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[13.5px] font-semibold text-navy-900">
                <Mic className="h-4 w-4" /> Voice & simulator
              </div>
              <Check ok={data.integrations.speechToText.configured} label="Telugu speech-to-text" />
              <Check ok={data.integrations.simulator.enabled} label="Browser WhatsApp simulator enabled" />
              {data.integrations.simulator.enabled && <p className="text-[12px] text-amber-700">Disable the simulator in production (SIMULATOR_ENABLED=false).</p>}
            </div>
          </div>
          {isAdmin && (
            <div className="grid gap-3 border-t border-slate-100 p-5 md:grid-cols-2">
              <Field label="WhatsApp phone number ID" hint="From Meta App Dashboard → WhatsApp → API Setup">
                <Input value={str("whatsappPhoneNumberId")} onChange={(e) => set("whatsappPhoneNumberId", e.target.value)} />
              </Field>
              <Field label="Display number" hint="Shown to staff/citizens, e.g. +91 98xxx xxxxx">
                <Input value={str("whatsappDisplayNumber")} onChange={(e) => set("whatsappDisplayNumber", e.target.value)} />
              </Field>
              <Field label="WhatsApp Business Account ID">
                <Input value={str("whatsappBusinessAccountId")} onChange={(e) => set("whatsappBusinessAccountId", e.target.value)} />
              </Field>
              <Field label="Access-token environment variable name" hint="Name only (e.g. WHATSAPP_TOKEN_SEETHAPURAM). Leave empty to use WHATSAPP_ACCESS_TOKEN.">
                <Input value={str("whatsappTokenEnvKey")} onChange={(e) => set("whatsappTokenEnvKey", e.target.value.toUpperCase())} />
              </Field>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Escalation & SLA rules" subtitle="Due dates are set on assignment from these SLAs" />
          <div className="grid grid-cols-2 gap-3 p-5">
            {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((p) => (
              <Field key={p} label={`${p[0]}${p.slice(1).toLowerCase()} (days)`}>
                <Input type="number" min={1} disabled={!isAdmin} value={(form.sla as Record<string, number>)[p]} onChange={(e) => set("sla", { ...(form.sla as object), [p]: Number(e.target.value) })} />
              </Field>
            ))}
            <div className="col-span-2">
              <Field label="Escalate to MLA after overdue (hours)" hint="Level 1 when overdue → office admin; Level 2 after this many hours → MLA attention">
                <Input type="number" min={1} disabled={!isAdmin} value={form.escalationAfterOverdueHours as number} onChange={(e) => set("escalationAfterOverdueHours", e.target.value)} />
              </Field>
            </div>
            {isAdmin && (
              <Button
                size="sm"
                variant="secondary"
                className="col-span-2"
                icon={<Play className="h-3.5 w-3.5" />}
                onClick={async () => {
                  const r = await api.post<{ escalated: number }>("/api/escalations/run");
                  toast({ tone: "success", text: `Escalation sweep: ${r.escalated} case(s) escalated` });
                }}
              >
                Run escalation sweep now
              </Button>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Office profile" subtitle="Shared with citizens via 'Contact the office'" />
          <div className="space-y-3 p-5">
            <Field label="Address">
              <Input disabled={!isAdmin} value={str("officeAddress")} onChange={(e) => set("officeAddress", e.target.value)} />
            </Field>
            <Field label="Office hours">
              <Input disabled={!isAdmin} value={str("officeHours")} onChange={(e) => set("officeHours", e.target.value)} />
            </Field>
            <Field label="Phone">
              <Input disabled={!isAdmin} value={str("officePhone")} onChange={(e) => set("officePhone", e.target.value)} />
            </Field>
            <Field label="Default bot language">
              <Select disabled={!isAdmin} value={str("defaultLanguage")} onChange={(e) => set("defaultLanguage", e.target.value)}>
                <option value="te">Telugu</option>
                <option value="en">English</option>
              </Select>
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Privacy" subtitle={`Privacy notice version ${data.settings.privacyNoticeVersion}`} />
          <div className="space-y-3 p-5">
            <Field label="Retention period (months)" hint="Closed cases older than this are eligible for anonymisation">
              <Input type="number" min={6} disabled={!isAdmin} value={form.retentionMonths as number} onChange={(e) => set("retentionMonths", e.target.value)} />
            </Field>
            <label className="flex items-start gap-2 text-[13px] text-slate-700">
              <input type="checkbox" disabled={!isAdmin} checked={!!form.mlaCanViewCitizenContact} onChange={(e) => set("mlaCanViewCitizenContact", e.target.checked)} className="mt-0.5 h-4 w-4" />
              Allow the MLA role to view citizen names and reveal phone numbers (explicit authorisation)
            </label>
          </div>
        </Card>

        <Card>
          <CardHeader title="Categories & teams" subtitle="Configurable per workspace" />
          <div className="max-h-80 space-y-1.5 overflow-y-auto p-5 text-[13px]">
            {meta.data?.categories.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2">
                <span>
                  {c.emoji} {c.nameEn} <span className="telugu text-slate-400">· {c.nameTe}</span>
                </span>
                <span className="text-[12px] text-slate-500">{c.defaultTeam?.name ?? "—"} · {c.defaultPriority}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
