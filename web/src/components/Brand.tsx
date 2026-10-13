export function Logo({ light = true, compact = false }: { light?: boolean; compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 64 64" className="h-8 w-8 shrink-0" aria-hidden>
        <rect width="64" height="64" rx="14" fill={light ? "#12294b" : "#0b1f3a"} />
        <path d="M18 40V24l14-8 14 8v16l-14 8z" fill="none" stroke="#2dd4bf" strokeWidth="4" strokeLinejoin="round" />
        <circle cx="32" cy="32" r="5" fill="#2dd4bf" />
      </svg>
      {!compact && (
        <div className="leading-tight">
          <div className={`text-[15px] font-bold tracking-tight ${light ? "text-white" : "text-navy-900"}`}>
            ConstituencyOS <span className="text-teal-400">AI</span>
          </div>
          <div className={`hidden text-[10.5px] font-medium uppercase tracking-[0.12em] min-[420px]:block ${light ? "text-navy-100/70" : "text-slate-500"}`}>Citizen grievance platform</div>
        </div>
      )}
    </div>
  );
}

export function DemoRibbon() {
  return (
    <div className="bg-amber-100 px-4 py-1.5 text-center text-[12px] font-medium text-amber-900">
      Demonstration build · sample branding and fictional data · simulator messages are not sent through WhatsApp
    </div>
  );
}
