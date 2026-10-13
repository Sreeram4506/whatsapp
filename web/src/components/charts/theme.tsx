import type { ReactNode } from "react";

export const C = {
  s1: "#0e9384", // teal — resolved / received
  s2: "#d95f26", // orange — open / attention
  s3: "#2f5fb3", // blue
  grid: "#eef1f5",
  axis: "#64748b",
};

export const axisProps = {
  tick: { fill: C.axis, fontSize: 11 },
  axisLine: false,
  tickLine: false,
} as const;

export function ChartTooltip({ active, payload, label, labelFormatter }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; labelFormatter?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-white px-3 py-2 text-[12px] shadow-lg ring-1 ring-slate-200">
      <div className="mb-1 font-semibold text-slate-800">{labelFormatter ? labelFormatter(String(label)) : label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-slate-600">
          <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />
          <span>{p.name}</span>
          <span className="ml-auto pl-3 font-semibold tabular-nums text-slate-900">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-[12px] text-slate-600">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} /> {i.label}
        </span>
      ))}
    </div>
  );
}

export function MiniBar({ value, max, color = C.s2, children }: { value: number; max: number; color?: string; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full" style={{ width: `${max ? Math.max(3, (value / max) * 100) : 0}%`, background: color }} />
      </div>
      <span className="w-8 text-right text-[12.5px] font-semibold tabular-nums text-slate-800">{children ?? value}</span>
    </div>
  );
}
