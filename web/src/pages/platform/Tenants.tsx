import { useState } from "react";
import { Building2, Plus, ShieldAlert } from "lucide-react";
import { api } from "../../lib/api";
import { useApi } from "../../hooks/useApi";
import { fmtDate } from "../../lib/format";
import { Badge, Button, Card, ErrorState, Field, Input, Modal, Notice, PageHeader, Select, Spinner, Textarea } from "../../components/ui";
import { useToast } from "../../components/ui/toast";

interface TenantRow {
  id: string;
  slug: string;
  officeName: string;
  mlaName: string;
  constituency: string;
  district: string;
  isSampleBranding: boolean;
  isDemoData: boolean;
  ticketPrefix: string;
  active: boolean;
  whatsappConfigured: boolean;
  createdAt: string;
  counts: { grievances: number; users: number; citizens: number };
}

const EXAMPLE_MANDALS = "Mandal A: Village 1, Village 2, Village 3\nMandal B: Village 4, Village 5";

export default function Tenants() {
  const toast = useToast();
  const { data, error, loading, reload } = useApi<{ tenants: TenantRow[] }>("/api/platform/tenants");
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<{ slug: string; email: string; pw: string } | null>(null);
  const [f, setF] = useState({ slug: "", officeName: "", mlaName: "", constituency: "", district: "", ticketPrefix: "", defaultLanguage: "te", mandals: EXAMPLE_MANDALS, adminName: "", adminEmail: "", authorised: false, authRef: "" });

  const create = async () => {
    const mandals = f.mandals
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [name, rest = ""] = l.split(":");
        return { name: name.trim(), villages: rest.split(",").map((v) => v.trim()).filter(Boolean) };
      });
    try {
      const r = await api.post<{ tenant: { slug: string }; admin: { email: string; temporaryPassword: string } }>("/api/platform/tenants", {
        slug: f.slug,
        officeName: f.officeName,
        mlaName: f.mlaName,
        constituency: f.constituency,
        district: f.district,
        ticketPrefix: f.ticketPrefix,
        defaultLanguage: f.defaultLanguage,
        mandals,
        admin: { name: f.adminName, email: f.adminEmail },
        ...(f.authorised ? { brandingAuthorization: { confirmed: true, reference: f.authRef } } : {}),
      });
      setCreated({ slug: r.tenant.slug, email: r.admin.email, pw: r.admin.temporaryPassword });
      setOpen(false);
      void reload();
    } catch (e) {
      toast({ tone: "error", text: (e as Error).message });
    }
  };

  return (
    <div>
      <PageHeader title="MLA Workspaces" subtitle="Each workspace is an isolated tenant: own branding, WhatsApp number, staff, records and reports" actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>Onboard workspace</Button>} />
      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data && <Spinner />}
      <div className="grid gap-4 md:grid-cols-2">
        {data?.tenants.map((t) => (
          <Card key={t.id} className="p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-navy-50 p-2 text-navy-700">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-semibold text-navy-900">{t.officeName}</div>
                  <div className="text-[12.5px] text-slate-500">
                    {t.constituency}, {t.district} · prefix {t.ticketPrefix} · /{t.slug}
                  </div>
                </div>
              </div>
              <Badge className={t.active ? "bg-teal-50 text-teal-800 ring-teal-200" : "bg-slate-100 text-slate-500 ring-slate-200"}>{t.active ? "Active" : "Disabled"}</Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {t.isSampleBranding && (
                <Badge className="bg-amber-50 text-amber-800 ring-amber-200">
                  <ShieldAlert className="h-3 w-3" /> Sample branding
                </Badge>
              )}
              {t.isDemoData && <Badge className="bg-amber-50 text-amber-800 ring-amber-200">Demo data</Badge>}
              <Badge className={t.whatsappConfigured ? "bg-teal-50 text-teal-800 ring-teal-200" : "bg-slate-50 text-slate-600 ring-slate-200"}>WhatsApp {t.whatsappConfigured ? "configured" : "not configured"}</Badge>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[12px]">
              {[
                ["Grievances", t.counts.grievances],
                ["Staff", t.counts.users],
                ["Citizens", t.counts.citizens],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-slate-50 py-2">
                  <div className="text-[16px] font-bold text-navy-900">{v}</div>
                  <div className="text-slate-500">{k}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between text-[12px] text-slate-500">
              <span>Created {fmtDate(t.createdAt)}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await api.patch(`/api/platform/tenants/${t.id}`, { active: !t.active });
                  void reload();
                }}
              >
                {t.active ? "Disable" : "Enable"}
              </Button>
            </div>
          </Card>
        ))}
      </div>
      <Notice tone="info" className="mt-5">
        Platform administrators manage workspaces but cannot open any workspace's grievance records — tenant data is only reachable by that workspace's own staff accounts.
      </Notice>

      <Modal open={open} onClose={() => setOpen(false)} title="Onboard a new MLA workspace" wide footer={<Button onClick={create}>Create workspace</Button>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Workspace slug" hint="lowercase-with-dashes">
            <Input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase() })} />
          </Field>
          <Field label="Ticket prefix" hint="2–6 capital letters, e.g. SPM">
            <Input value={f.ticketPrefix} onChange={(e) => setF({ ...f, ticketPrefix: e.target.value.toUpperCase() })} maxLength={6} />
          </Field>
          <Field label="Office display name">
            <Input value={f.officeName} onChange={(e) => setF({ ...f, officeName: e.target.value })} placeholder="MLA Office · Constituency (Sample)" />
          </Field>
          <Field label="MLA name">
            <Input value={f.mlaName} onChange={(e) => setF({ ...f, mlaName: e.target.value })} placeholder="Sample MLA" />
          </Field>
          <Field label="Assembly constituency">
            <Input value={f.constituency} onChange={(e) => setF({ ...f, constituency: e.target.value })} />
          </Field>
          <Field label="District">
            <Input value={f.district} onChange={(e) => setF({ ...f, district: e.target.value })} />
          </Field>
          <Field label="Default language">
            <Select value={f.defaultLanguage} onChange={(e) => setF({ ...f, defaultLanguage: e.target.value })}>
              <option value="te">Telugu</option>
              <option value="en">English</option>
            </Select>
          </Field>
          <div />
          <div className="sm:col-span-2">
            <Field label="Mandals and villages" hint="One mandal per line: Mandal name: village, village, …">
              <Textarea value={f.mandals} onChange={(e) => setF({ ...f, mandals: e.target.value })} rows={4} className="font-mono text-[12.5px]" />
            </Field>
          </div>
          <Field label="First office administrator — name">
            <Input value={f.adminName} onChange={(e) => setF({ ...f, adminName: e.target.value })} />
          </Field>
          <Field label="Administrator email">
            <Input type="email" value={f.adminEmail} onChange={(e) => setF({ ...f, adminEmail: e.target.value })} />
          </Field>
          <div className="space-y-2 rounded-lg bg-amber-50 p-3 ring-1 ring-amber-200 sm:col-span-2">
            <label className="flex items-start gap-2 text-[13px] text-amber-900">
              <input type="checkbox" checked={f.authorised} onChange={(e) => setF({ ...f, authorised: e.target.checked })} className="mt-0.5 h-4 w-4" />
              Written authorisation to use this MLA's real name and branding has been obtained.
            </label>
            {f.authorised ? (
              <Input value={f.authRef} onChange={(e) => setF({ ...f, authRef: e.target.value })} placeholder="Authorisation reference (letter no./date)" />
            ) : (
              <p className="text-[12px] text-amber-800">Without authorisation the workspace is created with clearly labelled sample branding.</p>
            )}
          </div>
        </div>
      </Modal>

      <Modal open={!!created} onClose={() => setCreated(null)} title="Workspace created" footer={<Button onClick={() => setCreated(null)}>Done</Button>}>
        <p className="text-[13px] text-slate-600">
          Workspace <strong>/{created?.slug}</strong> is ready with default categories and teams. Share the administrator's temporary password securely — it is shown only once.
        </p>
        <div className="mt-3 rounded-lg bg-slate-100 p-3 text-[13px]">
          <div>{created?.email}</div>
          <div className="font-mono text-[15px] font-semibold text-navy-900">{created?.pw}</div>
        </div>
      </Modal>
    </div>
  );
}
