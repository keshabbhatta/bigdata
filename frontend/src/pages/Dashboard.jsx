import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Users, Baby, Stethoscope, CloudUpload, CalendarClock, AlertTriangle, ClipboardList, UserPlus } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../offline/indexedDB.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSync } from '../context/SyncContext.jsx';
import { usePregnancies } from '../hooks/useRecords.js';
import { gestationalWeeks, riskFlags } from '../../../shared/schema.js';
import { Avatar, Badge, Button, Empty, Figures, Panel, PanelHead, SkeletonRows, WeeksBar, cx } from '../components/ui.jsx';
import { daysFromToday, formatDate, formatToday, today, wardFullName, nameParts } from '../utils/format.js';
import { t } from '../i18n/index.jsx';

const VISIT_LABEL = { ANC: 'Antenatal check', PNC: 'Postnatal check', general: 'General visit', immunization: 'Immunization', referral: 'Referral' };

function dueLabel(d) {
  if (d === null) return { text: t('No date'), tone: 'neutral' };
  if (d < 0) return { text: d === -1 ? t('1 day overdue') : t('{n} days overdue', { n: -d }), tone: 'lali' };
  if (d === 0) return { text: t('Today'), tone: 'marigold' };
  return { text: d === 1 ? t('In 1 day') : t('In {n} days', { n: d }), tone: d <= 3 ? 'marigold' : 'neutral' };
}

export function Dashboard() {
  const { user } = useAuth();
  const sync = useSync();
  const pregnancies = usePregnancies();
  const counts = useLiveQuery(async () => {
    const all = await db.records.toArray();
    const alive = all.filter((r) => !r.deleted);
    const month = today().slice(0, 7);
    return {
      patients: alive.filter((r) => r.entity === 'patient').length,
      visitsThisMonth: alive.filter((r) => r.entity === 'visit' && (r.data.date || '').startsWith(month)).length,
      recent: alive.filter((r) => r.entity === 'visit').sort((a, b) => (b.pendingCount || 0) - (a.pendingCount || 0) || (b.data.date || '').localeCompare(a.data.date || '') || b.updatedAt - a.updatedAt).slice(0, 6),
      names: new Map(alive.filter((r) => r.entity === 'patient').map((p) => [p.id, p.data.name])),
    };
  }, [], null);

  const active = useMemo(() => (pregnancies || []).filter((p) => p.data.status === 'active' && p.patient), [pregnancies]);
  const due = useMemo(() => active
    .map((p) => ({ ...p, days: daysFromToday(p.data.nextVisitDate) }))
    .filter((p) => p.days !== null && p.days <= 7)
    .sort((a, b) => a.days - b.days), [active]);
  const attention = useMemo(() => active
    .map((p) => ({ ...p, flags: riskFlags(p.data) }))
    .filter((p) => p.flags.length || p.openConflicts)
    .sort((a, b) => (b.openConflicts || 0) - (a.openConflicts || 0) || b.flags.length - a.flags.length), [active]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? t('Good morning') : hour < 17 ? t('Good afternoon') : t('Good evening');
  const loading = !counts || !pregnancies;

  return (
    <>
      <section className="relative overflow-hidden rounded-3xl bg-brand px-6 pt-7 pb-20 text-white md:px-10 md:pt-9 md:pb-24">
        <svg aria-hidden className="absolute inset-x-0 bottom-0 h-24 w-full opacity-30" viewBox="0 0 800 100" preserveAspectRatio="none">
          <path d="M0 70 L90 40 L160 60 L260 20 L340 55 L420 35 L520 65 L610 25 L700 50 L800 30 L800 100 L0 100Z" fill="#0b6f93" opacity=".55" />
          <path d="M0 85 L120 65 L230 80 L360 60 L480 82 L600 66 L720 80 L800 70 L800 100 L0 100Z" fill="#17325a" />
        </svg>
        <div className="relative flex flex-wrap items-end gap-6">
          <div className="reveal">
            <p className="text-white/70">{formatToday()}</p>
            <h1 className="mt-1 font-condensed text-[32px] leading-tight font-semibold tracking-tight md:text-[44px]">{t('{greeting}, {name}', { greeting, name: nameParts(user.name).greeting })}</h1>
            <p className="mt-1 text-white/75">
              {user.wards.map(wardFullName).join('; ')}. {due.length ? (due.length === 1 ? t('1 mother is due for a check-up this week.') : t('{n} mothers are due for a check-up this week.', { n: due.length })) : t('No check-ups due this week.')}
            </p>
          </div>
          <div className="reveal ml-auto flex flex-wrap gap-2.5" style={{ '--i': 2 }}>
            <Button as={Link} to="/patients" state={{ add: true }} variant="accent"><UserPlus size={17} /> {t('Register patient')}</Button>
            <Button as={Link} to="/maternal" variant="glass"><Baby size={17} /> {t('Pregnancies')}</Button>
          </div>
        </div>
      </section>

      <Figures className="relative z-10 mx-3 -mt-14 md:mx-6" items={[
        { label: t('Registered patients'), value: counts?.patients, icon: Users },
        { label: t('Active pregnancies'), value: active.length, tone: 'good', icon: Baby },
        { label: t('Visits this month'), value: counts?.visitsThisMonth, icon: Stethoscope },
        { label: sync.pending ? t('Changes waiting to sync') : t('Everything synced'), value: sync.pending, tone: sync.pending ? 'warn' : 'good', icon: CloudUpload },
      ]} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel i={3}>
          <PanelHead title={t('Due for an antenatal visit')} hint={t('Next 7 days')} icon={CalendarClock} />
          {loading ? <SkeletonRows /> : due.length === 0 ? (
            <Empty title={t('No visits due this week')}>{t('Pregnancies with a next visit date in the coming week appear here.')}</Empty>
          ) : (
            <ul>
              {due.slice(0, 8).map((p, idx) => {
                const l = dueLabel(p.days);
                return (
                  <li key={p.id} className="reveal border-t border-line-soft first:border-t-0" style={{ '--i': idx + 4 }}>
                    <Link to={`/patients/${p.patient.id}`} className="flex items-center gap-3.5 px-5 py-3 text-inherit no-underline transition-colors hover:bg-pine-wash/40">
                      <Avatar name={p.patient.data.name} seed={p.patient.data.village} />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">{p.patient.data.name}</div>
                        <div className="text-[13px] text-ink-soft">{t('{village}, visit on {date}', { village: p.patient.data.village, date: formatDate(p.data.nextVisitDate) })}</div>
                      </div>
                      <Badge tone={l.tone}>{l.text}</Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel i={4}>
          <PanelHead title={t('Needs attention')} hint={t('Danger signs, high risk or conflicts')} icon={AlertTriangle} />
          {loading ? <SkeletonRows /> : attention.length === 0 ? (
            <Empty title={t('Nothing needs attention')}>{t('High-risk pregnancies and conflicting readings appear here.')}</Empty>
          ) : (
            <ul>
              {attention.slice(0, 8).map((p, idx) => (
                <li key={p.id} className="reveal border-t border-line-soft first:border-t-0" style={{ '--i': idx + 5 }}>
                  <Link to={`/patients/${p.patient.id}`} className="flex items-center gap-3.5 px-5 py-3 text-inherit no-underline transition-colors hover:bg-pine-wash/40">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{p.patient.data.name}</div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {p.openConflicts > 0 && <Badge tone="lali">{p.openConflicts === 1 ? t('1 conflicting reading') : t('{n} conflicting readings', { n: p.openConflicts })}</Badge>}
                        {p.flags.map((f) => <Badge key={f} tone={f === 'Marked high risk' ? 'marigold' : 'lali'}>{t(f)}</Badge>)}
                      </div>
                    </div>
                    <WeeksBar weeks={gestationalWeeks(p.data.lmp)} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel className="mt-5" i={5}>
        <PanelHead title={t('Latest visits')} hint={t('Unsynced visits are marked in yellow')} icon={ClipboardList} />
        {counts && counts.recent.length === 0 ? (
          <Empty title={t('No records yet')} action={<Link to="/patients" className="font-semibold text-pine">{t('Register the first patient')}</Link>}>
            {t('Records appear after the first sync or when you register a patient.')}
          </Empty>
        ) : (
          <ul>
            {(counts?.recent || []).map((r) => {
              const name = r.entity === 'patient' ? r.data.name : counts.names.get(r.data.patientId);
              const pid = r.entity === 'patient' ? r.id : r.data.patientId;
              return (
                <li key={r.id} className="border-t border-line-soft first:border-t-0">
                  <Link to={`/patients/${pid}`} className="flex items-center gap-3.5 px-5 py-3 text-inherit no-underline transition-colors hover:bg-pine-wash/40">
                    <span className={cx('size-2 flex-none rounded-full', r.pendingCount ? 'bg-marigold' : 'bg-pine')} />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{name || t('Unknown patient')}</div>
                      <div className="text-[13px] text-ink-soft">
                        {t(VISIT_LABEL[r.data.type] || 'Visit')}{r.data.findings ? `: ${r.data.findings}` : ''}
                      </div>
                    </div>
                    <span className="text-[13px] whitespace-nowrap text-ink-soft">{r.pendingCount ? t('Waiting to sync') : formatDate(r.data.date)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}
