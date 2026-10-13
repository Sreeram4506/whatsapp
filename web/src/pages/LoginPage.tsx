import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { KeyRound, ShieldCheck } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { homeFor, useAuth } from "../lib/auth";
import { Logo } from "../components/Brand";
import { Button, Field, Input, Notice } from "../components/ui";

interface DemoAccounts {
  password: string;
  readOnly: boolean;
  accounts: { key: string; email: string; label: string }[];
}

export default function LoginPage() {
  const { refresh, me } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState<DemoAccounts | null>(null);

  useEffect(() => {
    if (me) nav(homeFor(me.user.role), { replace: true });
  }, [me, nav]);

  useEffect(() => {
    api.get<{ demoAccounts: DemoAccounts | null }>("/api/public/status").then((s) => {
      setDemo(s.demoAccounts);
      const as = params.get("as");
      const acc = s.demoAccounts?.accounts.find((a) => a.key === as);
      if (acc && s.demoAccounts) {
        setEmail(acc.email);
        setPassword(s.demoAccounts.password);
      }
    }).catch(() => undefined);
  }, [params]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/auth/login", { email, password });
      const m = await refresh();
      if (m) nav(params.get("next") ?? homeFor(m.user.role), { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-full lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-navy-900 p-10 text-white lg:flex lg:flex-col">
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-teal-500/20 blur-3xl" />
        <div className="absolute -bottom-40 -left-20 h-96 w-96 rounded-full bg-sky-500/10 blur-3xl" />
        <Logo />
        <div className="relative mt-auto max-w-md">
          <h1 className="text-[34px] font-extrabold leading-tight tracking-tight">Every citizen message, turned into accountable public service.</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-navy-100/80">
            WhatsApp grievances in Telugu and English become structured, trackable cases — with field operations, transparent priorities and constituency intelligence for the MLA.
          </p>
          <ul className="mt-6 space-y-2 text-[14px] text-navy-100/90">
            {["Role-based access with tenant isolation", "Every status change recorded in an audit trail", "AI suggests — authorised staff decide"].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-teal-300" /> {t}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo light={false} />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-navy-900">Staff sign in</h2>
          <p className="mt-1 text-sm text-slate-500">For authorised MLA office staff, field officers and platform administrators.</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field label="Email">
              <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label="Password">
              <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            {error && <Notice tone="warn">{error}</Notice>}
            <Button type="submit" loading={busy} className="w-full" icon={<KeyRound className="h-4 w-4" />}>
              Sign in
            </Button>
          </form>

          {demo && (
            <div className="mt-8 rounded-xl bg-white p-4 ring-1 ring-slate-200">
              <div className="text-[12px] font-semibold uppercase tracking-wider text-slate-500">{demo.readOnly ? "Public read-only demo" : "Demo accounts (local build)"}</div>
              <p className="mt-1 text-[12px] text-slate-500">
                {demo.readOnly ? "Shared access to fictional sample data. Do not enter real citizen information." : "Fictional users from the seed data. Shown only when DEMO_LOGIN_HINTS is enabled."}
              </p>
              <div className="mt-3 grid gap-1.5">
                {demo.accounts.map((a) => (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => {
                      setEmail(a.email);
                      setPassword(demo.password);
                    }}
                    className="flex items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] ring-1 ring-slate-200 transition hover:bg-teal-50 hover:ring-teal-200"
                  >
                    <span className="font-medium text-slate-800">{a.label}</span>
                    <span className="truncate pl-2 text-[12px] text-slate-500">{a.email}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
