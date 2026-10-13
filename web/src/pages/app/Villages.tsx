import { useState } from "react";
import { Link } from "react-router";
import { MapContainer, CircleMarker, Popup, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Info, MapPinned, Route } from "lucide-react";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../lib/auth";
import { api } from "../../lib/api";
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, Input, Modal, Notice, PageHeader, Select, Spinner } from "../../components/ui";
import { MiniBar, C } from "../../components/charts/theme";
import { AskAI } from "../../components/AskAI";
import { useToast } from "../../components/ui/toast";

interface VillageRow {
  id: string;
  village: string;
  villageTe: string | null;
  kind: string;
  mandal: string;
  total: number;
  open: number;
  overdue: number;
  critical: number;
  high: number;
  resolved: number;
  recentCount: number;
  topCategories: { name: string; count: number }[];
  recurring: string[];
  score: number;
  reasons: string[];
  latitude: number | null;
  longitude: number | null;
  coordsVerifiedBy: string | null;
}
interface Intel {
  villages: VillageRow[];
  unlisted: { village: string; mandal: string; total: number; open: number }[];
  geoComplaints: { id: string; ticket: string; lat: number; lng: number; category: string; status: string; priority: string; village: string }[];
  notes: { coordinates: string; scoreFormula: string };
}

export default function Villages() {
  const { me } = useAuth();
  const [days, setDays] = useState(90);
  const [mandal, setMandal] = useState("");
  const [editing, setEditing] = useState<VillageRow | null>(null);
  const { data, error, loading, reload } = useApi<Intel>(`/api/villages/intelligence?days=${days}`);
  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;
  const mandals = [...new Set(data.villages.map((v) => v.mandal))];
  const list = data.villages.filter((v) => !mandal || v.mandal === mandal);
  const maxOpen = Math.max(1, ...list.map((v) => v.open));
  const points = [
    ...data.geoComplaints.map((g) => ({ ...g, kind: "complaint" as const })),
  ];
  const villagePoints = data.villages.filter((v) => v.latitude != null && v.longitude != null);
  const center: [number, number] | null = points[0] ? [points[0].lat, points[0].lng] : villagePoints[0] ? [villagePoints[0].latitude!, villagePoints[0].longitude!] : null;

  return (
    <div>
      <PageHeader
        title="Village Intelligence"
        subtitle="Where problems concentrate, what keeps recurring, and where to visit next"
        actions={
          <>
            <Select value={mandal} onChange={(e) => setMandal(e.target.value)} className="h-9 w-44 text-[13px]" aria-label="Mandal">
              <option value="">All mandals</option>
              {mandals.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </Select>
            <Select value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-9 w-40 text-[13px]" aria-label="Recurring window">
              <option value={30}>Recurring: 30 days</option>
              <option value={90}>Recurring: 90 days</option>
              <option value={180}>Recurring: 180 days</option>
            </Select>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title={<span className="flex items-center gap-2"><Route className="h-4 w-4 text-teal-700" /> Field visit priorities</span>}
            subtitle={`Transparent score: ${data.notes.scoreFormula}`}
          />
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead className="bg-slate-50/80 text-left text-[12px] text-slate-500">
                <tr>
                  <th className="px-5 py-2 font-medium">#</th>
                  <th className="px-2 py-2 font-medium">Village / ward</th>
                  <th className="w-40 px-2 py-2 font-medium">Open</th>
                  <th className="px-2 py-2 font-medium">Why</th>
                  <th className="px-2 py-2 font-medium">Recurring issues</th>
                  <th className="px-5 py-2 text-right font-medium">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.map((v, i) => (
                  <tr key={v.id} className="align-top">
                    <td className="px-5 py-2.5 text-slate-400">{i + 1}</td>
                    <td className="px-2 py-2.5">
                      <Link to={`/app/grievances?villageId=${v.id}&open=true`} className="font-medium text-slate-800 hover:underline">
                        {v.village}
                      </Link>
                      <div className="text-[11.5px] text-slate-500">
                        {v.mandal} · {v.total} total · {v.resolved} resolved
                      </div>
                    </td>
                    <td className="px-2 py-2.5">
                      <MiniBar value={v.open} max={maxOpen} />
                    </td>
                    <td className="px-2 py-2.5 text-[12px] text-slate-600">{v.reasons.join(" · ") || "—"}</td>
                    <td className="px-2 py-2.5 text-[12px]">
                      {v.recurring.length ? v.recurring.map((r) => <div key={r} className="text-orange-700">{r}</div>) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-5 py-2.5 text-right font-semibold tabular-nums text-navy-900">{v.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.unlisted.length > 0 && (
            <div className="border-t border-slate-100 px-5 py-3 text-[12px] text-slate-500">
              Unlisted places typed by citizens: {data.unlisted.map((u) => `${u.village} (${u.mandal}, ${u.open} open)`).join(", ")}. Consider adding them to the village list.
            </div>
          )}
        </Card>

        <div className="space-y-5">
          <Card className="overflow-hidden">
            <CardHeader title={<span className="flex items-center gap-2"><MapPinned className="h-4 w-4 text-teal-700" /> Map</span>} subtitle="Citizen-shared locations and office-verified village coordinates only" />
            {center ? (
              <div className="h-80">
                <MapContainer center={center} zoom={12} scrollWheelZoom={false} className="h-full w-full">
                  <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  {points.map((p) => (
                    <CircleMarker key={p.id} center={[p.lat, p.lng]} radius={7} pathOptions={{ color: "#fff", weight: 2, fillColor: ["RESOLVED", "CLOSED"].includes(p.status) ? C.s1 : C.s2, fillOpacity: 0.95 }}>
                      <Popup>
                        <strong>{p.ticket}</strong>
                        <br />
                        {p.category} · {p.village}
                        <br />
                        <a href={`/app/grievances/${p.id}`}>Open case</a>
                      </Popup>
                    </CircleMarker>
                  ))}
                  {villagePoints.map((v) => (
                    <CircleMarker key={v.id} center={[v.latitude!, v.longitude!]} radius={5 + Math.min(12, v.open)} pathOptions={{ color: C.s3, weight: 2, fillOpacity: 0.15 }}>
                      <Popup>
                        <strong>{v.village}</strong> — {v.open} open
                        <br />
                        <small>Coordinates: {v.coordsVerifiedBy}</small>
                      </Popup>
                    </CircleMarker>
                  ))}
                </MapContainer>
              </div>
            ) : (
              <EmptyState title="No verified locations yet" icon={<MapPinned className="h-6 w-6" />}>
                Pins appear when citizens share their location on WhatsApp, or when the office enters verified village coordinates. ConstituencyOS never generates coordinates.
              </EmptyState>
            )}
            <div className="flex items-start gap-2 border-t border-slate-100 px-5 py-3 text-[12px] text-slate-500">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {data.notes.coordinates}
            </div>
            {me?.user.role === "OFFICE_ADMIN" && (
              <div className="border-t border-slate-100 px-5 py-3">
                <Select value="" onChange={(e) => setEditing(data.villages.find((v) => v.id === e.target.value) ?? null)} className="h-9 text-[13px]" aria-label="Set village coordinates">
                  <option value="">Enter verified coordinates for a village…</option>
                  {data.villages.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.village} ({v.mandal}){v.latitude != null ? " ✓" : ""}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </Card>
          <AskAI villages={data.villages.map((v) => ({ id: v.id, name: `${v.village} (${v.mandal})` }))} />
        </div>
      </div>
      {editing && <CoordsModal v={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload(); }} />}
    </div>
  );
}

function CoordsModal({ v, onClose, onSaved }: { v: VillageRow; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [lat, setLat] = useState(v.latitude?.toString() ?? "");
  const [lng, setLng] = useState(v.longitude?.toString() ?? "");
  const [source, setSource] = useState("");
  return (
    <Modal
      open
      onClose={onClose}
      title={`Verified coordinates · ${v.village}`}
      footer={
        <>
          {v.latitude != null && (
            <Button variant="ghost" onClick={async () => { await api.patch(`/api/villages/${v.id}`, { latitude: null, longitude: null, source: "cleared by office" }); onSaved(); }}>
              Clear
            </Button>
          )}
          <Button
            disabled={!lat || !lng || source.length < 3}
            onClick={async () => {
              try {
                await api.patch(`/api/villages/${v.id}`, { latitude: Number(lat), longitude: Number(lng), source });
                toast({ tone: "success", text: "Coordinates saved" });
                onSaved();
              } catch (e) {
                toast({ tone: "error", text: (e as Error).message });
              }
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Notice tone="warn">Enter coordinates only from an authoritative source (e.g. revenue/survey records or an on-site GPS reading). They will be shown on the map with your name and source.</Notice>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Latitude">
            <Input value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="Longitude">
            <Input value={lng} onChange={(e) => setLng(e.target.value)} inputMode="decimal" />
          </Field>
        </div>
        <Field label="Source of coordinates" required>
          <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. GPS reading at panchayat office, 12 Oct" />
        </Field>
        <Badge className="bg-slate-50 text-slate-600 ring-slate-200">Recorded in audit log</Badge>
      </div>
    </Modal>
  );
}
