import { FormEvent, useState } from "react";
import { BrainCircuit, Database, Info, Send, Sparkles } from "lucide-react";
import { api } from "../lib/api";
import { fmtDate } from "../lib/format";
import { Badge, Button, Card, Notice } from "./ui";

export interface AskResult {
  intent: string;
  title: string;
  narrative: string;
  narrativeSource: "ai" | "rules";
  provider: string;
  tables: { title: string; columns: string[]; rows: (string | number)[][] }[];
  recordsConsidered: number;
  isDemoData: boolean;
  caveats: string[];
  generatedAt: string;
}

const SUGGESTIONS = [
  "Which villages have the highest number of unresolved issues?",
  "Which complaints need urgent follow-up?",
  "What are the main problems reported this week?",
  "Which departments have the largest pending workload?",
  "Prepare the Monday grievance review.",
  "Summarize the unresolved road and drainage issues.",
];

export function ResultView({ r }: { r: AskResult }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-[15px] font-semibold text-navy-900">{r.title}</h4>
        <Badge className={r.narrativeSource === "ai" ? "bg-violet-50 text-violet-800 ring-violet-200" : "bg-slate-100 text-slate-700 ring-slate-200"}>
          {r.narrativeSource === "ai" ? <Sparkles className="h-3 w-3" /> : <Info className="h-3 w-3" />}
          {r.narrativeSource === "ai" ? "AI-generated interpretation" : "Rule-based summary"}
        </Badge>
        {r.isDemoData && <Badge className="bg-amber-50 text-amber-800 ring-amber-200">Sample data</Badge>}
      </div>
      <div className={`whitespace-pre-wrap rounded-lg p-3.5 text-[13.5px] leading-relaxed ${r.narrativeSource === "ai" ? "bg-violet-50/60 text-slate-800 ring-1 ring-violet-100" : "bg-slate-50 text-slate-800 ring-1 ring-slate-200"}`}>{r.narrative}</div>
      {r.tables.map((t) => (
        <div key={t.title}>
          <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-slate-500">
            <Database className="h-3.5 w-3.5" /> {t.title} <span className="font-normal normal-case tracking-normal text-slate-400">· computed from the database</span>
          </div>
          {t.rows.length === 0 ? (
            <p className="text-[13px] text-slate-500">No matching records.</p>
          ) : (
            <div className="scrollbar-thin overflow-x-auto rounded-lg ring-1 ring-slate-200">
              <table className="w-full text-left text-[12.5px]">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    {t.columns.map((c) => (
                      <th key={c} className="whitespace-nowrap px-3 py-2 font-semibold">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {t.rows.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50/60">
                      {row.map((cell, j) => (
                        <td key={j} className={`px-3 py-1.5 ${typeof cell === "number" ? "tabular-nums" : ""} ${j === 0 && String(cell).match(/^[A-Z]{2,6}-\d{4}-\d{6}$/) ? "font-mono" : ""}`}>
                          {String(cell).match(/^[A-Z]{2,6}-\d{4}-\d{6}$/) ? (
                            <a className="text-navy-700 hover:underline" href={`/app/grievances?q=${cell}`}>
                              {cell}
                            </a>
                          ) : (
                            cell
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
      <div className="space-y-1 text-[11.5px] text-slate-500">
        <div>
          Based on {r.recordsConsidered} grievance records in this workspace · generated {fmtDate(r.generatedAt, true)} · {r.provider}
        </div>
        {r.caveats.map((c) => (
          <div key={c}>• {c}</div>
        ))}
      </div>
    </div>
  );
}

export function AskAI({ villages }: { villages?: { id: string; name: string }[] }) {
  const [q, setQ] = useState("");
  const [villageId, setVillageId] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AskResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ask = async (question: string, vId?: string) => {
    setBusy(true);
    setError(null);
    setQ(question);
    try {
      setResult(await api.post<AskResult>("/api/ai/ask", { question, villageId: vId || undefined }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (q.trim().length >= 3) void ask(q.trim());
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 bg-gradient-to-r from-navy-900 to-navy-700 px-5 py-4 text-white">
        <div className="rounded-lg bg-white/10 p-2">
          <BrainCircuit className="h-5 w-5 text-teal-300" />
        </div>
        <div>
          <h3 className="text-[15px] font-semibold">Ask Constituency AI</h3>
          <p className="text-[12px] text-navy-100/80">Answers are computed from your workspace's grievance records. Narratives are clearly labelled.</p>
        </div>
      </div>
      <div className="space-y-4 p-5">
        <form onSubmit={submit} className="flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ask about villages, departments, urgent cases, trends…"
            className="h-10 flex-1 rounded-lg px-3 text-sm ring-1 ring-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-600"
            aria-label="Question for Constituency AI"
          />
          <Button type="submit" loading={busy} variant="teal" icon={<Send className="h-4 w-4" />}>
            Ask
          </Button>
        </form>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => void ask(s)} disabled={busy} className="rounded-full bg-slate-100 px-3 py-1 text-[12px] text-slate-700 transition hover:bg-teal-50 hover:text-teal-900 disabled:opacity-50">
              {s}
            </button>
          ))}
        </div>
        {villages && villages.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2.5 ring-1 ring-slate-200">
            <span className="text-[12.5px] font-medium text-slate-700">Field visit briefing for</span>
            <select value={villageId} onChange={(e) => setVillageId(e.target.value)} className="h-8 rounded-md px-2 text-[12.5px] ring-1 ring-slate-300" aria-label="Village">
              <option value="">Select village…</option>
              {villages.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            <Button size="sm" variant="secondary" disabled={!villageId || busy} onClick={() => void ask(`Prepare a field visit briefing for ${villages.find((v) => v.id === villageId)?.name}`, villageId)}>
              Prepare briefing
            </Button>
          </div>
        )}
        {error && <Notice tone="warn">{error}</Notice>}
        {busy && !result && <div className="h-24 animate-pulse rounded-lg bg-slate-100" />}
        {result && <ResultView r={result} />}
      </div>
    </Card>
  );
}
