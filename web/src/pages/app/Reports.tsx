import { useState } from "react";
import { Link } from "react-router";
import { CalendarRange, Download, FileBarChart, FileSpreadsheet, Printer, ShieldCheck } from "lucide-react";
import { qs } from "../../lib/api";
import { useApi } from "../../hooks/useApi";
import type { Meta } from "../../lib/types";
import { Card, CardHeader, Field, Input, Notice, PageHeader, Select } from "../../components/ui";

export default function Reports() {
  const meta = useApi<Meta>("/api/meta");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [mandalId, setMandalId] = useState("");
  const csvUrl = `/api/reports/grievances.csv${qs({ from, to, categoryId, mandalId })}`;

  return (
    <div>
      <PageHeader title="Reports" subtitle="Briefings for review meetings, exports for analysis, and privacy-preserving summaries" />
      <div className="grid gap-5 lg:grid-cols-3">
        {[
          { type: "monday", title: "Monday grievance review", desc: "Week at a glance, critical open cases, top categories and villages, pending appointments.", icon: CalendarRange },
          { type: "weekly", title: "Weekly problems briefing", desc: "What citizens reported in the last 7 days compared with the week before.", icon: FileBarChart },
          { type: "daily", title: "Daily urgent follow-up", desc: "Critical, overdue and escalated grievances needing action today.", icon: Printer },
        ].map((r) => (
          <Card key={r.type} className="flex flex-col p-5">
            <r.icon className="h-6 w-6 text-teal-700" />
            <h3 className="mt-3 text-[15px] font-semibold text-navy-900">{r.title}</h3>
            <p className="mt-1 flex-1 text-[13px] text-slate-600">{r.desc}</p>
            <Link to={`/app/reports/print/${r.type}`} className="mt-4 inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-navy-900 text-[13px] font-medium text-white hover:bg-navy-800">
              <Printer className="h-4 w-4" /> Open printable report (PDF)
            </Link>
          </Card>
        ))}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><FileSpreadsheet className="h-4 w-4 text-teal-700" /> Grievance register export (CSV)</span>} subtitle="Authorised records only · phone numbers masked · every export is audited" />
          <div className="grid gap-3 p-5 sm:grid-cols-2">
            <Field label="From">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="To">
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
            <Field label="Category">
              <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">All</option>
                {meta.data?.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nameEn}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Mandal">
              <Select value={mandalId} onChange={(e) => setMandalId(e.target.value)}>
                <option value="">All</option>
                {meta.data?.mandals.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </Field>
            <a href={csvUrl} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-navy-900 text-sm font-medium text-white hover:bg-navy-800 sm:col-span-2">
              <Download className="h-4 w-4" /> Download CSV
            </a>
          </div>
        </Card>
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-teal-700" /> Privacy-preserving summaries (CSV)</span>} subtitle="Counts only — no personal data; counts below 3 are suppressed" />
          <div className="space-y-3 p-5">
            {[
              ["village", "Village / ward-wise report"],
              ["category", "Category-wise report"],
              ["mandal", "Mandal-wise report"],
            ].map(([by, label]) => (
              <a key={by} href={`/api/reports/aggregate.csv?by=${by}`} className="flex items-center justify-between rounded-lg px-4 py-3 text-[13.5px] font-medium text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50">
                {label} <Download className="h-4 w-4 text-slate-400" />
              </a>
            ))}
            <Notice tone="info">Suitable for sharing in review meetings. Grievance data must not be used for political profiling, campaign targeting or unrelated messaging.</Notice>
          </div>
        </Card>
      </div>
    </div>
  );
}
