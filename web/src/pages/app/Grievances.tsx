import { FormEvent, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { AlarmClock, Copy, Download, FileStack, Filter, Paperclip, Plus, Search, X } from "lucide-react";
import { api, qs } from "../../lib/api";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../lib/auth";
import { daysSince, fmtDate, SOURCE_LABEL, STATUS_META } from "../../lib/format";
import type { GrievanceListItem, Meta, Paged } from "../../lib/types";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, Notice, PageHeader, Pagination, PriorityBadge, Select, Skeleton, StatusBadge, Textarea } from "../../components/ui";
import { useToast } from "../../components/ui/toast";

const FILTER_KEYS = ["status", "priority", "categoryId", "mandalId", "villageId", "teamId", "assigneeId", "overdue", "escalated", "open", "pendingResolution", "source", "q", "sort"] as const;

export function GrievanceTable({ items, showAssignee = true }: { items: GrievanceListItem[]; showAssignee?: boolean }) {
  const nav = useNavigate();
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <table className="w-full min-w-[920px] text-left text-[13px]">
        <thead className="bg-slate-50/80 text-[12px] text-slate-500">
          <tr>
            <th className="px-4 py-2.5 font-medium">Ticket</th>
            <th className="px-3 py-2.5 font-medium">Complaint</th>
            <th className="px-3 py-2.5 font-medium">Location</th>
            <th className="px-3 py-2.5 font-medium">Priority</th>
            <th className="px-3 py-2.5 font-medium">Status</th>
            {showAssignee && <th className="px-3 py-2.5 font-medium">Team / officer</th>}
            <th className="px-4 py-2.5 font-medium">Due</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((g) => (
            <tr key={g.id} onClick={() => nav(`/app/grievances/${g.id}`)} className="cursor-pointer align-top transition hover:bg-teal-50/40">
              <td className="px-4 py-3">
                <Link to={`/app/grievances/${g.id}`} onClick={(e) => e.stopPropagation()} className="font-mono text-[12.5px] font-semibold text-navy-800 hover:underline">
                  {g.ticketNumber}
                </Link>
                <div className="mt-0.5 text-[11.5px] text-slate-500">{fmtDate(g.createdAt)}</div>
                <div className="text-[11px] text-slate-400">{SOURCE_LABEL[g.source]}</div>
              </td>
              <td className="max-w-[340px] px-3 py-3">
                <div className="flex items-center gap-1.5 font-medium text-slate-800">
                  <span aria-hidden>{g.category.emoji}</span> {g.category.nameEn}
                  {g.attachments > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-[11px] font-normal text-slate-400">
                      <Paperclip className="h-3 w-3" />
                      {g.attachments}
                    </span>
                  )}
                  {g.possibleDuplicate && (
                    <Badge className="bg-slate-50 text-slate-600 ring-slate-200">
                      <Copy className="h-3 w-3" /> Possible duplicate
                    </Badge>
                  )}
                </div>
                <div className="mt-0.5 line-clamp-2 text-[12.5px] text-slate-600">{g.summary}</div>
                <div className="mt-0.5 text-[11.5px] text-slate-400">{g.citizenName ?? "—"}</div>
              </td>
              <td className="px-3 py-3">
                <div className="text-slate-800">{g.village ?? "—"}</div>
                <div className="text-[11.5px] text-slate-500">{g.mandal}</div>
              </td>
              <td className="px-3 py-3">
                <PriorityBadge priority={g.priority} />
                {g.urgency === "SAFETY" && <div className="mt-1 text-[11px] font-medium text-red-700">⚠ safety flagged</div>}
              </td>
              <td className="px-3 py-3">
                <StatusBadge status={g.status} />
                {g.resolutionRequested && <div className="mt-1 text-[11px] font-medium text-teal-700">Work reported complete</div>}
                {g.escalationLevel > 0 && <div className="mt-1 text-[11px] font-medium text-red-700">Escalated L{g.escalationLevel}</div>}
              </td>
              {showAssignee && (
                <td className="px-3 py-3">
                  <div className="text-slate-800">{g.team ?? <span className="text-slate-400">Unassigned</span>}</div>
                  <div className="text-[11.5px] text-slate-500">{g.assignee ?? ""}</div>
                </td>
              )}
              <td className="px-4 py-3">
                {g.dueAt ? (
                  <span className={g.overdue ? "inline-flex items-center gap-1 font-medium text-red-700" : "text-slate-700"}>
                    {g.overdue && <AlarmClock className="h-3.5 w-3.5" />}
                    {fmtDate(g.dueAt)}
                  </span>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
                <div className="text-[11px] text-slate-400">{daysSince(g.createdAt)}d open</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Grievances() {
  const { me } = useAuth();
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [newOpen, setNewOpen] = useState(false);
  const meta = useApi<Meta>("/api/meta");
  const filters = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) ?? undefined]));
  const url = `/api/grievances${qs({ ...filters, page, pageSize: 20 })}`;
  const { data, error, loading, reload } = useApi<Paged<GrievanceListItem>>(url);
  const isAdmin = me?.user.role === "OFFICE_ADMIN";

  const set = (k: string, v: string | undefined) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    setParams(p, { replace: true });
    setPage(1);
  };
  const villages = useMemo(() => {
    const m = meta.data?.mandals.find((x) => x.id === params.get("mandalId"));
    return m?.villages ?? [];
  }, [meta.data, params]);
  const activeCount = FILTER_KEYS.filter((k) => k !== "sort" && k !== "q" && params.get(k)).length;

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    set("q", search.trim() || undefined);
  };

  return (
    <div>
      <PageHeader
        title="Grievance Register"
        subtitle={me?.user.role === "MLA" ? "Read-only executive view. Citizen contact details are restricted." : "Search, filter and manage every citizen grievance."}
        actions={
          <>
            <a href={`/api/reports/grievances.csv${qs(filters)}`} className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50">
              <Download className="h-4 w-4" /> Export CSV
            </a>
            {isAdmin && (
              <Button onClick={() => setNewOpen(true)} icon={<Plus className="h-4 w-4" />}>
                Office entry
              </Button>
            )}
          </>
        }
      />

      <Card className="mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <form onSubmit={onSearch} className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ticket number, description, village, landmark…" className="pl-9" aria-label="Search grievances" />
          </form>
          <Select value={params.get("status") ?? ""} onChange={(e) => set("status", e.target.value)} className="w-40" aria-label="Status">
            <option value="">Any status</option>
            {Object.entries(STATUS_META).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </Select>
          <Select value={params.get("priority") ?? ""} onChange={(e) => set("priority", e.target.value)} className="w-36" aria-label="Priority">
            <option value="">Any priority</option>
            {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((p) => (
              <option key={p} value={p}>
                {p[0] + p.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>
          <Select value={params.get("categoryId") ?? ""} onChange={(e) => set("categoryId", e.target.value)} className="w-44" aria-label="Category">
            <option value="">All categories</option>
            {meta.data?.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.nameEn}
              </option>
            ))}
          </Select>
          <Select value={params.get("mandalId") ?? ""} onChange={(e) => { set("mandalId", e.target.value); }} className="w-40" aria-label="Mandal">
            <option value="">All mandals</option>
            {meta.data?.mandals.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
          {villages.length > 0 && (
            <Select value={params.get("villageId") ?? ""} onChange={(e) => set("villageId", e.target.value)} className="w-48" aria-label="Village">
              <option value="">All villages</option>
              {villages.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
          )}
          <Select value={params.get("teamId") ?? ""} onChange={(e) => set("teamId", e.target.value)} className="w-44" aria-label="Team">
            <option value="">All teams</option>
            <option value="none">Unassigned</option>
            {meta.data?.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <Select value={params.get("sort") ?? "created_desc"} onChange={(e) => set("sort", e.target.value)} className="w-40" aria-label="Sort">
            <option value="created_desc">Newest first</option>
            <option value="created_asc">Oldest first</option>
            <option value="priority">Priority</option>
            <option value="due">Due date</option>
            <option value="updated">Recently updated</option>
          </Select>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px]">
          <Filter className="h-3.5 w-3.5 text-slate-400" />
          {[
            ["open", "Open only"],
            ["overdue", "Overdue"],
            ["escalated", "Escalated"],
            ["pendingResolution", "Work reported complete"],
          ].map(([k, label]) => (
            <button key={k} onClick={() => set(k, params.get(k) ? undefined : "true")} className={`rounded-full px-2.5 py-1 font-medium ring-1 transition ${params.get(k) ? "bg-navy-900 text-white ring-navy-900" : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50"}`}>
              {label}
            </button>
          ))}
          {(activeCount > 0 || params.get("q")) && (
            <button onClick={() => { setParams({}, { replace: true }); setSearch(""); }} className="ml-1 inline-flex items-center gap-1 text-slate-500 hover:text-slate-800">
              <X className="h-3.5 w-3.5" /> Clear filters
            </button>
          )}
        </div>
      </Card>

      {error && <ErrorState error={error} onRetry={reload} />}
      <Card>
        {loading && !data ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : data && data.items.length === 0 ? (
          <EmptyState title="No grievances match these filters" icon={<FileStack className="h-6 w-6" />}>
            Try clearing some filters or searching by ticket number.
          </EmptyState>
        ) : (
          data && (
            <div className={loading ? "opacity-60 transition" : "transition"}>
              <GrievanceTable items={data.items} />
              <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
            </div>
          )
        )}
      </Card>

      {isAdmin && meta.data && <NewGrievanceModal open={newOpen} onClose={() => setNewOpen(false)} meta={meta.data} />}
    </div>
  );
}

function NewGrievanceModal({ open, onClose, meta }: { open: boolean; onClose: () => void; meta: Meta }) {
  const toast = useToast();
  const nav = useNavigate();
  const [f, setF] = useState({ citizenName: "", citizenPhone: "", language: "te", categoryId: "", mandalId: "", villageId: "", landmark: "", description: "", urgency: "NORMAL", consentConfirmed: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const villages = meta.mandals.find((m) => m.id === f.mandalId)?.villages ?? [];
  const up = (k: string, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await api.post<{ id: string; ticketNumber: string }>("/api/grievances", { ...f, villageId: f.villageId || null, citizenPhone: f.citizenPhone.replace(/\D/g, "") });
      toast({ tone: "success", text: `Grievance ${r.ticketNumber} recorded` });
      onClose();
      nav(`/app/grievances/${r.id}`);
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record a grievance (walk-in / phone call)"
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="new-grievance" loading={busy}>
            Create ticket
          </Button>
        </>
      }
    >
      <form id="new-grievance" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Citizen name" required>
          <Input value={f.citizenName} onChange={(e) => up("citizenName", e.target.value)} required minLength={2} />
        </Field>
        <Field label="Mobile number" required hint="10-digit Indian mobile; updates go to this WhatsApp number when WhatsApp is connected">
          <Input value={f.citizenPhone} onChange={(e) => up("citizenPhone", e.target.value)} required inputMode="numeric" pattern="[0-9 +]{10,16}" />
        </Field>
        <Field label="Preferred language">
          <Select value={f.language} onChange={(e) => up("language", e.target.value)}>
            <option value="te">Telugu</option>
            <option value="en">English</option>
          </Select>
        </Field>
        <Field label="Category" required>
          <Select value={f.categoryId} onChange={(e) => up("categoryId", e.target.value)} required>
            <option value="">Select…</option>
            {meta.categories.filter((c) => c.active).map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.nameEn}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Mandal" required>
          <Select value={f.mandalId} onChange={(e) => setF((x) => ({ ...x, mandalId: e.target.value, villageId: "" }))} required>
            <option value="">Select…</option>
            {meta.mandals.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Village / ward">
          <Select value={f.villageId} onChange={(e) => up("villageId", e.target.value)} disabled={!f.mandalId}>
            <option value="">Select…</option>
            {villages.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Landmark">
          <Input value={f.landmark} onChange={(e) => up("landmark", e.target.value)} />
        </Field>
        <Field label="Urgency">
          <Select value={f.urgency} onChange={(e) => up("urgency", e.target.value)}>
            <option value="NORMAL">Normal</option>
            <option value="URGENT">Urgent</option>
            <option value="SAFETY">Safety risk</option>
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Problem description" required hint="At least 15 characters, in the citizen's words (Telugu or English)">
            <Textarea value={f.description} onChange={(e) => up("description", e.target.value)} required minLength={15} rows={4} />
          </Field>
        </div>
        <label className="flex items-start gap-2 text-[13px] text-slate-700 sm:col-span-2">
          <input type="checkbox" checked={f.consentConfirmed} onChange={(e) => up("consentConfirmed", e.target.checked)} required className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-600" />
          I have explained the privacy notice to the citizen and they consent to the office processing this information for their grievance.
        </label>
        {err && <Notice tone="warn" className="sm:col-span-2">{err}</Notice>}
      </form>
    </Modal>
  );
}
