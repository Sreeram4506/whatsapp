import { Link, NavLink } from "react-router";
import { LogIn } from "lucide-react";
import { Logo } from "./Brand";

export function PublicHeader() {
  const link = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-3 py-1.5 text-[13.5px] font-medium transition ${isActive ? "bg-white/10 text-white" : "text-navy-100/80 hover:text-white"}`;
  return (
    <header className="bg-navy-900">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-4 px-4 sm:px-6">
        <Link to="/" aria-label="Home">
          <Logo />
        </Link>
        <nav className="ml-auto hidden items-center gap-1 sm:flex" aria-label="Public">
          <NavLink to="/" end className={link}>
            WhatsApp demo
          </NavLink>
          <NavLink to="/track" className={link}>
            Track complaint
          </NavLink>
        </nav>
        <Link to="/login" className="ml-auto inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-teal-500 px-3 py-1.5 text-[13px] font-semibold text-navy-950 hover:bg-teal-400 sm:ml-2">
          <LogIn className="h-4 w-4" /> Staff sign in
        </Link>
      </div>
    </header>
  );
}
