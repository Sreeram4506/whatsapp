import { useState } from "react";
import { KeyRound, UserPlus } from "lucide-react";
import { api } from "../../lib/api";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../lib/auth";
import { fmtDate, ROLE_LABEL } from "../../lib/format";
import type { Meta } from "../../lib/types";
import { Badge, Button, Card, ErrorState, Field, Input, Modal, Notice, PageHeader, Select, Spinner } from "../../components/ui";
import { useToast } from "../../components/ui/toast";

interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  lastLoginAt: string | null;
  team: { id: string; name: string } | null;
  _count: { assignedGrievances: number };
}

export default function Staff() {
  const { me } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<{ users: StaffUser[] }>("/api/users");
  const meta = useApi<Meta>("/api/meta");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "FIELD_OFFICER", teamId: "" });
  const [secret, setSecret] = useState<{ email: string; pw: string } | null>(null);

  const create = async () => {
    try {
      const r = await api.post<{ temporaryPassword: string }>("/api/users", { ...form, teamId: form.teamId || null });
      setSecret({ email: form.email, pw: r.temporaryPassword });
      setOpen(false);
      setForm({ name: "", email: "", role: "FIELD_OFFICER", teamId: "" });
      void reload();
    } catch (e) {
      toast({ tone: "error", text: (e as Error).message });
    }
  };
  const patch = async (u: StaffUser, body: Record<string, unknown>) => {
    try {
      await api.patch(`/api/users/${u.id}`, body);
      toast({ tone: "success", text: "Updated" });
      void reload();
    } catch (e) {
      toast({ tone: "error", text: (e as Error).message });
    }
  };

  return (
    <div>
      <PageHeader title="Staff & Roles" subtitle="Who can access this workspace, and what they can do" actions={<Button icon={<UserPlus className="h-4 w-4" />} onClick={() => setOpen(true)}>Add staff</Button>} />
      <div className="mb-4 grid gap-3 text-[12.5px] md:grid-cols-3">
        <Notice tone="info"><strong>Office administrator</strong> — full case management, citizen records, staff, reports and audit.</Notice>
        <Notice tone="info"><strong>MLA</strong> — executive dashboards and reports; read-only on cases; citizen contacts hidden unless enabled in settings.</Notice>
        <Notice tone="info"><strong>Field officer</strong> — only cases assigned to them: visits, inspection notes, evidence, completion reports.</Notice>
      </div>
      {error && <ErrorState error={error} onRetry={reload} />}
      {loading && !data && <Spinner />}
      {data && (
        <Card>
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead className="bg-slate-50/80 text-left text-[12px] text-slate-500">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Name</th>
                  <th className="px-3 py-2.5 font-medium">Role</th>
                  <th className="px-3 py-2.5 font-medium">Team</th>
                  <th className="px-3 py-2.5 font-medium">Assigned cases</th>
                  <th className="px-3 py-2.5 font-medium">Last sign-in</th>
                  <th className="px-5 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.users.map((u) => (
                  <tr key={u.id} className={u.active ? "" : "opacity-50"}>
                    <td className="px-5 py-2.5">
                      <div className="font-medium text-slate-800">{u.name}</div>
                      <div className="text-[12px] text-slate-500">{u.email}</div>
                    </td>
                    <td className="px-3">
                      <Badge className="bg-slate-50 text-slate-700 ring-slate-200">{ROLE_LABEL[u.role]}</Badge>
                    </td>
                    <td className="px-3">
                      {u.role === "FIELD_OFFICER" ? (
                        <Select value={u.team?.id ?? ""} onChange={(e) => patch(u, { teamId: e.target.value || null })} className="h-8 w-44 text-[12.5px]" aria-label="Team">
                          <option value="">—</option>
                          {meta.data?.teams.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 tabular-nums">{u._count.assignedGrievances}</td>
                    <td className="px-3 text-slate-500">{u.lastLoginAt ? fmtDate(u.lastLoginAt, true) : "Never"}</td>
                    <td className="px-5 text-right">
                      {u.id !== me?.user.id && (
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<KeyRound className="h-3.5 w-3.5" />}
                            onClick={async () => {
                              const r = await api.post<{ temporaryPassword: string }>(`/api/users/${u.id}/reset-password`);
                              setSecret({ email: u.email, pw: r.temporaryPassword });
                            }}
                          >
                            Reset password
                          </Button>
                          <Button size="sm" variant={u.active ? "ghost" : "secondary"} onClick={() => patch(u, { active: !u.active })}>
                            {u.active ? "Deactivate" : "Activate"}
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Add staff member" footer={<Button onClick={create} disabled={form.name.length < 2 || !form.email}>Create account</Button>}>
        <div className="space-y-3">
          <Field label="Full name" required>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Email" required>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Role">
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="FIELD_OFFICER">Field officer</option>
              <option value="OFFICE_ADMIN">Office administrator</option>
              <option value="MLA">MLA (executive view)</option>
            </Select>
          </Field>
          {form.role === "FIELD_OFFICER" && (
            <Field label="Team">
              <Select value={form.teamId} onChange={(e) => setForm({ ...form, teamId: e.target.value })}>
                <option value="">—</option>
                {meta.data?.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
      </Modal>

      <Modal open={!!secret} onClose={() => setSecret(null)} title="Temporary password" footer={<Button onClick={() => setSecret(null)}>Done</Button>}>
        <p className="text-[13px] text-slate-600">Share this securely with {secret?.email}. It is shown only once and is not stored in readable form.</p>
        <div className="mt-3 rounded-lg bg-slate-100 p-3 text-center font-mono text-[15px] font-semibold text-navy-900">{secret?.pw}</div>
      </Modal>
    </div>
  );
}
