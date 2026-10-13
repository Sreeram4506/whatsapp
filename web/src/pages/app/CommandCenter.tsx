import { useState } from "react";
import { Link } from "react-router";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlarmClock,
  AlertOctagon,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileStack,
  Hourglass,
  Inbox,
  Repeat2,
  Smile,
  TriangleAlert,
} from "lucide-react";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../lib/auth";
import { qs } from "../../lib/api";
import type { Meta } from "../../lib/types";
import { AskAI } from "../../components/AskAI";
import { axisProps, C, ChartTooltip, Legend, MiniBar } from "../../components/charts/theme";
import { Badge, Card, CardHeader, EmptyState, ErrorState, PageHeader, Select, Skeleton } from "../../components/ui";
import { fmtDate } from "../../lib/format";

interface Dashboard {
  range: { days: number };
  kpis: {
    total: number;
    newToday: number;
    pending: number;
    highPriorityOpen: number;
    criticalOpen: number;
    overdue: number;
    escalated: number;
    resolved: number;
    reopened: number;
    avgResolutionDays: { value: number | null; sampleSize: number; sufficient: boolean; minimum: number };
    satisfaction: { average: number | null; responses: number };
    pendingAppointments: number;
  };
  byCategory: { code: string; name: string; emoji: string; total: number; open: number; resolved: number; resolutionRate: number }[];
  byMandal: { name: string; total: number; open: number; resolved: number }[];
  topVillages: { village: string; mandal: string; open: number; overdue: number; total: number }[];
  trend: { date: string; received: number; resolved: number }[];
  statusDist: { status: string; label: string; count: number }[];
  teamWorkload: { team: string; department: string; open: number; inProgress: number; overdue: number; highPriority: number }[];
  repeated: { village: string; mandal: string; category: string; complaints: number; open: number; latest: string }[];
  dataNotes: { isDemoData: boolean; recordsInWorkspace: number; recordsInRange: number; generatedAt: string };
}

function Kpi({ label, value, sub, icon: Icon, tone = "navy", to }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon: typeof Inbox; tone?: "navy" | "teal" | "orange" | "red" | "slate"; to?: string }) {
  const tones = {
    navy: "bg-navy-50 text-navy-700",
    teal: "bg-teal-50 text-teal-700",
    orange: "bg-orange-50 text-orange-700",
    red: "bg-red-50 text-red-700",
    slate: "bg-slate-100 text-slate-600",
  };
  const body = (
    <Card className="h-full p-4 transition hover:ring-teal-300">
      <div className="flex items-start justify-between">
        <span className="text-[12.5px] font-medium text-slate-500">{label}</span>
        <span className={`rounded-lg p-1.5 ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-2 text-[28px] font-bold leading-none tracking-tight text-navy-900 tabular-nums">{value}</div>
      {sub && <div className="mt-1.5 text-[12px] text-slate-500">{sub}</div>}
    </Card>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

const shortDate = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export default function CommandCenter() {
  const { me } = useAuth();
  const [days, setDays] = useState(30);
  const [mandalId, setMandalId] = useState("");
  const { data, error, loading, reload } = useApi<Dashboard>(`/api/dashboard${qs({ days, mandalId })}`);
  const meta = useApi<Meta>("/api/meta");
  const villages = meta.data?.mandals.flatMap((m) => m.villages.map((v) => ({ id: v.id, name: `${v.name} (${m.name})` }))) ?? [];

  const k = data?.kpis;
  return (
    <div>
      <PageHeader
        title="MLA Intelligence Command Center"
        subtitle={
          <>
            {me?.tenant?.officeName} · live figures from the grievance database
            {data?.dataNotes.isDemoData && <Badge className="ml-2 bg-amber-50 text-amber-800 ring-amber-200">Fictional demo data</Badge>}
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg bg-white p-0.5 ring-1 ring-slate-300" role="group" aria-label="Time range">
              {[7, 30, 90, 365].map((d) => (
                <button key={d} onClick={() => setDays(d)} className={`rounded-md px-3 py-1.5 text-[13px] font-medium ${days === d ? "bg-navy-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                  {d === 365 ? "1y" : `${d}d`}
                </button>
              ))}
            </div>
            <Select value={mandalId} onChange={(e) => setMandalId(e.target.value)} className="h-9 w-48 text-[13px]" aria-label="Mandal filter">
              <option value="">All mandals</option>
              {meta.data?.mandals.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </div>
        }
      />

      {error && <ErrorState error={error} onRetry={reload} />}

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        {loading && !k
          ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[112px]" />)
          : k && (
              <>
                <Kpi label="Total grievances" value={k.total} sub="all time" icon={FileStack} to="/app/grievances" />
                <Kpi label="New today" value={k.newToday} sub="since midnight IST" icon={Inbox} tone="teal" to="/app/grievances?sort=created_desc" />
                <Kpi label="Pending" value={k.pending} sub="open cases" icon={Hourglass} tone="slate" to="/app/grievances?open=true" />
                <Kpi label="High priority open" value={k.highPriorityOpen} sub={`${k.criticalOpen} critical`} icon={TriangleAlert} tone="orange" to="/app/grievances?open=true&sort=priority" />
                <Kpi label="Overdue" value={k.overdue} sub={`${k.escalated} escalated`} icon={AlarmClock} tone="red" to="/app/grievances?overdue=true" />
                <Kpi label="Resolved / closed" value={k.resolved} sub={`${k.reopened} reopened by citizens`} icon={CheckCircle2} tone="teal" />
                <Kpi
                  label="Avg. resolution"
                  value={k.avgResolutionDays.sufficient ? `${k.avgResolutionDays.value}d` : "—"}
                  sub={k.avgResolutionDays.sufficient ? `${k.avgResolutionDays.sampleSize} cases in ${days}d` : `Insufficient data (<${k.avgResolutionDays.minimum} resolved)`}
                  icon={Clock3}
                />
                <Kpi label="Citizen satisfaction" value={k.satisfaction.average ? `${k.satisfaction.average}/5` : "—"} sub={`${k.satisfaction.responses} ratings`} icon={Smile} tone="teal" />
              </>
            )}
      </div>

      {data && (
        <>
          <div className="mt-5 grid gap-5 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader title="Complaint trend" subtitle={`Received vs resolved per day · last ${days} days`} action={<Legend items={[{ label: "Received", color: C.s2 }, { label: "Resolved", color: C.s1 }]} />} />
              <div className="h-64 px-2 pb-3 pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.trend} margin={{ left: -18, right: 12, top: 4 }}>
                    <CartesianGrid stroke={C.grid} vertical={false} />
                    <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={24} {...axisProps} />
                    <YAxis allowDecimals={false} {...axisProps} />
                    <Tooltip content={<ChartTooltip labelFormatter={(l) => fmtDate(l + "T00:00:00")} />} cursor={{ stroke: "#94a3b8", strokeDasharray: "3 3" }} />
                    <Line isAnimationActive={false} type="monotone" dataKey="received" name="Received" stroke={C.s2} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} />
                    <Line isAnimationActive={false} type="monotone" dataKey="resolved" name="Resolved" stroke={C.s1} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card>
              <CardHeader title="Status distribution" subtitle="All grievances, current status" />
              <div className="space-y-2 px-5 py-4">
                {data.statusDist.map((s) => (
                  <Link key={s.status} to={`/app/grievances?status=${s.status}`} className="grid grid-cols-[110px_1fr] items-center gap-3 rounded hover:bg-slate-50">
                    <span className="text-[12.5px] text-slate-600">{s.label}</span>
                    <MiniBar value={s.count} max={Math.max(...data.statusDist.map((x) => x.count))} color={C.s3} />
                  </Link>
                ))}
              </div>
            </Card>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <Card>
              <CardHeader title="Complaints by category" subtitle={`Received in the last ${days} days · open vs resolved`} action={<Legend items={[{ label: "Open", color: C.s2 }, { label: "Resolved", color: C.s1 }]} />} />
              {data.byCategory.length === 0 ? (
                <EmptyState title="No complaints in this period" />
              ) : (
                <div className="px-2 pb-3 pt-3" style={{ height: 40 + data.byCategory.length * 30 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.byCategory} layout="vertical" margin={{ left: 8, right: 16 }} barCategoryGap={6}>
                      <CartesianGrid stroke={C.grid} horizontal={false} />
                      <XAxis type="number" allowDecimals={false} {...axisProps} />
                      <YAxis type="category" dataKey="name" width={140} {...axisProps} tick={{ fill: "#334155", fontSize: 12 }} />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(15,23,42,0.04)" }} />
                      <Bar isAnimationActive={false} dataKey="open" name="Open" stackId="a" fill={C.s2} stroke="#fff" strokeWidth={2} />
                      <Bar isAnimationActive={false} dataKey="resolved" name="Resolved" stackId="a" fill={C.s1} radius={[0, 4, 4, 0]} stroke="#fff" strokeWidth={2} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <Card>
              <CardHeader title="Mandal comparison" subtitle={`Received in the last ${days} days`} action={<Legend items={[{ label: "Open", color: C.s2 }, { label: "Resolved", color: C.s1 }]} />} />
              <div className="h-56 px-2 pb-3 pt-3">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.byMandal} margin={{ left: -18, right: 12 }} barCategoryGap="28%">
                    <CartesianGrid stroke={C.grid} vertical={false} />
                    <XAxis dataKey="name" {...axisProps} tick={{ fill: "#334155", fontSize: 12 }} />
                    <YAxis allowDecimals={false} {...axisProps} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(15,23,42,0.04)" }} />
                    <Bar isAnimationActive={false} dataKey="open" name="Open" stackId="m" fill={C.s2} stroke="#fff" strokeWidth={2} />
                    <Bar isAnimationActive={false} dataKey="resolved" name="Resolved" stackId="m" fill={C.s1} radius={[4, 4, 0, 0]} stroke="#fff" strokeWidth={2} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="border-t border-slate-100 px-5 py-3 text-[12px] text-slate-500">
                Resolution rate by category:{" "}
                {data.byCategory.slice(0, 5).map((c, i) => (
                  <span key={c.code}>
                    {i > 0 && " · "}
                    {c.name} <strong className="text-slate-700">{c.resolutionRate}%</strong>
                  </span>
                ))}
              </div>
            </Card>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-3">
            <Card>
              <CardHeader title="Villages with most open grievances" subtitle="All open cases" action={<Link to="/app/villages" className="text-[12.5px] font-medium text-teal-700 hover:underline">Village intelligence →</Link>} />
              <div className="divide-y divide-slate-100">
                {data.topVillages.length === 0 && <EmptyState title="No open grievances" />}
                {data.topVillages.map((v) => (
                  <div key={v.village + v.mandal} className="grid grid-cols-[1fr_130px] items-center gap-3 px-5 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-medium text-slate-800">{v.village}</div>
                      <div className="text-[11.5px] text-slate-500">
                        {v.mandal} · {v.overdue > 0 ? <span className="font-medium text-red-700">{v.overdue} overdue</span> : "none overdue"}
                      </div>
                    </div>
                    <MiniBar value={v.open} max={data.topVillages[0]?.open ?? 1} />
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <CardHeader title="Department workload" subtitle="Open cases by assigned team" />
              <div className="scrollbar-thin overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead className="text-left text-slate-500">
                    <tr className="border-b border-slate-100">
                      <th className="px-5 py-2 font-medium">Team</th>
                      <th className="px-2 py-2 text-right font-medium">Open</th>
                      <th className="px-2 py-2 text-right font-medium">Active</th>
                      <th className="px-2 py-2 text-right font-medium">High</th>
                      <th className="px-5 py-2 text-right font-medium">Overdue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.teamWorkload.map((t) => (
                      <tr key={t.team}>
                        <td className="px-5 py-2">
                          <div className="font-medium text-slate-800">{t.team}</div>
                          <div className="max-w-[170px] truncate text-[11px] text-slate-500" title={t.department}>{t.department}</div>
                        </td>
                        <td className="px-2 text-right font-semibold tabular-nums">{t.open}</td>
                        <td className="px-2 text-right tabular-nums">{t.inProgress}</td>
                        <td className="px-2 text-right tabular-nums">{t.highPriority}</td>
                        <td className="px-5 text-right tabular-nums">
                          {t.overdue > 0 ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-red-700">
                              <AlertOctagon className="h-3 w-3" /> {t.overdue}
                            </span>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card>
              <CardHeader title="Repeated infrastructure problems" subtitle={`≥3 complaints, same village & category, last ${days}d`} />
              <div className="divide-y divide-slate-100">
                {data.repeated.length === 0 && <EmptyState title="No repeated problems in this period" icon={<Repeat2 className="h-6 w-6" />} />}
                {data.repeated.map((r) => (
                  <div key={r.village + r.category} className="flex items-center gap-3 px-5 py-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-[15px] font-bold text-orange-700 tabular-nums">{r.complaints}</div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-slate-800">
                        {r.category} · {r.village}
                      </div>
                      <div className="text-[11.5px] text-slate-500">
                        {r.mandal} · {r.open} still open · latest {fmtDate(r.latest)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_320px]">
            <AskAI villages={villages} />
            <Card className="h-fit p-5">
              <h3 className="text-[15px] font-semibold text-navy-900">Pending actions</h3>
              <ul className="mt-3 space-y-2.5 text-[13px]">
                <li>
                  <Link to="/app/grievances?status=RECEIVED" className="flex items-center justify-between rounded-lg px-3 py-2 ring-1 ring-slate-200 hover:bg-slate-50">
                    <span>Awaiting verification</span>
                    <strong>{data.statusDist.find((s) => s.status === "RECEIVED")?.count ?? 0}</strong>
                  </Link>
                </li>
                <li>
                  <Link to="/app/grievances?pendingResolution=true" className="flex items-center justify-between rounded-lg px-3 py-2 ring-1 ring-slate-200 hover:bg-slate-50">
                    <span>Work reported complete — confirm</span>
                    <strong>→</strong>
                  </Link>
                </li>
                <li>
                  <Link to="/app/grievances?status=REOPENED" className="flex items-center justify-between rounded-lg px-3 py-2 ring-1 ring-slate-200 hover:bg-slate-50">
                    <span>Reopened by citizens</span>
                    <strong>{data.statusDist.find((s) => s.status === "REOPENED")?.count ?? 0}</strong>
                  </Link>
                </li>
                <li>
                  <Link to="/app/appointments" className="flex items-center justify-between rounded-lg px-3 py-2 ring-1 ring-slate-200 hover:bg-slate-50">
                    <span className="flex items-center gap-1.5">
                      <CalendarClock className="h-3.5 w-3.5" /> Appointment requests
                    </span>
                    <strong>{k?.pendingAppointments ?? 0}</strong>
                  </Link>
                </li>
              </ul>
              <p className="mt-4 text-[11.5px] leading-relaxed text-slate-500">
                Figures computed {fmtDate(data.dataNotes.generatedAt, true)} from {data.dataNotes.recordsInWorkspace} records. Average resolution time is shown only when at least {k?.avgResolutionDays.minimum} cases were resolved in the period.
              </p>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
