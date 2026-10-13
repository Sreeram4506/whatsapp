import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  AlarmClock,
  ArrowLeft,
  Bot,
  CalendarCheck,
  Camera,
  CheckCircle2,
  Copy,
  Eye,
  FileText,
  Globe2,
  Lock,
  MapPin,
  MessageCircle,
  Send,
  ShieldAlert,
  Sparkles,
  Upload,
  UserRound,
  Wand2,
} from "lucide-react";
import { api } from "../../lib/api";
import { useApi } from "../../hooks/useApi";
import { DELIVERY_META, fmtDate, ROLE_LABEL, SOURCE_LABEL, STATUS_META } from "../../lib/format";
import type { Meta } from "../../lib/types";
import { Badge, Button, Card, CardHeader, ErrorState, Field, Input, Modal, Notice, PriorityBadge, Select, Spinner, StatusBadge, Textarea } from "../../components/ui";
import { useToast } from "../../components/ui/toast";

interface Detail {
  id: string;
  ticketNumber: string;
  status: string;
  priority: string;
  priorityReasons: string[];
  urgency: string;
  source: string;
  description: string;
  descriptionLanguage: string;
  landmark: string | null;
  latitude: number | null;
  longitude: number | null;
  villageText: string | null;
  createdAt: string;
  updatedAt: string;
  dueAt: string | null;
  overdue: boolean;
  escalationLevel: number;
  fieldVisitAt: string | null;
  resolutionRequestedAt: string | null;
  resolutionNotes: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  citizenConfirmed: boolean | null;
  feedbackRating: number | null;
  reopenCount: number;
  aiSummary: string | null;
  aiSuggestedCategory: string | null;
  aiSuggestedTeam: { id: string; name: string } | null;
  aiProvider: string | null;
  aiGeneratedAt: string | null;
  category: { id: string; code: string; nameEn: string; nameTe: string; emoji: string };
  village: { name: string; nameTe: string | null } | null;
  mandal: { name: string };
  team: { id: string; name: string; department: string } | null;
  assignee: { id: string; name: string } | null;
  citizen: { id: string; name: string | null; phoneMasked: string; canReveal: boolean; preferredLanguage: string; optedOut: boolean; consentAt: string | null };
  updates: { id: string; kind: string; message: string; visibility: "INTERNAL" | "CITIZEN"; createdAt: string; fromStatus: string | null; toStatus: string | null; author: { name: string; role: string } | null }[];
  attachments: { id: string; kind: string; fileName: string; mimeType: string; sizeBytes: number; createdAt: string; source: string }[];
  duplicateOf: { id: string; ticketNumber: string; status: string } | null;
  relatedReports: number;
  messages: { id: string; body: string; status: string; channel: string; error: string | null; createdAt: string }[];
  allowedTransitions: string[];
  permissions: {
    canAssign: boolean;
    canEditPriority: boolean;
    canAddCitizenNote: boolean;
    canAddInternalNote: boolean;
    canUpload: boolean;
    canRequestResolution: boolean;
    canScheduleVisit: boolean;
    readOnly: boolean;
  };
}

const KIND_LABEL: Record<string, string> = {
  STATUS_CHANGE: "Status",
  ASSIGNMENT: "Assignment",
  NOTE: "Note",
  INSPECTION: "Inspection",
  FIELD_VISIT: "Field visit",
  EVIDENCE: "Evidence",
  RESOLUTION_REQUEST: "Work complete",
  ESCALATION: "Escalation",
  PRIORITY: "Priority",
  CITIZEN_FEEDBACK: "Citizen feedback",
  CITIZEN_REPLY: "Citizen reply",
  REOPEN: "Reopened",
  SYSTEM: "System",
};

const TRANSITION_LABEL: Record<string, string> = {
  VERIFICATION: "Start verification",
  ASSIGNED: "Mark assigned",
  IN_PROGRESS: "Mark in progress",
  AWAITING_INFO: "Request information",
  RESOLVED: "Mark resolved",
  CLOSED: "Close case",
  REOPENED: "Reopen",
};

export default function GrievanceDetail() {
  const { id } = useParams();
  const { data: g, error, loading, reload } = useApi<Detail>(`/api/grievances/${id}`, [id]);
  const meta = useApi<Meta>("/api/meta");
  const [transition, setTransition] = useState<string | null>(null);
  const navigate = useNavigate();

  if (loading && !g) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!g) return null;

  return (
    <div>
      <button onClick={() => navigate(-1)} className="mb-3 inline-flex items-center gap-1 text-[13px] text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-[22px] font-bold tracking-tight text-navy-900">{g.ticketNumber}</h1>
            <StatusBadge status={g.status} />
            <PriorityBadge priority={g.priority} />
            {g.overdue && (
              <Badge className="bg-red-50 text-red-700 ring-red-200">
                <AlarmClock className="h-3 w-3" /> Overdue
              </Badge>
            )}
            {g.escalationLevel > 0 && <Badge className="bg-red-600 text-white ring-red-600">Escalated · L{g.escalationLevel}</Badge>}
          </div>
          <p className="mt-1 text-[13px] text-slate-500">
            {g.category.emoji} {g.category.nameEn} · {g.village?.name ?? g.villageText ?? "—"}, {g.mandal.name} mandal · received {fmtDate(g.createdAt, true)} via {SOURCE_LABEL[g.source]}
          </p>
        </div>
        {!g.permissions.readOnly && g.allowedTransitions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {g.allowedTransitions.map((s) => (
              <Button key={s} variant={s === "RESOLVED" ? "teal" : s === "CLOSED" ? "secondary" : "primary"} size="sm" onClick={() => setTransition(s)}>
                {TRANSITION_LABEL[s] ?? s}
              </Button>
            ))}
          </div>
        )}
        {g.permissions.readOnly && (
          <Badge className="bg-slate-100 text-slate-600 ring-slate-200">
            <Eye className="h-3 w-3" /> Read-only view
          </Badge>
        )}
      </div>

      {g.resolutionRequestedAt && ["ASSIGNED", "IN_PROGRESS"].includes(g.status) && (
        <Notice tone="success" className="mb-4">
          <strong>Field officer reported the work complete</strong> on {fmtDate(g.resolutionRequestedAt, true)}: {g.resolutionNotes}. {g.allowedTransitions.includes("RESOLVED") && "Review the evidence and mark it resolved to notify the citizen."}
        </Notice>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Citizen's complaint" subtitle={`Original text · ${g.descriptionLanguage === "te" ? "Telugu" : "English"}`} />
            <div className="space-y-4 p-5">
              <p className={`whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800 ${g.descriptionLanguage === "te" ? "telugu" : ""}`}>{g.description}</p>
              <div className="grid gap-3 text-[13px] sm:grid-cols-3">
                <div>
                  <div className="text-[11.5px] font-medium uppercase tracking-wider text-slate-500">Landmark</div>
                  <div className="text-slate-800">{g.landmark ?? "—"}</div>
                </div>
                <div>
                  <div className="text-[11.5px] font-medium uppercase tracking-wider text-slate-500">Citizen urgency</div>
                  <div className={g.urgency === "SAFETY" ? "font-medium text-red-700" : "text-slate-800"}>{g.urgency === "SAFETY" ? "⚠ Safety risk" : g.urgency === "URGENT" ? "Urgent" : "Normal"}</div>
                </div>
                <div>
                  <div className="text-[11.5px] font-medium uppercase tracking-wider text-slate-500">Location</div>
                  {g.latitude != null && g.longitude != null ? (
                    <a className="inline-flex items-center gap-1 text-navy-700 hover:underline" href={`https://www.openstreetmap.org/?mlat=${g.latitude}&mlon=${g.longitude}#map=17/${g.latitude}/${g.longitude}`} target="_blank" rel="noreferrer">
                      <MapPin className="h-3.5 w-3.5" /> Shared by citizen
                    </a>
                  ) : (
                    <div className="text-slate-500">Not shared</div>
                  )}
                </div>
              </div>
              {(g.duplicateOf || g.relatedReports > 0) && (
                <Notice tone="info">
                  <Copy className="mr-1 inline h-3.5 w-3.5" />
                  {g.duplicateOf && (
                    <>
                      Citizen was shown a similar open complaint:{" "}
                      <Link className="font-mono font-semibold underline" to={`/app/grievances/${g.duplicateOf.id}`}>
                        {g.duplicateOf.ticketNumber}
                      </Link>{" "}
                      ({STATUS_META[g.duplicateOf.status]?.label}) and chose to register separately.{" "}
                    </>
                  )}
                  {g.relatedReports > 0 && `${g.relatedReports} other report(s) were flagged as related to this case.`}
                </Notice>
              )}
              <Attachments g={g} onUploaded={reload} />
            </div>
          </Card>

          <Card className="ring-violet-200">
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-violet-600" /> AI suggestions
                </span>
              }
              subtitle={`Advisory only — staff decide · ${g.aiProvider ?? "pending"}${g.aiGeneratedAt ? ` · ${fmtDate(g.aiGeneratedAt, true)}` : ""}`}
            />
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <div className="md:col-span-2">
                <div className="text-[11.5px] font-medium uppercase tracking-wider text-slate-500">Summary for staff</div>
                <p className="mt-1 text-[14px] text-slate-800">{g.aiSummary ?? "Not generated yet."}</p>
              </div>
              <div>
                <div className="text-[11.5px] font-medium uppercase tracking-wider text-slate-500">Suggested category</div>
                <SuggestedCategory g={g} meta={meta.data} onApplied={reload} />
              </div>
              <div>
                <div className="text-[11.5px] font-medium uppercase tracking-wider text-slate-500">Suggested team</div>
                <div className="mt-1 text-[14px] text-slate-800">{g.aiSuggestedTeam?.name ?? "—"}</div>
              </div>
              <div className="md:col-span-2">
                <div className="text-[11.5px] font-medium uppercase tracking-wider text-slate-500">Priority rationale (transparent rules)</div>
                <ul className="mt-1 space-y-1 text-[13px] text-slate-700">
                  {g.priorityReasons.map((r) => (
                    <li key={r} className="flex gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" /> {r}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>

          <Timeline g={g} onAdded={reload} />
        </div>

        <div className="space-y-5">
          <CaseDetails g={g} onChanged={reload} />
          {g.permissions.canAssign && meta.data && <AssignPanel g={g} meta={meta.data} onDone={reload} />}
          <CitizenCard g={g} />
          {(g.permissions.canScheduleVisit || g.permissions.canRequestResolution) && <FieldWork g={g} onDone={reload} />}
          {g.permissions.canAddCitizenNote && <DraftReply g={g} onSent={reload} />}
          {g.messages.length > 0 && (
            <Card>
              <CardHeader title="Messages sent to citizen" subtitle="Delivery status from WhatsApp (or simulator)" />
              <ul className="divide-y divide-slate-100">
                {g.messages.map((m) => (
                  <li key={m.id} className="px-5 py-2.5 text-[12.5px]">
                    <div className="flex items-center justify-between gap-2">
                      <Badge className={DELIVERY_META[m.status]?.tone ?? ""}>{DELIVERY_META[m.status]?.label ?? m.status}</Badge>
                      <span className="text-[11.5px] text-slate-400">{fmtDate(m.createdAt, true)}</span>
                    </div>
                    <p className="mt-1 line-clamp-3 text-slate-600">{m.body}</p>
                    {m.error && <p className="mt-0.5 text-[11.5px] text-red-600">{m.error}</p>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      {transition && <TransitionModal g={g} to={transition} onClose={() => setTransition(null)} onDone={() => { setTransition(null); void reload(); }} />}
    </div>
  );
}

function SuggestedCategory({ g, meta, onApplied }: { g: Detail; meta: Meta | null; onApplied: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const cat = meta?.categories.find((c) => c.code === g.aiSuggestedCategory);
  if (!g.aiSuggestedCategory) return <div className="mt-1 text-slate-500">—</div>;
  const same = g.aiSuggestedCategory === g.category.code;
  return (
    <div className="mt-1 flex items-center gap-2 text-[14px] text-slate-800">
      {cat ? `${cat.emoji} ${cat.nameEn}` : g.aiSuggestedCategory}
      {same ? (
        <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">matches</Badge>
      ) : (
        g.permissions.canEditPriority &&
        cat && (
          <Button
            size="sm"
            variant="secondary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api.post(`/api/grievances/${g.id}/category`, { categoryId: cat.id });
                toast({ tone: "success", text: "Category updated" });
                onApplied();
              } catch (e) {
                toast({ tone: "error", text: (e as Error).message });
              } finally {
                setBusy(false);
              }
            }}
          >
            Apply
          </Button>
        )
      )}
    </div>
  );
}

function Attachments({ g, onUploaded }: { g: Detail; onUploaded: () => void }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState("BEFORE");
  const [busy, setBusy] = useState(false);
  const upload = async (file: File) => {
    const fd = new FormData();
    fd.append("kind", kind);
    fd.append("file", file);
    setBusy(true);
    try {
      await api.upload(`/api/grievances/${g.id}/attachments`, fd);
      toast({ tone: "success", text: "Evidence uploaded" });
      onUploaded();
    } catch (e) {
      toast({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const label: Record<string, string> = { CITIZEN_UPLOAD: "From citizen", BEFORE: "Before work", AFTER: "After work", EVIDENCE: "Evidence" };
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11.5px] font-medium uppercase tracking-wider text-slate-500">Photos & documents ({g.attachments.length})</div>
        {g.permissions.canUpload && (
          <div className="flex items-center gap-2">
            <Select value={kind} onChange={(e) => setKind(e.target.value)} className="h-8 w-36 text-[12.5px]" aria-label="Evidence type">
              <option value="BEFORE">Before work</option>
              <option value="AFTER">After work</option>
              <option value="EVIDENCE">Other evidence</option>
            </Select>
            <Button size="sm" variant="secondary" loading={busy} icon={<Upload className="h-3.5 w-3.5" />} onClick={() => input.current?.click()}>
              Upload
            </Button>
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
          </div>
        )}
      </div>
      {g.attachments.length === 0 ? (
        <p className="text-[13px] text-slate-500">No attachments.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {g.attachments.map((a) => (
            <a key={a.id} href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-lg ring-1 ring-slate-200 hover:ring-teal-400">
              {a.mimeType.startsWith("image/") ? (
                <img src={`/api/attachments/${a.id}`} alt={a.fileName} className="h-28 w-full object-cover" loading="lazy" />
              ) : (
                <div className="flex h-28 items-center justify-center bg-slate-50">
                  <FileText className="h-8 w-8 text-slate-400" />
                </div>
              )}
              <div className="px-2 py-1.5">
                <div className="truncate text-[11.5px] font-medium text-slate-700">{a.fileName}</div>
                <div className="text-[10.5px] text-slate-500">
                  {label[a.kind] ?? a.kind} · {(a.sizeBytes / 1024).toFixed(0)} KB
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
      <p className="mt-2 flex items-center gap-1 text-[11px] text-slate-400">
        <Lock className="h-3 w-3" /> Files are stored privately and served only to authorised staff of this workspace.
      </p>
    </div>
  );
}

function Timeline({ g, onAdded }: { g: Detail; onAdded: () => void }) {
  const toast = useToast();
  const [msg, setMsg] = useState("");
  const [vis, setVis] = useState<"INTERNAL" | "CITIZEN">("INTERNAL");
  const [busy, setBusy] = useState(false);
  const canNote = g.permissions.canAddInternalNote;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/api/grievances/${g.id}/notes`, { message: msg, visibility: vis });
      setMsg("");
      toast({ tone: "success", text: vis === "CITIZEN" ? "Update sent to citizen" : "Internal note added" });
      onAdded();
    } catch (e2) {
      toast({ tone: "error", text: (e2 as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Case timeline & audit trail" subtitle="Every status change, assignment and note — with who did it and when" />
      <ol className="relative space-y-0 px-5 py-4">
        {[...g.updates].reverse().map((u, i, arr) => (
          <li key={u.id} className="relative flex gap-3 pb-4">
            {i < arr.length - 1 && <span className="absolute left-[11px] top-6 h-full w-px bg-slate-200" aria-hidden />}
            <span className={`relative mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full ring-4 ring-white ${u.visibility === "CITIZEN" ? "bg-teal-100 text-teal-700" : "bg-slate-100 text-slate-500"}`}>
              {u.kind === "CITIZEN_FEEDBACK" || u.kind === "CITIZEN_REPLY" || u.kind === "REOPEN" ? <UserRound className="h-3 w-3" /> : u.kind === "ESCALATION" ? <ShieldAlert className="h-3 w-3 text-red-600" /> : u.kind === "SYSTEM" ? <Bot className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                <span className="font-semibold text-slate-800">{KIND_LABEL[u.kind] ?? u.kind}</span>
                {u.toStatus && u.fromStatus && (
                  <span className="text-slate-500">
                    {STATUS_META[u.fromStatus]?.label} → <strong className="text-slate-700">{STATUS_META[u.toStatus]?.label}</strong>
                  </span>
                )}
                <Badge className={u.visibility === "CITIZEN" ? "bg-teal-50 text-teal-700 ring-teal-200" : "bg-slate-50 text-slate-500 ring-slate-200"}>
                  {u.visibility === "CITIZEN" ? <Globe2 className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                  {u.visibility === "CITIZEN" ? "Citizen-visible" : "Internal"}
                </Badge>
              </div>
              <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-slate-700">{u.message}</p>
              <div className="mt-0.5 text-[11.5px] text-slate-400">
                {fmtDate(u.createdAt, true)} · {u.author ? `${u.author.name} (${ROLE_LABEL[u.author.role] ?? u.author.role})` : u.kind.startsWith("CITIZEN") || u.kind === "REOPEN" ? "Citizen via WhatsApp" : "System"}
              </div>
            </div>
          </li>
        ))}
      </ol>
      {canNote && (
        <form onSubmit={submit} className="space-y-2 border-t border-slate-100 p-4">
          <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={vis === "CITIZEN" ? "Message the citizen (sent on WhatsApp)…" : "Add an internal note (not visible to the citizen)…"} rows={3} required minLength={2} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            {g.permissions.canAddCitizenNote ? (
              <div className="flex rounded-lg bg-slate-100 p-0.5 text-[12.5px]" role="group">
                {(["INTERNAL", "CITIZEN"] as const).map((v) => (
                  <button key={v} type="button" onClick={() => setVis(v)} className={`rounded-md px-3 py-1 font-medium ${vis === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
                    {v === "INTERNAL" ? "Internal note" : "Message citizen"}
                  </button>
                ))}
              </div>
            ) : (
              <span className="text-[12px] text-slate-500">Internal note — only office staff can see it</span>
            )}
            <Button type="submit" size="sm" loading={busy} icon={vis === "CITIZEN" ? <Send className="h-3.5 w-3.5" /> : undefined}>
              {vis === "CITIZEN" ? "Send update" : "Add note"}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

function CaseDetails({ g, onChanged }: { g: Detail; onChanged: () => void }) {
  const toast = useToast();
  const [prio, setPrio] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const rows: [string, React.ReactNode][] = [
    ["Status", <StatusBadge status={g.status} />],
    [
      "Priority",
      <span className="flex items-center gap-2">
        <PriorityBadge priority={g.priority} />
        {g.permissions.canEditPriority && (
          <button className="text-[12px] text-teal-700 hover:underline" onClick={() => setPrio(g.priority)}>
            Change
          </button>
        )}
      </span>,
    ],
    ["Team", g.team ? `${g.team.name}` : <span className="text-slate-400">Unassigned</span>],
    ["Field officer", g.assignee?.name ?? <span className="text-slate-400">—</span>],
    ["Due", g.dueAt ? <span className={g.overdue ? "font-semibold text-red-700" : ""}>{fmtDate(g.dueAt)}</span> : "—"],
    ["Field visit", g.fieldVisitAt ? fmtDate(g.fieldVisitAt, true) : "—"],
    ["Resolved", g.resolvedAt ? fmtDate(g.resolvedAt, true) : "—"],
    ["Citizen confirmation", g.citizenConfirmed === true ? `Confirmed${g.feedbackRating ? ` · ${"★".repeat(g.feedbackRating)}` : ""}` : g.citizenConfirmed === false ? "Not solved (reopened)" : "—"],
    ["Reopened", g.reopenCount ? `${g.reopenCount}×` : "—"],
    ["Last updated", fmtDate(g.updatedAt, true)],
  ];
  return (
    <Card>
      <CardHeader title="Case details" />
      <dl className="divide-y divide-slate-100 text-[13px]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-3 px-5 py-2">
            <dt className="text-slate-500">{k}</dt>
            <dd className="text-right text-slate-800">{v}</dd>
          </div>
        ))}
      </dl>
      <Modal
        open={prio !== null}
        onClose={() => setPrio(null)}
        title="Change priority"
        footer={
          <Button
            onClick={async () => {
              try {
                await api.post(`/api/grievances/${g.id}/priority`, { priority: prio, reason });
                toast({ tone: "success", text: "Priority updated" });
                setPrio(null);
                setReason("");
                onChanged();
              } catch (e) {
                toast({ tone: "error", text: (e as Error).message });
              }
            }}
            disabled={reason.trim().length < 3}
          >
            Save
          </Button>
        }
      >
        <div className="space-y-3">
          <Field label="Priority">
            <Select value={prio ?? ""} onChange={(e) => setPrio(e.target.value)}>
              {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((p) => (
                <option key={p}>{p}</option>
              ))}
            </Select>
          </Field>
          <Field label="Reason (recorded in the audit trail)" required>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </Card>
  );
}

function AssignPanel({ g, meta, onDone }: { g: Detail; meta: Meta; onDone: () => void }) {
  const toast = useToast();
  const suggested = g.team?.id ?? g.aiSuggestedTeam?.id ?? meta.categories.find((c) => c.id === g.category.id)?.defaultTeamId ?? "";
  const [teamId, setTeamId] = useState(suggested);
  const [assigneeId, setAssigneeId] = useState(g.assignee?.id ?? "");
  const [due, setDue] = useState(g.dueAt ? new Date(g.dueAt).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }) : "");
  const [busy, setBusy] = useState(false);
  const officers = meta.officers.filter((o) => !teamId || o.teamId === teamId);
  useEffect(() => {
    if (assigneeId && !officers.some((o) => o.id === assigneeId)) setAssigneeId("");
  }, [teamId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (["RESOLVED", "CLOSED"].includes(g.status)) return null;
  return (
    <Card>
      <CardHeader title={g.team ? "Reassign" : "Assign to team"} subtitle={!g.team && g.aiSuggestedTeam ? `AI suggests: ${g.aiSuggestedTeam.name}` : undefined} />
      <form
        className="space-y-3 p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api.post(`/api/grievances/${g.id}/assign`, { teamId, assigneeId: assigneeId || null, dueAt: due ? new Date(due + "T18:00:00+05:30").toISOString() : null });
            toast({ tone: "success", text: "Assignment saved — citizen notified" });
            onDone();
          } catch (e2) {
            toast({ tone: "error", text: (e2 as Error).message });
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Team" required>
          <Select value={teamId} onChange={(e) => setTeamId(e.target.value)} required>
            <option value="">Select team…</option>
            {meta.teams.filter((t) => t.active).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Field officer">
          <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">— none yet —</option>
            {officers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Due date" hint="Leave empty to apply the SLA for this priority">
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Button type="submit" loading={busy} className="w-full">
          Save assignment
        </Button>
      </form>
    </Card>
  );
}

function CitizenCard({ g }: { g: Detail }) {
  const toast = useToast();
  const [revealed, setRevealed] = useState<{ name: string; phone: string } | null>(null);
  return (
    <Card>
      <CardHeader title="Citizen" subtitle="Personal details are shown only to authorised roles" />
      <div className="space-y-2 p-5 text-[13px]">
        <div className="flex justify-between">
          <span className="text-slate-500">Name</span>
          <span className="font-medium text-slate-800">{revealed?.name ?? g.citizen.name ?? "—"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">WhatsApp</span>
          <span className="font-mono text-slate-800">{revealed?.phone ?? g.citizen.phoneMasked}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Language</span>
          <span>{g.citizen.preferredLanguage === "te" ? "Telugu" : "English"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Consent recorded</span>
          <span>{g.citizen.consentAt ? fmtDate(g.citizen.consentAt) : "—"}</span>
        </div>
        {g.citizen.optedOut && <Notice tone="warn">Citizen opted out of WhatsApp updates — notifications are suppressed.</Notice>}
        {g.citizen.canReveal && !revealed && (
          <Button
            size="sm"
            variant="secondary"
            className="mt-1 w-full"
            icon={<Eye className="h-3.5 w-3.5" />}
            onClick={async () => {
              try {
                setRevealed(await api.post(`/api/grievances/${g.id}/reveal-contact`));
              } catch (e) {
                toast({ tone: "error", text: (e as Error).message });
              }
            }}
          >
            Reveal contact (logged in audit trail)
          </Button>
        )}
      </div>
    </Card>
  );
}

function FieldWork({ g, onDone }: { g: Detail; onDone: () => void }) {
  const toast = useToast();
  const [when, setWhen] = useState("");
  const [inspection, setInspection] = useState("");
  const [complete, setComplete] = useState("");
  const call = async (url: string, body: unknown, msg: string, reset: () => void) => {
    try {
      await api.post(url, body);
      toast({ tone: "success", text: msg });
      reset();
      onDone();
    } catch (e) {
      toast({ tone: "error", text: (e as Error).message });
    }
  };
  const active = !["RESOLVED", "CLOSED"].includes(g.status);
  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2"><Camera className="h-4 w-4 text-teal-700" /> Field operations</span>} subtitle="Visits, inspection notes, evidence and completion" />
      <div className="space-y-4 p-5">
        {active && (
          <div className="flex items-end gap-2">
            <Field label="Schedule field visit">
              <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            </Field>
            <Button size="md" variant="secondary" disabled={!when} icon={<CalendarCheck className="h-4 w-4" />} onClick={() => call(`/api/grievances/${g.id}/field-visit`, { when: new Date(when).toISOString() }, "Field visit scheduled", () => setWhen(""))}>
              Save
            </Button>
          </div>
        )}
        <div>
          <Field label="Inspection notes">
            <Textarea value={inspection} onChange={(e) => setInspection(e.target.value)} rows={3} placeholder="What did you observe on site?" />
          </Field>
          <Button size="sm" variant="secondary" className="mt-2" disabled={inspection.trim().length < 5} onClick={() => call(`/api/grievances/${g.id}/inspection`, { notes: inspection }, "Inspection notes saved", () => setInspection(""))}>
            Save inspection notes
          </Button>
        </div>
        {g.permissions.canRequestResolution && ["ASSIGNED", "IN_PROGRESS"].includes(g.status) && (
          <div className="rounded-lg bg-teal-50/60 p-3 ring-1 ring-teal-100">
            <Field label="Report work complete" hint="The office reviews your evidence and confirms resolution with the citizen. Upload 'after' photos first.">
              <Textarea value={complete} onChange={(e) => setComplete(e.target.value)} rows={2} placeholder="What was done?" />
            </Field>
            <Button size="sm" variant="teal" className="mt-2" disabled={complete.trim().length < 5} onClick={() => call(`/api/grievances/${g.id}/request-resolution`, { notes: complete }, "Reported to office for confirmation", () => setComplete(""))}>
              Submit for office confirmation
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function DraftReply({ g, onSent }: { g: Detail; onSent: () => void }) {
  const toast = useToast();
  const [intent, setIntent] = useState("");
  const [draft, setDraft] = useState<{ text: string; source: string; provider: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2"><Wand2 className="h-4 w-4 text-violet-600" /> Draft a reply to the citizen</span>} subtitle="AI drafts — you review, edit and send" />
      <div className="space-y-3 p-5">
        <Input value={intent} onChange={(e) => setIntent(e.target.value)} placeholder="What should the message say? (optional)" />
        <Button
          size="sm"
          variant="secondary"
          loading={busy}
          icon={<Sparkles className="h-3.5 w-3.5" />}
          onClick={async () => {
            setBusy(true);
            try {
              setDraft(await api.get(`/api/grievances/${g.id}/ai-draft?intent=${encodeURIComponent(intent)}`));
            } catch (e) {
              toast({ tone: "error", text: (e as Error).message });
            } finally {
              setBusy(false);
            }
          }}
        >
          Generate draft
        </Button>
        {draft && (
          <>
            <Textarea value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} rows={5} className={g.citizen.preferredLanguage === "te" ? "telugu" : ""} />
            <div className="text-[11.5px] text-slate-500">{draft.source === "ai" ? `AI draft · ${draft.provider}` : "Template draft (AI not configured)"} — review before sending.</div>
            <Button
              size="sm"
              icon={<MessageCircle className="h-3.5 w-3.5" />}
              onClick={async () => {
                try {
                  await api.post(`/api/grievances/${g.id}/notes`, { message: draft.text, visibility: "CITIZEN" });
                  toast({ tone: "success", text: "Message sent to citizen" });
                  setDraft(null);
                  setIntent("");
                  onSent();
                } catch (e) {
                  toast({ tone: "error", text: (e as Error).message });
                }
              }}
            >
              Send to citizen
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}

function TransitionModal({ g, to, onClose, onDone }: { g: Detail; to: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [citizenMessage, setCitizenMessage] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [resolutionNotes, setResolutionNotes] = useState(to === "RESOLVED" ? g.resolutionNotes ?? "" : "");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await api.post(`/api/grievances/${g.id}/status`, {
        to,
        citizenMessage: citizenMessage || undefined,
        internalNote: internalNote || undefined,
        resolutionNotes: resolutionNotes || undefined,
      });
      toast({ tone: "success", text: `Status changed to ${STATUS_META[to]?.label}` });
      onDone();
    } catch (e) {
      toast({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`${TRANSITION_LABEL[to] ?? to} · ${g.ticketNumber}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy} variant={to === "RESOLVED" ? "teal" : "primary"}>
            Confirm
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[13px] text-slate-600">
          {STATUS_META[g.status]?.label} → <strong>{STATUS_META[to]?.label}</strong>. This change is recorded in the audit trail with your name and time.
        </p>
        {to === "RESOLVED" && (
          <Field label="Resolution notes (sent to the citizen)" required>
            <Textarea value={resolutionNotes} onChange={(e) => setResolutionNotes(e.target.value)} rows={3} placeholder="What was done to resolve the problem?" />
          </Field>
        )}
        {to !== "RESOLVED" && (
          <Field label={to === "AWAITING_INFO" ? "What information is needed? (sent to the citizen)" : to === "CLOSED" ? "Closure reason (sent to the citizen)" : "Message to citizen (optional)"} required={to === "AWAITING_INFO" || to === "CLOSED"}>
            <Textarea value={citizenMessage} onChange={(e) => setCitizenMessage(e.target.value)} rows={3} />
          </Field>
        )}
        <Field label="Internal note (optional)">
          <Textarea value={internalNote} onChange={(e) => setInternalNote(e.target.value)} rows={2} />
        </Field>
        {to === "RESOLVED" && <Notice tone="info">The citizen will be asked on WhatsApp to confirm the problem is solved, or reopen it.</Notice>}
      </div>
    </Modal>
  );
}
