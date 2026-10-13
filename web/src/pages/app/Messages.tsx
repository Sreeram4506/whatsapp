import { useState } from "react";
import { RotateCw } from "lucide-react";
import { api, qs } from "../../lib/api";
import { useApi } from "../../hooks/useApi";
import { DELIVERY_META, fmtDate } from "../../lib/format";
import { Badge, Button, Card, ErrorState, Notice, PageHeader, Pagination, Select, Spinner } from "../../components/ui";
import { useToast } from "../../components/ui/toast";

interface Msg {
  id: string;
  channel: string;
  status: string;
  body: string;
  error: string | null;
  attempts: number;
  createdAt: string;
  statusUpdatedAt: string | null;
  to: string;
  grievanceId: string | null;
}

export default function Messages() {
  const toast = useToast();
  const [status, setStatus] = useState("");
  const [channel, setChannel] = useState("");
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<{ total: number; page: number; pageSize: number; counts: Record<string, number>; items: Msg[] }>(`/api/messages${qs({ status, channel, page })}`);
  return (
    <div>
      <PageHeader title="WhatsApp Delivery Log" subtitle="Every outgoing message with its real delivery status — simulated messages are labelled and never counted as sent" />
      {data && (
        <div className="mb-4 flex flex-wrap gap-2">
          {Object.entries(data.counts).map(([k, v]) => (
            <Badge key={k} className={DELIVERY_META[k]?.tone ?? ""}>
              {DELIVERY_META[k]?.label ?? k}: {v}
            </Badge>
          ))}
        </div>
      )}
      <Card className="mb-4 flex flex-wrap gap-2 p-3">
        <Select value={channel} onChange={(e) => { setChannel(e.target.value); setPage(1); }} className="w-48" aria-label="Channel">
          <option value="">All channels</option>
          <option value="WHATSAPP">WhatsApp Cloud API</option>
          <option value="SIMULATOR">Simulator (demo)</option>
        </Select>
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-56" aria-label="Status">
          <option value="">Any status</option>
          {Object.entries(DELIVERY_META).filter(([k]) => k !== "RECEIVED").map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </Select>
      </Card>
      <Notice tone="info" className="mb-4">
        Status updates (sent → delivered → read, or failed with Meta's error code) arrive through the verified webhook. Office updates outside WhatsApp's 24-hour window require an approved template; without one they are marked failed rather than silently dropped.
      </Notice>
      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data && <Spinner />}
      {data && (
        <Card>
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[820px] text-[12.5px]">
              <thead className="bg-slate-50/80 text-left text-[12px] text-slate-500">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Time</th>
                  <th className="px-3 py-2.5 font-medium">To</th>
                  <th className="px-3 py-2.5 font-medium">Message</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((m) => (
                  <tr key={m.id} className="align-top">
                    <td className="whitespace-nowrap px-5 py-2 text-slate-500">{fmtDate(m.createdAt, true)}</td>
                    <td className="px-3 py-2 font-mono text-[12px]">{m.to}</td>
                    <td className="max-w-[420px] px-3 py-2">
                      <p className="line-clamp-2 text-slate-700">{m.body}</p>
                      {m.grievanceId && (
                        <a className="text-[11.5px] text-navy-700 hover:underline" href={`/app/grievances/${m.grievanceId}`}>
                          Open case
                        </a>
                      )}
                      {m.error && <p className="mt-0.5 text-[11.5px] text-red-600">{m.error}</p>}
                    </td>
                    <td className="px-3 py-2">
                      <Badge className={DELIVERY_META[m.status]?.tone ?? ""}>{DELIVERY_META[m.status]?.label ?? m.status}</Badge>
                      {m.attempts > 1 && <div className="mt-0.5 text-[11px] text-slate-400">{m.attempts} attempts</div>}
                    </td>
                    <td className="px-5 py-2 text-right">
                      {m.status === "FAILED" && m.channel === "WHATSAPP" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={<RotateCw className="h-3.5 w-3.5" />}
                          onClick={async () => {
                            const r = await api.post<{ status: string }>(`/api/messages/${m.id}/retry`);
                            toast({ tone: r.status === "SENT" ? "success" : "error", text: `Retry result: ${r.status}` });
                            void reload();
                          }}
                        >
                          Retry
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </Card>
      )}
    </div>
  );
}
