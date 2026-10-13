import { FormEvent, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { api, qs } from "../../lib/api";
import { useApi } from "../../hooks/useApi";
import { fmtDate } from "../../lib/format";
import type { Paged } from "../../lib/types";
import { Badge, Button, Card, CardHeader, ErrorState, Field, Input, Modal, Notice, PageHeader, Pagination, Spinner } from "../../components/ui";
import { useToast } from "../../components/ui/toast";

interface CitizenRow {
  id: string;
  name: string | null;
  phone: string;
  language: string;
  village: string | null;
  optedOut: boolean;
  consentAt: string | null;
  erasedAt: string | null;
  createdAt: string;
  grievances: number;
  appointments: number;
}

export default function Citizens() {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<Paged<CitizenRow>>(`/api/citizens${qs({ q: term, page })}`);
  const retention = useApi<{ retentionMonths: number; cutoff: string; citizensToAnonymise: number }>("/api/retention/preview");
  const [erase, setErase] = useState<CitizenRow | null>(null);
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");

  return (
    <div>
      <PageHeader title="Citizen Records" subtitle="Minimal personal data, consent records and data-subject requests" />
      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <Card>
          <div className="border-b border-slate-100 p-3">
            <form onSubmit={(e: FormEvent) => { e.preventDefault(); setTerm(q); setPage(1); }} className="relative max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or last digits of phone" className="pl-9" />
            </form>
          </div>
          {error && <div className="p-4"><ErrorState error={error} onRetry={reload} /></div>}
          {loading && !data && <Spinner />}
          {data && (
            <>
              <div className="scrollbar-thin overflow-x-auto">
                <table className="w-full min-w-[720px] text-[13px]">
                  <thead className="bg-slate-50/80 text-left text-[12px] text-slate-500">
                    <tr>
                      <th className="px-5 py-2.5 font-medium">Citizen</th>
                      <th className="px-3 py-2.5 font-medium">Village</th>
                      <th className="px-3 py-2.5 font-medium">Grievances</th>
                      <th className="px-3 py-2.5 font-medium">Consent</th>
                      <th className="px-3 py-2.5 font-medium">Updates</th>
                      <th className="px-5 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.items.map((c) => (
                      <tr key={c.id}>
                        <td className="px-5 py-2.5">
                          <div className="font-medium text-slate-800">{c.name ?? "—"}</div>
                          <div className="font-mono text-[12px] text-slate-500">{c.phone}</div>
                        </td>
                        <td className="px-3 text-slate-600">{c.village ?? "—"}</td>
                        <td className="px-3 tabular-nums">{c.grievances}</td>
                        <td className="px-3 text-[12px] text-slate-600">{c.consentAt ? fmtDate(c.consentAt) : "—"}</td>
                        <td className="px-3">{c.erasedAt ? <Badge className="bg-slate-100 text-slate-500 ring-slate-200">Erased</Badge> : c.optedOut ? <Badge className="bg-amber-50 text-amber-800 ring-amber-200">Opted out</Badge> : <Badge className="bg-teal-50 text-teal-800 ring-teal-200">Subscribed</Badge>}</td>
                        <td className="px-5 text-right">
                          {!c.erasedAt && (
                            <Button size="sm" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => { setErase(c); setReason(""); setConfirm(""); }}>
                              Erase data
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
            </>
          )}
        </Card>
        <Card className="h-fit">
          <CardHeader title="Data retention" subtitle="Anonymise citizens whose cases are all closed and older than the retention period" />
          <div className="space-y-3 p-5 text-[13px]">
            {retention.data && (
              <>
                <p>
                  Retention period: <strong>{retention.data.retentionMonths} months</strong> (cut-off {fmtDate(retention.data.cutoff)}).
                </p>
                <p>
                  Citizens eligible for anonymisation: <strong>{retention.data.citizensToAnonymise}</strong>
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!retention.data.citizensToAnonymise}
                  onClick={async () => {
                    const r = await api.post<{ anonymised: number }>("/api/retention/apply", { confirm: "APPLY" });
                    toast({ tone: "success", text: `${r.anonymised} citizen records anonymised` });
                    void retention.reload();
                    void reload();
                  }}
                >
                  Apply retention policy
                </Button>
              </>
            )}
            <Notice tone="info">Anonymisation removes names, phone numbers, locations, descriptions and files, but keeps anonymous case counts for statistics. Every run is audited.</Notice>
          </div>
        </Card>
      </div>

      {erase && (
        <Modal
          open
          onClose={() => setErase(null)}
          title="Erase citizen's personal data"
          footer={
            <Button
              variant="danger"
              disabled={confirm !== "ERASE" || reason.trim().length < 5}
              onClick={async () => {
                try {
                  await api.post(`/api/citizens/${erase.id}/erase`, { reason, confirm: "ERASE" });
                  toast({ tone: "success", text: "Personal data erased" });
                  setErase(null);
                  void reload();
                } catch (e) {
                  toast({ tone: "error", text: (e as Error).message });
                }
              }}
            >
              Erase permanently
            </Button>
          }
        >
          <div className="space-y-3 text-[13px]">
            <Notice tone="warn">This permanently removes {erase.name ?? "this citizen"}'s name, phone number, chat history, uploaded files and complaint descriptions. Case counts remain for statistics. This cannot be undone.</Notice>
            <Field label="Reason (e.g. citizen's request received on…)" required>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <Field label='Type "ERASE" to confirm' required>
              <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </Field>
          </div>
        </Modal>
      )}
    </div>
  );
}
