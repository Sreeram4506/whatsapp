import { Link, useParams } from "react-router";
import { ArrowLeft, Printer } from "lucide-react";
import { useApi } from "../../hooks/useApi";
import { fmtDate } from "../../lib/format";
import { AskResult, ResultView } from "../../components/AskAI";
import { Button, ErrorState, Spinner } from "../../components/ui";

interface Briefing {
  type: string;
  tenant: { officeName: string; constituency: string; district: string; isSampleBranding: boolean; isDemoData: boolean };
  kpis: { total: number; pending: number; overdue: number; resolved: number; highPriorityOpen: number; newToday: number; avgResolutionDays: { value: number | null; sufficient: boolean } };
  byCategory: { name: string; total: number; open: number; resolved: number; resolutionRate: number }[];
  teamWorkload: { team: string; open: number; overdue: number }[];
  briefing: AskResult;
}

const TITLE: Record<string, string> = { monday: "Monday Grievance Review", weekly: "Weekly Problems Briefing", daily: "Daily Urgent Follow-up" };

/** Print-optimised report. "Save as PDF" in the browser print dialog produces the PDF (Telugu renders correctly). */
export default function ReportPrint() {
  const { type = "monday" } = useParams();
  const { data, error, loading, reload } = useApi<Briefing>(`/api/reports/briefing?type=${type}`, [type]);
  if (loading && !data) return <Spinner label="Preparing report…" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;
  return (
    <div className="mx-auto max-w-4xl">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link to="/app/reports" className="inline-flex items-center gap-1 text-[13px] text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> Reports
        </Link>
        <Button onClick={() => window.print()} icon={<Printer className="h-4 w-4" />}>
          Print / Save as PDF
        </Button>
      </div>
      <article className="rounded-xl bg-white p-8 shadow-sm ring-1 ring-slate-200 print:p-0 print:shadow-none print:ring-0">
        <header className="flex items-start justify-between border-b-2 border-navy-900 pb-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-teal-700">ConstituencyOS AI · {data.tenant.officeName}</div>
            <h1 className="mt-1 text-[26px] font-extrabold text-navy-900">{TITLE[type] ?? "Briefing"}</h1>
            <div className="text-[13px] text-slate-600">
              {data.tenant.constituency}, {data.tenant.district} · generated {fmtDate(data.briefing.generatedAt, true)}
            </div>
          </div>
          {(data.tenant.isDemoData || data.tenant.isSampleBranding) && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900">SAMPLE DATA — FOR DEMONSTRATION</div>
          )}
        </header>
        <section className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-6">
          {[
            ["Total", data.kpis.total],
            ["Open", data.kpis.pending],
            ["High/critical", data.kpis.highPriorityOpen],
            ["Overdue", data.kpis.overdue],
            ["Resolved", data.kpis.resolved],
            ["Avg. days", data.kpis.avgResolutionDays.sufficient ? data.kpis.avgResolutionDays.value : "n/a"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-slate-200 p-3">
              <div className="text-[11px] text-slate-500">{k}</div>
              <div className="text-[20px] font-bold text-navy-900">{v}</div>
            </div>
          ))}
        </section>
        <section className="mt-6">
          <ResultView r={data.briefing} />
        </section>
        <section className="print-break mt-6">
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wider text-slate-500">Category summary (last 30 days)</h2>
          <table className="w-full text-[12.5px]">
            <thead className="border-b border-slate-300 text-left text-slate-600">
              <tr>
                <th className="py-1.5">Category</th>
                <th className="py-1.5 text-right">Received</th>
                <th className="py-1.5 text-right">Open</th>
                <th className="py-1.5 text-right">Resolved</th>
                <th className="py-1.5 text-right">Resolution rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.byCategory.map((c) => (
                <tr key={c.name}>
                  <td className="py-1.5">{c.name}</td>
                  <td className="py-1.5 text-right">{c.total}</td>
                  <td className="py-1.5 text-right">{c.open}</td>
                  <td className="py-1.5 text-right">{c.resolved}</td>
                  <td className="py-1.5 text-right">{c.resolutionRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <footer className="mt-8 border-t border-slate-200 pt-3 text-[11px] leading-relaxed text-slate-500">
          Figures are computed from the office grievance database at the time of generation. {data.briefing.narrativeSource === "ai" ? "The narrative paragraph is AI-generated from these figures and should be verified." : "The narrative is a rule-based summary of these figures."} Confidential — for official use by authorised office staff. Not for political profiling or campaign use.
        </footer>
      </article>
    </div>
  );
}
