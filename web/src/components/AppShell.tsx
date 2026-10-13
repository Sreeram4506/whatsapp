import { ReactNode, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";
import {
  Activity,
  BookOpenCheck,
  Building2,
  CalendarClock,
  ClipboardList,
  FileBarChart,
  LayoutDashboard,
  LogOut,
  Map,
  Menu,
  MessageSquareText,
  ScrollText,
  Settings,
  ShieldAlert,
  Smartphone,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { ROLE_LABEL } from "../lib/format";
import type { Role } from "../lib/types";
import { Logo } from "./Brand";

interface NavItem {
  to: string;
  label: string;
  icon: typeof Activity;
  roles: Role[];
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: "/app", label: "Command Center", icon: LayoutDashboard, roles: ["MLA", "OFFICE_ADMIN"], end: true },
  { to: "/app/grievances", label: "Grievance Register", icon: ClipboardList, roles: ["MLA", "OFFICE_ADMIN"] },
  { to: "/app/field", label: "My Assignments", icon: ClipboardList, roles: ["FIELD_OFFICER"] },
  { to: "/app/villages", label: "Village Intelligence", icon: Map, roles: ["MLA", "OFFICE_ADMIN"] },
  { to: "/app/appointments", label: "Appointments", icon: CalendarClock, roles: ["MLA", "OFFICE_ADMIN"] },
  { to: "/app/reports", label: "Reports", icon: FileBarChart, roles: ["MLA", "OFFICE_ADMIN"] },
  { to: "/app/guidance", label: "Service Guidance", icon: BookOpenCheck, roles: ["MLA", "OFFICE_ADMIN"] },
  { to: "/app/messages", label: "WhatsApp Delivery", icon: MessageSquareText, roles: ["OFFICE_ADMIN"] },
  { to: "/app/citizens", label: "Citizen Records", icon: Users, roles: ["OFFICE_ADMIN"] },
  { to: "/app/staff", label: "Staff & Roles", icon: UserCog, roles: ["OFFICE_ADMIN"] },
  { to: "/app/audit", label: "Audit Log", icon: ScrollText, roles: ["OFFICE_ADMIN"] },
  { to: "/app/settings", label: "Workspace Settings", icon: Settings, roles: ["OFFICE_ADMIN", "MLA"] },
  { to: "/platform", label: "MLA Workspaces", icon: Building2, roles: ["PLATFORM_ADMIN"] },
];

export function AppShell({ children }: { children?: ReactNode }) {
  const { me, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  if (!me) return null;
  const items = NAV.filter((n) => n.roles.includes(me.user.role));

  const sidebar = (
    <div className="flex h-full flex-col bg-navy-900 text-navy-100">
      <div className="flex items-center justify-between px-5 pb-4 pt-5">
        <Logo />
        <button className="rounded p-1 text-white/70 lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
          <X className="h-5 w-5" />
        </button>
      </div>
      {me.tenant && (
        <div className="mx-3 mb-3 rounded-xl bg-white/[0.06] p-3 ring-1 ring-white/10">
          <div className="text-[11px] font-medium uppercase tracking-wider text-teal-300/90">Workspace</div>
          <div className="mt-0.5 text-[13.5px] font-semibold leading-snug text-white">{me.tenant.officeName}</div>
          <div className="text-[12px] text-navy-100/70">
            {me.tenant.constituency} · {me.tenant.district}
          </div>
          {(me.tenant.isSampleBranding || me.tenant.isDemoData) && (
            <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-amber-400/15 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-200">
              <ShieldAlert className="h-3 w-3" /> Sample branding · demo data
            </div>
          )}
        </div>
      )}
      <nav className="scrollbar-thin flex-1 space-y-0.5 overflow-y-auto px-3" aria-label="Main">
        {items.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition ${
                isActive ? "bg-teal-500/15 text-white ring-1 ring-teal-400/30" : "text-navy-100/80 hover:bg-white/5 hover:text-white"
              }`
            }
          >
            <n.icon className="h-[18px] w-[18px]" />
            {n.label}
          </NavLink>
        ))}
        {me.user.role !== "PLATFORM_ADMIN" && (
          <a href="/" target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium text-teal-200/90 hover:bg-white/5">
            <Smartphone className="h-[18px] w-[18px]" /> Open citizen WhatsApp demo
          </a>
        )}
      </nav>
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 px-2 py-1.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-600 text-sm font-semibold text-white">
            {me.user.name.slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-white">{me.user.name}</div>
            <div className="truncate text-[11.5px] text-navy-100/70">
              {ROLE_LABEL[me.user.role]}
              {me.user.team ? ` · ${me.user.team.name}` : ""}
            </div>
          </div>
          <button
            onClick={async () => {
              await logout();
              nav("/login");
            }}
            className="rounded-lg p-2 text-navy-100/70 hover:bg-white/10 hover:text-white"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-full">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72">{sidebar}</div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:hidden">
          <button onClick={() => setOpen(true)} className="rounded-lg p-2 hover:bg-slate-100" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <div className="truncate text-sm font-semibold text-navy-900">{me.tenant?.officeName ?? "ConstituencyOS AI"}</div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">{children ?? <Outlet />}</main>
      </div>
    </div>
  );
}
