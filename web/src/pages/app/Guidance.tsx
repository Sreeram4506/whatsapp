import { useState } from "react";
import { BadgeCheck, ExternalLink, FilePen, Plus } from "lucide-react";
import { api } from "../../lib/api";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../lib/auth";
import { fmtDate } from "../../lib/format";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, Notice, PageHeader, Select, Spinner, Textarea } from "../../components/ui";
import { useToast } from "../../components/ui/toast";

interface Article {
  id: string;
  type: "SCHEME" | "CERTIFICATE";
  code: string;
  titleEn: string;
  titleTe: string;
  summaryEn: string;
  summaryTe: string;
  stepsEn: string[];
  stepsTe: string[];
  documentsEn: string[];
  documentsTe: string[];
  officialSourceName: string;
  officialSourceUrl: string;
  status: "DRAFT" | "VERIFIED" | "ARCHIVED";
  lastVerifiedAt: string | null;
  verificationNote: string | null;
}

const EMPTY = { type: "SCHEME", code: "", titleEn: "", titleTe: "", summaryEn: "", summaryTe: "", stepsEn: "", stepsTe: "", documentsEn: "", documentsTe: "", officialSourceName: "", officialSourceUrl: "https://" };

export default function Guidance() {
  const { me } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<{ items: Article[] }>("/api/guidance");
  const [verify, setVerify] = useState<Article | null>(null);
  const [note, setNote] = useState("");
  const [checked, setChecked] = useState(false);
  const [editing, setEditing] = useState<(typeof EMPTY & { id?: string }) | null>(null);
  const isAdmin = me?.user.role === "OFFICE_ADMIN";

  const save = async () => {
    if (!editing) return;
    const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
    const body = { ...editing, stepsEn: lines(editing.stepsEn), stepsTe: lines(editing.stepsTe), documentsEn: lines(editing.documentsEn), documentsTe: lines(editing.documentsTe) };
    delete (body as { id?: string }).id;
    try {
      if (editing.id) await api.patch(`/api/guidance/${editing.id}`, body);
      else await api.post("/api/guidance", body);
      toast({ tone: "success", text: "Saved as draft — verify against the official source before relying on it" });
      setEditing(null);
      void reload();
    } catch (e) {
      toast({ tone: "error", text: (e as Error).message });
    }
  };

  return (
    <div>
      <PageHeader
        title="Government Service Guidance"
        subtitle="Information shared by the WhatsApp bot. Each entry shows its official source and when the office last verified it."
        actions={isAdmin && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ ...EMPTY })}>New entry</Button>}
      />
      <Notice tone="warn" className="mb-4">
        Guidance is information only — never an application, approval or eligibility decision. Entries marked <strong>Not verified</strong> are sample content: an office administrator must check the official source and mark them verified.
      </Notice>
      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data && <Spinner />}
      {data && data.items.length === 0 && (
        <Card>
          <EmptyState title="No guidance entries yet" />
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {data?.items.map((a) => (
          <Card key={a.id} className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-slate-100 text-slate-700 ring-slate-200">{a.type === "SCHEME" ? "Scheme" : "Certificate"}</Badge>
              {a.status === "VERIFIED" ? (
                <Badge className="bg-emerald-50 text-emerald-800 ring-emerald-200">
                  <BadgeCheck className="h-3 w-3" /> Verified {fmtDate(a.lastVerifiedAt)}
                </Badge>
              ) : (
                <Badge className="bg-amber-50 text-amber-800 ring-amber-200">{a.status === "ARCHIVED" ? "Archived" : "Not verified (sample)"}</Badge>
              )}
            </div>
            <h3 className="mt-2 text-[16px] font-semibold text-navy-900">
              {a.titleEn} <span className="telugu font-normal text-slate-500">· {a.titleTe}</span>
            </h3>
            <p className="mt-1 text-[13px] text-slate-600">{a.summaryEn}</p>
            <ol className="mt-3 list-decimal space-y-0.5 pl-5 text-[13px] text-slate-700">
              {a.stepsEn.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            {a.documentsEn.length > 0 && <p className="mt-2 text-[12.5px] text-slate-500">Documents: {a.documentsEn.join(", ")}</p>}
            <a href={a.officialSourceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-navy-700 hover:underline">
              {a.officialSourceName} <ExternalLink className="h-3.5 w-3.5" />
            </a>
            {a.verificationNote && <p className="mt-1 text-[12px] italic text-slate-500">Verification note: {a.verificationNote}</p>}
            {isAdmin && (
              <div className="mt-4 flex gap-2">
                {a.status !== "VERIFIED" && (
                  <Button size="sm" variant="teal" icon={<BadgeCheck className="h-3.5 w-3.5" />} onClick={() => { setVerify(a); setNote(""); setChecked(false); }}>
                    Mark verified
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<FilePen className="h-3.5 w-3.5" />}
                  onClick={() =>
                    setEditing({
                      id: a.id,
                      type: a.type,
                      code: a.code,
                      titleEn: a.titleEn,
                      titleTe: a.titleTe,
                      summaryEn: a.summaryEn,
                      summaryTe: a.summaryTe,
                      stepsEn: a.stepsEn.join("\n"),
                      stepsTe: a.stepsTe.join("\n"),
                      documentsEn: a.documentsEn.join("\n"),
                      documentsTe: a.documentsTe.join("\n"),
                      officialSourceName: a.officialSourceName,
                      officialSourceUrl: a.officialSourceUrl,
                    })
                  }
                >
                  Edit
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>

      {verify && (
        <Modal
          open
          onClose={() => setVerify(null)}
          title={`Verify · ${verify.titleEn}`}
          footer={
            <Button
              variant="teal"
              disabled={!checked || note.trim().length < 5}
              onClick={async () => {
                try {
                  await api.post(`/api/guidance/${verify.id}/verify`, { note, sourceChecked: true });
                  toast({ tone: "success", text: "Marked verified" });
                  setVerify(null);
                  void reload();
                } catch (e) {
                  toast({ tone: "error", text: (e as Error).message });
                }
              }}
            >
              Confirm verification
            </Button>
          }
        >
          <div className="space-y-3 text-[13px]">
            <p>
              Open <a className="font-medium text-navy-700 underline" href={verify.officialSourceUrl} target="_blank" rel="noreferrer">{verify.officialSourceUrl}</a> and check that the summary, steps and documents match the official information today.
            </p>
            <Field label="What did you check?" required>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Steps and documents checked against the portal FAQ" />
            </Field>
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 h-4 w-4" />
              I checked this entry against the official source. My name and today's date will be recorded.
            </label>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal open onClose={() => setEditing(null)} title={editing.id ? "Edit guidance (resets verification)" : "New guidance entry"} wide footer={<Button onClick={save}>Save draft</Button>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Type">
              <Select value={editing.type} onChange={(e) => setEditing({ ...editing, type: e.target.value })}>
                <option value="SCHEME">Scheme</option>
                <option value="CERTIFICATE">Certificate</option>
              </Select>
            </Field>
            <Field label="Code" hint="UPPERCASE_ID">
              <Input value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })} disabled={!!editing.id} />
            </Field>
            <Field label="Title (English, ≤24 chars)">
              <Input value={editing.titleEn} maxLength={24} onChange={(e) => setEditing({ ...editing, titleEn: e.target.value })} />
            </Field>
            <Field label="Title (Telugu, ≤24 chars)">
              <Input value={editing.titleTe} maxLength={24} onChange={(e) => setEditing({ ...editing, titleTe: e.target.value })} className="telugu" />
            </Field>
            <Field label="Summary (English)">
              <Textarea value={editing.summaryEn} onChange={(e) => setEditing({ ...editing, summaryEn: e.target.value })} rows={2} />
            </Field>
            <Field label="Summary (Telugu)">
              <Textarea value={editing.summaryTe} onChange={(e) => setEditing({ ...editing, summaryTe: e.target.value })} rows={2} className="telugu" />
            </Field>
            <Field label="Steps (English, one per line)">
              <Textarea value={editing.stepsEn} onChange={(e) => setEditing({ ...editing, stepsEn: e.target.value })} rows={4} />
            </Field>
            <Field label="Steps (Telugu, one per line)">
              <Textarea value={editing.stepsTe} onChange={(e) => setEditing({ ...editing, stepsTe: e.target.value })} rows={4} className="telugu" />
            </Field>
            <Field label="Documents (English, one per line)">
              <Textarea value={editing.documentsEn} onChange={(e) => setEditing({ ...editing, documentsEn: e.target.value })} rows={3} />
            </Field>
            <Field label="Documents (Telugu, one per line)">
              <Textarea value={editing.documentsTe} onChange={(e) => setEditing({ ...editing, documentsTe: e.target.value })} rows={3} className="telugu" />
            </Field>
            <Field label="Official source name">
              <Input value={editing.officialSourceName} onChange={(e) => setEditing({ ...editing, officialSourceName: e.target.value })} />
            </Field>
            <Field label="Official source URL (https)">
              <Input value={editing.officialSourceUrl} onChange={(e) => setEditing({ ...editing, officialSourceUrl: e.target.value })} />
            </Field>
          </div>
        </Modal>
      )}
    </div>
  );
}
