import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { api } from "../../lib/api";
import type { PublicTenant } from "../../lib/types";
import { PublicHeader } from "../../components/PublicHeader";
import { Card, ErrorState, Spinner } from "../../components/ui";

export default function PrivacyPage() {
  const { slug } = useParams();
  const [t, setT] = useState<PublicTenant | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api
      .get<{ tenant: PublicTenant } | { tenants: PublicTenant[] }>(slug ? `/api/public/tenants/${slug}` : "/api/public/tenants")
      .then((r) => setT("tenant" in r ? r.tenant : r.tenants[0]))
      .catch((e) => setError(e.message));
  }, [slug]);
  return (
    <div className="min-h-full">
      <PublicHeader />
      <div className="mx-auto max-w-3xl px-4 py-10">
        {error && <ErrorState error={error} />}
        {!t && !error && <Spinner />}
        {t && (
          <Card className="p-7">
            <div className="text-[12px] font-semibold uppercase tracking-wider text-teal-700">Privacy notice · version {t.privacyNoticeVersion}</div>
            <h1 className="mt-1 text-[24px] font-extrabold tracking-tight text-navy-900">{t.officeName} — citizen helpdesk</h1>
            {t.isSampleBranding && <p className="mt-2 rounded-lg bg-amber-50 p-3 text-[13px] text-amber-900 ring-1 ring-amber-200">This is a demonstration workspace with sample branding. It is not operated by, or endorsed by, any real MLA.</p>}
            <div className="prose-sm mt-6 space-y-5 text-[14px] leading-relaxed text-slate-700">
              <section>
                <h2 className="text-[16px] font-semibold text-navy-900">What we collect</h2>
                <p>Your name, WhatsApp number, the mandal and village/ward of the problem, the complaint category and description, and — only if you choose to send them — a landmark, your location, photos and documents. We also record your consent and your language preference.</p>
              </section>
              <section>
                <h2 className="text-[16px] font-semibold text-navy-900">Why we use it</h2>
                <p>Only to register, verify, route and resolve your grievance, to send you status updates, and to prepare anonymous statistics that help the office plan public services. It is never used for political profiling, campaign messages or unrelated communication.</p>
              </section>
              <section>
                <h2 className="text-[16px] font-semibold text-navy-900">Who can see it</h2>
                <p>Only authorised staff of this MLA office, based on their role: office administrators, the field officer assigned to your case, and the MLA in summary form. Other MLA offices using the same platform can never see your data. Every access to your contact details is logged.</p>
              </section>
              <section>
                <h2 className="text-[16px] font-semibold text-navy-900">What this helpdesk is — and is not</h2>
                <p>Registering a complaint here records it with the MLA office. It is not an application to any government department and does not guarantee a benefit or a resolution date. In an emergency, call 112.</p>
              </section>
              <section>
                <h2 className="text-[16px] font-semibold text-navy-900">Your choices</h2>
                <ul className="list-disc pl-5">
                  <li>Send <strong>STOP</strong> on WhatsApp to stop updates; <strong>START</strong> to resume.</li>
                  <li>Ask the office to correct or delete your personal data. Deletion keeps only anonymous counts.</li>
                  <li>Closed cases are anonymised after {t.retentionMonths} months.</li>
                </ul>
              </section>
              <section>
                <h2 className="text-[16px] font-semibold text-navy-900">Contact</h2>
                <p>
                  {t.officeAddress ?? "—"} · {t.officeHours ?? ""} · {t.officePhone ?? ""}
                </p>
              </section>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
