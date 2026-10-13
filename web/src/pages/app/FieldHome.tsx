import { useState } from "react";
import { Link } from "react-router";
import { AlarmClock, CalendarClock, ChevronRight, ClipboardCheck, MapPin } from "lucide-react";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../lib/auth";
import { qs } from "../../lib/api";
import { daysSince, fmtDate } from "../../lib/format";
import type { GrievanceListItem, Paged } from "../../lib/types";
import { Card, EmptyState, ErrorState, PageHeader, Pagination, PriorityBadge, Skeleton, StatusBadge } from "../../components/ui";

const TABS = [
  { key: "active", label: "Active", params: { status: "ASSIGNED,IN_PROGRESS,AWAITING_INFO,REOPENED" } },
  { key: "overdue", label: "Overdue", params: { overdue: "true" } },
  { key: "done", label: "Resolved", params: { status: "RESOLVED,CLOSED" } },
];

/** Mobile-friendly worklist for field officers — the server only returns cases assigned to them. */
export default function FieldHome() {
  const { me } = useAuth();
  const [tab, setTab] = useState("active");
  const [page, setPage] = useState(1);
  const t = TABS.find((x) => x.key === tab)!;
  const { data, error, loading, reload } = useApi<Paged<GrievanceListItem>>(`/api/grievances${qs({ ...t.params, sort: "priority", page, pageSize: 20 })}`);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="My Assignments" subtitle={`${me?.user.name}${me?.user.team ? ` · ${me.user.team.name}` : ""} — only cases assigned to you are shown`} />
      <div className="mb-4 flex gap-1 rounded-xl bg-white p-1 ring-1 ring-slate-200">
        {TABS.map((x) => (
          <button key={x.key} onClick={() => { setTab(x.key); setPage(1); }} className={`flex-1 rounded-lg py-2 text-[13.5px] font-medium ${tab === x.key ? "bg-navy-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
            {x.label}
          </button>
        ))}
      </div>
      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      )}
      {data && data.items.length === 0 && (
        <Card>
          <EmptyState title="Nothing here" icon={<ClipboardCheck className="h-6 w-6" />}>
            {tab === "active" ? "You have no active assignments right now." : "No cases in this list."}
          </EmptyState>
        </Card>
      )}
      <div className="space-y-3">
        {data?.items.map((g) => (
          <Link key={g.id} to={`/app/grievances/${g.id}`}>
            <Card className="p-4 transition hover:ring-teal-300">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[13px] font-semibold text-navy-800">{g.ticketNumber}</span>
                    <PriorityBadge priority={g.priority} />
                    <StatusBadge status={g.status} />
                  </div>
                  <div className="mt-1.5 text-[14px] font-medium text-slate-800">
                    {g.category.emoji} {g.category.nameEn}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[13px] text-slate-600">{g.summary}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" /> {g.village ?? "—"}, {g.mandal}
                    </span>
                    <span className={`flex items-center gap-1 ${g.overdue ? "font-medium text-red-700" : ""}`}>
                      {g.overdue ? <AlarmClock className="h-3.5 w-3.5" /> : <CalendarClock className="h-3.5 w-3.5" />} Due {fmtDate(g.dueAt)}
                    </span>
                    <span>{daysSince(g.createdAt)} days open</span>
                  </div>
                  {g.resolutionRequested && <div className="mt-1.5 text-[12px] font-medium text-teal-700">Reported complete — awaiting office confirmation</div>}
                </div>
                <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-slate-300" />
              </div>
            </Card>
          </Link>
        ))}
      </div>
      {data && data.total > data.pageSize && (
        <Card className="mt-3">
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </Card>
      )}
    </div>
  );
}
