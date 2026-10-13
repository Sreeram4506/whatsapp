import { lazy, ReactNode, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { homeFor, useAuth } from "./lib/auth";
import type { Role } from "./lib/types";
import { AppShell } from "./components/AppShell";
import { Spinner } from "./components/ui";
import DemoPage from "./pages/citizen/DemoPage";

const LoginPage = lazy(() => import("./pages/LoginPage"));
const TrackPage = lazy(() => import("./pages/citizen/TrackPage"));
const PrivacyPage = lazy(() => import("./pages/citizen/PrivacyPage"));
const CommandCenter = lazy(() => import("./pages/app/CommandCenter"));
const Grievances = lazy(() => import("./pages/app/Grievances"));
const GrievanceDetail = lazy(() => import("./pages/app/GrievanceDetail"));
const FieldHome = lazy(() => import("./pages/app/FieldHome"));
const Villages = lazy(() => import("./pages/app/Villages"));
const Appointments = lazy(() => import("./pages/app/Appointments"));
const Reports = lazy(() => import("./pages/app/Reports"));
const ReportPrint = lazy(() => import("./pages/app/ReportPrint"));
const Guidance = lazy(() => import("./pages/app/Guidance"));
const Staff = lazy(() => import("./pages/app/Staff"));
const Citizens = lazy(() => import("./pages/app/Citizens"));
const Audit = lazy(() => import("./pages/app/Audit"));
const Messages = lazy(() => import("./pages/app/Messages"));
const Settings = lazy(() => import("./pages/app/Settings"));
const Tenants = lazy(() => import("./pages/platform/Tenants"));

function Guard({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { me, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Spinner />;
  if (!me) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (!roles.includes(me.user.role)) return <Navigate to={homeFor(me.user.role)} replace />;
  return <>{children}</>;
}

const LEADERS: Role[] = ["MLA", "OFFICE_ADMIN"];
const STAFF: Role[] = ["MLA", "OFFICE_ADMIN", "FIELD_OFFICER"];
const ADMIN: Role[] = ["OFFICE_ADMIN"];

export default function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/" element={<DemoPage />} />
        <Route path="/track" element={<TrackPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/privacy/:slug" element={<PrivacyPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route element={<Guard roles={STAFF}><AppShell /></Guard>}>
          <Route path="/app" element={<Guard roles={LEADERS}><CommandCenter /></Guard>} />
          <Route path="/app/grievances" element={<Guard roles={LEADERS}><Grievances /></Guard>} />
          <Route path="/app/grievances/:id" element={<GrievanceDetail />} />
          <Route path="/app/field" element={<Guard roles={["FIELD_OFFICER"]}><FieldHome /></Guard>} />
          <Route path="/app/villages" element={<Guard roles={LEADERS}><Villages /></Guard>} />
          <Route path="/app/appointments" element={<Guard roles={LEADERS}><Appointments /></Guard>} />
          <Route path="/app/reports" element={<Guard roles={LEADERS}><Reports /></Guard>} />
          <Route path="/app/reports/print/:type" element={<Guard roles={LEADERS}><ReportPrint /></Guard>} />
          <Route path="/app/guidance" element={<Guard roles={LEADERS}><Guidance /></Guard>} />
          <Route path="/app/settings" element={<Guard roles={LEADERS}><Settings /></Guard>} />
          <Route path="/app/staff" element={<Guard roles={ADMIN}><Staff /></Guard>} />
          <Route path="/app/citizens" element={<Guard roles={ADMIN}><Citizens /></Guard>} />
          <Route path="/app/audit" element={<Guard roles={ADMIN}><Audit /></Guard>} />
          <Route path="/app/messages" element={<Guard roles={ADMIN}><Messages /></Guard>} />
        </Route>
        <Route element={<Guard roles={["PLATFORM_ADMIN"]}><AppShell /></Guard>}>
          <Route path="/platform" element={<Tenants />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
