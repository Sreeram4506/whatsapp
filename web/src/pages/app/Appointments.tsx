import { useState } from "react";
import { CalendarClock, CalendarX2, Check } from "lucide-react";
import { api } from "../../lib/api";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../lib/auth";
import { fmtDate } from "../../lib/format";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, Notice, PageHeader, Spinner, Textarea } from "../../components/ui";
import { useToast } from "../../components/ui/toast";

interface Appt {
  id: string;
  reference: string;
  purpose: string;
  preferredDate: string;
  preferredSlot: string;
  status: string;
  scheduledAt: string | null;
  officeNote: string | null;
  createdAt: string;
  citizen: { name: string | null; phone: string };
}
const SLOT: Record<string, string> = { MORNING: "Morning 10–12", AFTERNOON: "Afternoon 2–4", EVENING: "Evening 4–6" };
const TONE: Record<string, string> = {
  REQUESTED: "bg-amber-50 text-amber-800 ring-amber-200",
  CONFIRMED: "bg-teal-50 text-teal-800 ring-teal-200",
  COMPLETED: "bg-slate-100 text-slate-600 ring-slate-200",
  CANCELLED: "bg-red-50 text-red-700 ring-red-200",
};

export default function Appointments() {
  const { me } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState("");
  const { data, error, loading, reload } = useApi<{ items: Appt[] }>(`/api/appointments${status ? `?status=${status}` : ""}`);
  const [confirm, setConfirm] = useState<Appt | null>(null);
  const [when, setWhen] = useState("");
  const [note, setNote] = useState("");
  const isAdmin = me?.user.role === "OFFICE_ADMIN";

  const update = async (a: Appt, body: Record<string, unknown>, msg: string) => {
    try {
      await api.patch(`/api/appointments/${a.id}`, body);
      toast({ tone: "success", text: msg });
      setConfirm(null);
      void reload();
    } catch (e) {
      toast({ tone: "error", text: (e as Error).message });
    }
  };

  return (
    <div>
      <PageHeader title="Appointment Requests" subtitle="Requested by citizens through WhatsApp. Confirmations are sent back to the citizen." />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {["", "REQUESTED", "CONFIRMED", "COMPLETED", "CANCELLED"].map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={`rounded-full px-3 py-1 text-[12.5px] font-medium ring-1 ${status === s ? "bg-navy-900 text-white ring-navy-900" : "bg-white text-slate-600 ring-slate-300"}`}>
            {s ? s[0] + s.slice(1).toLowerCase() : "All"}
          </button>
        ))}
      </div>
      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data && <Spinner />}
      {data && data.items.length === 0 && (
        <Card>
          <EmptyState title="No appointment requests" icon={<CalendarClock className="h-6 w-6" />} />
        </Card>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data?.items.map((a) => (
          <Card key={a.id} className="flex flex-col p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[13px] font-semibold text-navy-800">{a.reference}</span>
              <Badge className={TONE[a.status]}>{a.status[0] + a.status.slice(1).toLowerCase()}</Badge>
            </div>
            <p className="mt-2 text-[14px] text-slate-800">{a.purpose}</p>
            <div className="mt-2 space-y-0.5 text-[12.5px] text-slate-500">
              <div>
                Preferred: {fmtDate(a.preferredDate)} · {SLOT[a.preferredSlot]}
              </div>
              {a.scheduledAt && <div className="font-medium text-teal-800">Scheduled: {fmtDate(a.scheduledAt, true)}</div>}
              <div>
                {a.citizen.name ?? "Citizen"} · {a.citizen.phone}
              </div>
              {a.officeNote && <div className="italic">Note: {a.officeNote}</div>}
            </div>
            {isAdmin && (a.status === "REQUESTED" || a.status === "CONFIRMED") && (
              <div className="mt-auto flex gap-2 pt-3">
                {a.status === "REQUESTED" && (
                  <Button size="sm" variant="teal" icon={<Check className="h-3.5 w-3.5" />} onClick={() => { setConfirm(a); setWhen(a.preferredDate.slice(0, 10) + "T" + (a.preferredSlot === "MORNING" ? "10:30" : a.preferredSlot === "AFTERNOON" ? "14:30" : "16:30")); setNote(""); }}>
                    Confirm
                  </Button>
                )}
                {a.status === "CONFIRMED" && (
                  <Button size="sm" variant="secondary" onClick={() => update(a, { status: "COMPLETED" }, "Marked completed")}>
                    Mark completed
                  </Button>
                )}
                <Button size="sm" variant="ghost" icon={<CalendarX2 className="h-3.5 w-3.5" />} onClick={() => update(a, { status: "CANCELLED", officeNote: "The office could not schedule this request. Please contact the office for alternatives." }, "Request declined — citizen informed")}>
                  Decline
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
      {confirm && (
        <Modal open onClose={() => setConfirm(null)} title={`Confirm ${confirm.reference}`} footer={<Button onClick={() => update(confirm, { status: "CONFIRMED", scheduledAt: new Date(when).toISOString(), officeNote: note || undefined }, "Appointment confirmed — citizen notified")} disabled={!when}>Confirm & notify citizen</Button>}>
          <div className="space-y-3">
            <Field label="Date & time" required>
              <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            </Field>
            <Field label="Note to citizen (optional)">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="e.g. Please meet the PA at the camp office." />
            </Field>
            <Notice tone="info">The citizen receives this confirmation on WhatsApp (or in the simulator for demo chats).</Notice>
          </div>
        </Modal>
      )}
    </div>
  );
}
