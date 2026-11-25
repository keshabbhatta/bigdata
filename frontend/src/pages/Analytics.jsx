import { useEffect, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Database, Zap } from 'lucide-react';
import { api } from '../services/api.js';
import { useSync } from '../context/SyncContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, Empty, Figures, PageHead, Panel, PanelHead, Select, Table } from '../components/ui.jsx';
import { formatDateTime, relativeTime, wardName } from '../utils/format.js';

const C = { pine: '#0e6b5c', lali: '#c42847', marigold: '#e9a23b', sky: '#2f6fb0', ink: '#24364f', grid: '#e6ebf0', soft: '#5b6b7f' };
const TYPE_COLORS = { ANC: C.lali, general: C.ink, immunization: C.sky, referral: C.marigold, PNC: C.pine };
const TYPE_NAMES = { ANC: 'Antenatal', PNC: 'Postnatal', general: 'General', immunization: 'Immunization', referral: 'Referral' };
const axis = { fontSize: 12, fill: C.soft };
const CACHE = 'rh.analytics';

export function Analytics() {
  const { user } = useAuth();
  const sync = useSync();
  const [ward, setWard] = useState('');
  const [data, setData] = useState(() => { try { return JSON.parse(localStorage.getItem(CACHE)); } catch { return null; } });
  const [error, setError] = useState('');

  useEffect(() => {
    if (sync.isOffline) return;
    api.analytics(ward).then((d) => {
      setData(d);
      setError('');
      if (!ward) localStorage.setItem(CACHE, JSON.stringify({ ...d, cachedAt: Date.now() }));
    }).catch((e) => setError(e.message));
  }, [ward, sync.isOffline, sync.lastSyncAt]);

  const types = [...new Set((data?.dailyVisits || []).flatMap((d) => Object.keys(d).filter((k) => k !== 'day')))];
  const streamByMinute = (() => {
    const m = new Map();
    for (const r of data?.stream || []) {
      const k = new Date(r.minute).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (!m.has(k)) m.set(k, { minute: k });
      m.get(k)[r.topic] = r.events;
    }
    return [...m.values()];
  })();
  const t = data?.totals || {};
  const rate = data?.followUp?.rate;

  return (
    <>
      <PageHead title="Analytics" subtitle="Health activity across villages. Heavy numbers are computed by Spark jobs from the Kafka event stream, separately from the app's own database work.">
        {user.wards.length > 1 && (
          <Select className="w-auto" value={ward} onChange={(e) => setWard(e.target.value)} aria-label="Ward">
            <option value="">All wards</option>
            {user.wards.map((w) => <option key={w} value={w}>{wardName(w)}</option>)}
          </Select>
        )}
      </PageHead>

      {data && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-[13px]">
            {data.source === 'spark' ? <Zap size={15} className="text-marigold-deep" /> : <Database size={15} className="text-sky" />}
            {data.source === 'spark'
              ? <>Computed by the Spark batch job {relativeTime(data.computedAt)}</>
              : <>Live database query. Run the Spark batch job to precompute these numbers.</>}
          </span>
          {sync.isOffline && <Badge tone="marigold">Offline: showing results saved {relativeTime(data.cachedAt)}</Badge>}
        </div>
      )}
      {error && <p className="mb-4 text-sm text-lali-deep">{error}</p>}

      {!data ? (
        <Panel><Empty title="Analytics need a connection">Connect once to load the numbers. They are then kept on this phone for offline viewing.</Empty></Panel>
      ) : (
        <>
          <Figures items={[
            { label: 'Registered patients', value: t.patients },
            { label: 'Maternal health visits', value: t.maternalVisits, tone: 'good' },
            { label: 'High-risk active pregnancies', value: t.highRisk, tone: 'alert' },
            { label: 'Health workers active this week', value: t.activeWorkers },
          ]} />

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel>
              <PanelHead title="Visits per day" hint="Last 30 days" />
              <div className="h-[280px] px-2 py-4">
                <ResponsiveContainer>
                  <BarChart data={data.dailyVisits} margin={{ left: -18, right: 8 }}>
                    <CartesianGrid stroke={C.grid} vertical={false} />
                    <XAxis dataKey="day" tick={axis} tickFormatter={(d) => d.slice(8)} />
                    <YAxis tick={axis} allowDecimals={false} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {types.map((k) => <Bar key={k} animationDuration={800} dataKey={k} stackId="v" fill={TYPE_COLORS[k] || C.soft} name={TYPE_NAMES[k] || k} />)}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel>
              <PanelHead title="Villages" hint="Patients and active pregnancies" />
              <div className="h-[280px] px-2 py-4">
                <ResponsiveContainer>
                  <BarChart data={data.villages} layout="vertical" margin={{ left: 12, right: 12 }}>
                    <CartesianGrid stroke={C.grid} horizontal={false} />
                    <XAxis type="number" tick={axis} allowDecimals={false} />
                    <YAxis type="category" dataKey="village" tick={axis} width={80} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar animationDuration={800} dataKey="patients" fill={C.ink} name="Patients" />
                    <Bar animationDuration={800} dataKey="pregnancies" fill={C.pine} name="Active pregnancies" />
                    <Bar animationDuration={800} dataKey="highRisk" fill={C.lali} name="High risk" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel>
              <PanelHead title="New registrations per month" />
              <div className="h-[260px] px-2 py-4">
                <ResponsiveContainer>
                  <LineChart data={data.monthlyRegistrations} margin={{ left: -18, right: 16 }}>
                    <CartesianGrid stroke={C.grid} vertical={false} />
                    <XAxis dataKey="month" tick={axis} />
                    <YAxis tick={axis} allowDecimals={false} />
                    <Tooltip />
                    <Line animationDuration={900} type="monotone" dataKey="count" name="Registrations" stroke={C.pine} strokeWidth={2.5} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel>
              <PanelHead title="Follow-up visits completed" />
              <div className="px-5 py-6">
                <div className="font-condensed text-[56px] leading-none font-semibold text-pine">{rate == null ? '–' : `${Math.round(rate * 100)}%`}</div>
                <p className="mt-2 text-ink-soft">{data.followUp.completed} of {data.followUp.due} follow-ups that were due have happened.</p>
                <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-line-soft">
                  <div className="h-full rounded-full bg-pine transition-[width] duration-700" style={{ width: `${(rate || 0) * 100}%` }} />
                </div>
                <div className="mt-6 grid grid-cols-2 gap-4 border-t border-line-soft pt-4 text-sm">
                  <div><b className="block font-condensed text-2xl">{t.visitsThisMonth}</b><span className="text-ink-soft">visits this month</span></div>
                  <div><b className="block font-condensed text-2xl">{t.pendingSync}</b><span className="text-ink-soft">changes still on phones</span></div>
                </div>
              </div>
            </Panel>
          </div>

          <Panel className="mt-5">
            <PanelHead title="Live event stream" hint="Kafka events per minute, counted by Spark Structured Streaming" />
            {streamByMinute.length === 0 ? (
              <Empty title="No streaming data yet">Start Kafka and the Spark streaming job (see the README). Events then appear here within a minute.</Empty>
            ) : (
              <div className="h-[240px] px-2 py-4">
                <ResponsiveContainer>
                  <LineChart data={streamByMinute} margin={{ left: -18, right: 16 }}>
                    <CartesianGrid stroke={C.grid} vertical={false} />
                    <XAxis dataKey="minute" tick={axis} />
                    <YAxis tick={axis} allowDecimals={false} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line dataKey="patient-events" stroke={C.ink} strokeWidth={2} dot={false} name="Patients" />
                    <Line dataKey="maternal-health-events" stroke={C.lali} strokeWidth={2} dot={false} name="Maternal" />
                    <Line dataKey="clinic-visit-events" stroke={C.pine} strokeWidth={2} dot={false} name="Visits" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>

          {data.jobs?.length > 0 && (
            <Panel className="mt-5">
              <PanelHead title="Spark job runs" />
              <Table head={['Job', 'Finished', 'Duration', 'Rows read', 'Rows written']}>
                {data.jobs.map((j, i) => (
                  <tr key={i}>
                    <td className="font-semibold">{j.job}</td>
                    <td>{formatDateTime(j.finished_at)}</td>
                    <td>{(j.duration_ms / 1000).toFixed(1)} s</td>
                    <td>{j.rows_in}</td>
                    <td>{j.rows_out}</td>
                  </tr>
                ))}
              </Table>
            </Panel>
          )}
        </>
      )}
    </>
  );
}
