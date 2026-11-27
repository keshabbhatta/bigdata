import { useEffect, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Database, Zap } from 'lucide-react';
import { api } from '../services/api.js';
import { useSync } from '../context/SyncContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, Empty, Figures, PageHead, Panel, PanelHead, Select, Table } from '../components/ui.jsx';
import { formatDateTime, formatTime, relativeTime, wardName } from '../utils/format.js';
import { AreaPicker } from '../components/AreaPicker.jsx';
import { NATION, isValidWard } from '../../../shared/areas.js';
import { t, num } from '../i18n/index.jsx';

const C = { pine: '#0b6f93', lali: '#c22a40', marigold: '#eaa53c', sky: '#284f8a', ink: '#2d3a50', grid: '#ebe5d8', soft: '#5f6878' };
const TYPE_COLORS = { ANC: C.lali, general: C.ink, immunization: C.sky, referral: C.marigold, PNC: C.pine };
const TYPE_NAMES = { ANC: 'Antenatal', PNC: 'Postnatal', general: 'General', immunization: 'Immunization', referral: 'Referral' };
const axis = { fontSize: 12, fill: C.soft };
const CACHE = 'rh.analytics';

export function Analytics() {
  const { user } = useAuth();
  // Spark / Kafka internals are for the administrator; workers and doctors see the health numbers only.
  const isAdmin = user.role === 'admin';
  const sync = useSync();
  const [ward, setWard] = useState('');
  const [data, setData] = useState(() => { try { return JSON.parse(localStorage.getItem(CACHE)); } catch { return null; } });
  const [error, setError] = useState('');

  useEffect(() => {
    if (sync.isOffline) return;
    const area = ward === NATION ? '' : ward;
    api.analytics(area).then((d) => {
      setData(d);
      setError('');
      if (!area) localStorage.setItem(CACHE, JSON.stringify({ ...d, cachedAt: Date.now() }));
    }).catch((e) => setError(e.message));
  }, [ward, sync.isOffline, sync.lastSyncAt]);

  const types = [...new Set((data?.dailyVisits || []).flatMap((d) => Object.keys(d).filter((k) => k !== 'day')))];
  const streamByMinute = (() => {
    const m = new Map();
    for (const r of data?.stream || []) {
      const k = formatTime(r.minute);
      if (!m.has(k)) m.set(k, { minute: k });
      m.get(k)[r.topic] = r.events;
    }
    return [...m.values()];
  })();
  const tot = data?.totals || {};
  const rate = data?.followUp?.rate;

  return (
    <>
      <PageHead title={t('Analytics')} subtitle={isAdmin ? t("Health activity across villages. Heavy numbers are computed by Spark jobs from the Kafka event stream, separately from the app's own database work.") : t('Health activity across villages: patients, pregnancies, visits and follow-ups.')}>
        {!(user.wards.length === 1 && isValidWard(user.wards[0])) && (
          <div className="w-full rounded-xl border border-line bg-white p-3 md:w-[560px]">
            <div className="mb-2 text-[13px] font-semibold text-ink-2">{t('Show numbers for')}</div>
            <AreaPicker value={ward} onChange={setWard} level="any" within={user.role === 'admin' ? null : user.wards} allowNation />
          </div>
        )}
      </PageHead>

      {data && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {isAdmin && <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-[13px]">
            {data.source === 'spark' ? <Zap size={15} className="text-marigold-deep" /> : <Database size={15} className="text-sky" />}
            {data.source === 'spark'
              ? <>{t('Computed by the Spark batch job {time}', { time: relativeTime(data.computedAt) })}</>
              : <>{t('Live database query. Run the Spark batch job to precompute these numbers.')}</>}
          </span>}
          {sync.isOffline && <Badge tone="marigold">{t('Offline: showing results saved {time}', { time: relativeTime(data.cachedAt) })}</Badge>}
        </div>
      )}
      {error && <p className="mb-4 text-sm text-lali-deep">{error}</p>}

      {!data ? (
        <Panel><Empty title={t('Analytics need a connection')}>{t('Connect once to load the numbers. They are then kept on this phone for offline viewing.')}</Empty></Panel>
      ) : (
        <>
          <Figures items={[
            { label: t('Registered patients'), value: tot.patients },
            { label: t('Maternal health visits'), value: tot.maternalVisits, tone: 'good' },
            { label: t('High-risk active pregnancies'), value: tot.highRisk, tone: 'alert' },
            { label: t('Health workers active this week'), value: tot.activeWorkers },
          ]} />

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel>
              <PanelHead title={t('Visits per day')} hint={t('Last 30 days')} />
              <div className="h-[280px] px-2 py-4">
                <ResponsiveContainer>
                  <BarChart data={data.dailyVisits} margin={{ left: -18, right: 8 }}>
                    <CartesianGrid stroke={C.grid} vertical={false} />
                    <XAxis dataKey="day" tick={axis} tickFormatter={(d) => num(Number(d.slice(8)))} />
                    <YAxis tick={axis} allowDecimals={false} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {types.map((k) => <Bar key={k} animationDuration={800} dataKey={k} stackId="v" fill={TYPE_COLORS[k] || C.soft} name={TYPE_NAMES[k] ? t(TYPE_NAMES[k]) : k} />)}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel>
              <PanelHead title={t('Villages')} hint={t('Patients and active pregnancies')} />
              <div className="h-[280px] px-2 py-4">
                <ResponsiveContainer>
                  <BarChart data={data.villages} layout="vertical" margin={{ left: 12, right: 12 }}>
                    <CartesianGrid stroke={C.grid} horizontal={false} />
                    <XAxis type="number" tick={axis} allowDecimals={false} />
                    <YAxis type="category" dataKey="village" tick={axis} width={80} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar animationDuration={800} dataKey="patients" fill={C.ink} name={t('Patients')} />
                    <Bar animationDuration={800} dataKey="pregnancies" fill={C.pine} name={t('Active pregnancies')} />
                    <Bar animationDuration={800} dataKey="highRisk" fill={C.lali} name={t('High risk')} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel>
              <PanelHead title={t('New registrations per month')} />
              <div className="h-[260px] px-2 py-4">
                <ResponsiveContainer>
                  <LineChart data={data.monthlyRegistrations} margin={{ left: -18, right: 16 }}>
                    <CartesianGrid stroke={C.grid} vertical={false} />
                    <XAxis dataKey="month" tick={axis} />
                    <YAxis tick={axis} allowDecimals={false} />
                    <Tooltip />
                    <Line animationDuration={900} type="monotone" dataKey="count" name={t('Registrations')} stroke={C.pine} strokeWidth={2.5} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel>
              <PanelHead title={t('Follow-up visits completed')} />
              <div className="px-5 py-6">
                <div className="font-condensed text-[56px] leading-none font-semibold text-pine">{rate == null ? '–' : `${num(Math.round(rate * 100))}%`}</div>
                <p className="mt-2 text-ink-soft">{t('{done} of {due} follow-ups that were due have happened.', { done: data.followUp.completed, due: data.followUp.due })}</p>
                <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-line-soft">
                  <div className="h-full rounded-full bg-pine transition-[width] duration-700" style={{ width: `${(rate || 0) * 100}%` }} />
                </div>
                <div className="mt-6 grid grid-cols-2 gap-4 border-t border-line-soft pt-4 text-sm">
                  <div><b className="block font-condensed text-2xl">{num(tot.visitsThisMonth)}</b><span className="text-ink-soft">{t('visits this month')}</span></div>
                  <div><b className="block font-condensed text-2xl">{num(tot.pendingSync)}</b><span className="text-ink-soft">{t('changes still on phones')}</span></div>
                </div>
              </div>
            </Panel>
          </div>

          {isAdmin && (
          <Panel className="mt-5">
            <PanelHead title={t('Live event stream')} hint={t('Kafka events per minute, counted by Spark Structured Streaming')} />
            {streamByMinute.length === 0 ? (
              <Empty title={t('No streaming data yet')}>{t('Start Kafka and the Spark streaming job (see the README). Events then appear here within a minute.')}</Empty>
            ) : (
              <div className="h-[240px] px-2 py-4">
                <ResponsiveContainer>
                  <LineChart data={streamByMinute} margin={{ left: -18, right: 16 }}>
                    <CartesianGrid stroke={C.grid} vertical={false} />
                    <XAxis dataKey="minute" tick={axis} />
                    <YAxis tick={axis} allowDecimals={false} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line dataKey="patient-events" stroke={C.ink} strokeWidth={2} dot={false} name={t('Patients')} />
                    <Line dataKey="maternal-health-events" stroke={C.lali} strokeWidth={2} dot={false} name={t('Maternal')} />
                    <Line dataKey="clinic-visit-events" stroke={C.pine} strokeWidth={2} dot={false} name={t('Visits')} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>
          )}

          {isAdmin && data.jobs?.length > 0 && (
            <Panel className="mt-5">
              <PanelHead title={t('Spark job runs')} />
              <Table head={[t('Job'), t('Finished'), t('Duration'), t('Rows read'), t('Rows written')]}>
                {data.jobs.map((j, i) => (
                  <tr key={i}>
                    <td className="font-semibold">{t(j.job)}</td>
                    <td>{formatDateTime(j.finished_at)}</td>
                    <td>{t('{n} s', { n: (j.duration_ms / 1000).toFixed(1) })}</td>
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
