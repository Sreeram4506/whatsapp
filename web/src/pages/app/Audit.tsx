import { useState } from "react";
import { useApi } from "../../hooks/useApi";
import { qs } from "../../lib/api";
import { fmtDate, ROLE_LABEL } from "../../lib/format";
import type { Paged } from "../../lib/types";
import { Card, ErrorState, PageHeader, Pagination, Select, Spinner } from "../../components/ui";

interface Entry {
  id: string;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

export default function Audit() {
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<Paged<Entry>>(`/api/audit${qs({ action, page })}`);
  return (
    <div>
      <PageHeader
        title="Audit Log"
        subtitle="Append-only record of sign-ins, case changes, exports, contact reveals and configuration changes"
        actions={
          <Select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} className="w-56" aria-label="Filter by action">
            <option value="">All actions</option>
            <option value="grievance.">Case changes</option>
            <option value="auth.">Sign-ins</option>
            <option value="citizen.">Citizen data access</option>
            <option value="report.">Reports & exports</option>
            <option value="user.">Staff management</option>
            <option value="settings.">Settings</option>
            <option value="ai.">AI questions</option>
          </Select>
        }
      />
      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data && <Spinner />}
      {data && (
        <Card>
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[820px] text-[12.5px]">
              <thead className="bg-slate-50/80 text-left text-[12px] text-slate-500">
                <tr>
                  <th className="px-5 py-2.5 font-medium">When</th>
                  <th className="px-3 py-2.5 font-medium">Who</th>
                  <th className="px-3 py-2.5 font-medium">Action</th>
                  <th className="px-3 py-2.5 font-medium">Record</th>
                  <th className="px-5 py-2.5 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((e) => (
                  <tr key={e.id} className="align-top">
                    <td className="whitespace-nowrap px-5 py-2 text-slate-500">{fmtDate(e.createdAt, true)}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-800">{e.actorName ?? "system"}</div>
                      {e.actorRole && <div className="text-[11px] text-slate-500">{ROLE_LABEL[e.actorRole] ?? e.actorRole}</div>}
                    </td>
                    <td className="px-3 py-2 font-mono text-[12px] text-navy-800">{e.action}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {e.entityType === "Grievance" && e.entityId ? (
                        <a className="text-navy-700 hover:underline" href={`/app/grievances/${e.entityId}`}>
                          {(e.details?.ticket as string) ?? "Grievance"}
                        </a>
                      ) : (
                        e.entityType
                      )}
                    </td>
                    <td className="max-w-[360px] truncate px-5 py-2 font-mono text-[11.5px] text-slate-500" title={JSON.stringify(e.details)}>
                      {e.details ? JSON.stringify(e.details) : ""}
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
