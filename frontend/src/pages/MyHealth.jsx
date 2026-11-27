// What a patient sees: her own record only, read-only, available offline.
import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarClock, AlertTriangle, ShieldCheck } from 'lucide-react';
import { db } from '../offline/indexedDB.js';
import { useAuth } from '../context/AuthContext.jsx';
import { gestationalWeeks } from '../../../shared/schema.js';
import { Badge, Empty, Panel, PanelHead, cx } from '../components/ui.jsx';
import { daysFromToday, formatDate } from '../utils/format.js';
import { t, num } from '../i18n/index.jsx';

const DANGER_SIGNS = [
  'Bleeding from the vagina',
  'Severe headache or blurred vision',
  'Fits or loss of consciousness',
  'Fever or feeling very weak',
  'Swelling of the face or hands',
  'The baby moves less than usual',
  'Severe pain in the belly',
  'Water breaks before labour',
];

function trimester(w) {
  if (w == null) return '';
  if (w < 13) return t('First trimester');
  if (w < 28) return t('Second trimester');
  return t('Third trimester');
}

function Reading({ label, value, unit, status }) {
  return (
    <div className="border-line-soft px-4 py-3.5 [&:not(:first-child)]:border-l max-sm:[&:nth-child(3)]:border-l-0 max-sm:[&:nth-child(n+3)]:border-t">
      <div className={cx('font-condensed text-[26px] font-semibold', status === 'high' && 'text-lali')}>
        {value ?? '–'}{value != null && <small className="ml-1 font-sans text-[13px] font-medium text-ink-soft">{unit}</small>}
      </div>
      <div className="text-[13px] text-ink-soft">{label}</div>
      {status && <Badge tone={status === 'high' ? 'lali' : 'pine'} className="mt-1.5">{status === 'high' ? t('Needs a check') : t('Normal')}</Badge>}
    </div>
  );
}

export function MyHealth() {
  const { user } = useAuth();
  const data = useLiveQuery(async () => {
    const all = await db.records.toArray();
    const me = all.find((r) => r.entity === 'patient' && (r.id === user.patientId || !user.patientId));
    if (!me) return { me: null };
    const mine = all.filter((r) => !r.deleted && r.data.patientId === me.id);
    return {
      me,
      pregnancy: mine.filter((r) => r.entity === 'pregnancy').sort((a, b) => (b.data.lmp || '').localeCompare(a.data.lmp || ''))[0],
      visits: mine.filter((r) => r.entity === 'visit').sort((a, b) => (b.data.date || '').localeCompare(a.data.date || '')),
    };
  }, [user.patientId], undefined);

  const preg = data?.pregnancy?.data.status === 'active' ? data.pregnancy : null;
  const weeks = preg ? gestationalWeeks(preg.data.lmp) : null;
  const next = preg ? daysFromToday(preg.data.nextVisitDate) : null;
  const pct = useMemo(() => Math.min(100, ((weeks || 0) / 40) * 100), [weeks]);

  if (data === undefined) return null;
  if (!data.me) {
    return <Panel><Empty title={t('Your record is on its way')}>{t('Connect to the internet once so your health record can be downloaded to this phone.')}</Empty></Panel>;
  }
  const d = data.me.data;
  const bpHigh = preg && (preg.data.bpSystolic >= 140 || preg.data.bpDiastolic >= 90);

  return (
    <>
      <div className="mb-6">
        <h1 className="font-condensed text-[28px] font-semibold tracking-tight md:text-[34px]">{t('Namaste, {name}', { name: d.name.split(' ')[0] })}</h1>
        <p className="mt-1 text-ink-soft">{t('Your health record from {village}. It is saved on this phone, so you can open it without internet.', { village: d.village })}</p>
      </div>

      {preg ? (
        <section className="mb-5 overflow-hidden rounded-2xl bg-pine text-white">
          <div className="grid gap-5 px-6 py-6 md:grid-cols-[1fr_auto] md:px-8">
            <div>
              <div className="text-white/80">{trimester(weeks)}</div>
              <div className="font-condensed text-[56px] leading-none font-semibold md:text-[72px]">{weeks === null || weeks === undefined ? '–' : t('Week {n}', { n: weeks })}</div>
              <div className="mt-1 text-white/85">{t('of about 40. Your baby is expected around {date}.', { date: formatDate(preg.data.edd) })}</div>
              <div className="relative mt-5 h-3 overflow-hidden rounded-full bg-white/20">
                <div className="absolute inset-y-0 left-0 rounded-full bg-marigold transition-[width] duration-1000" style={{ width: `${pct}%` }} />
                <span className="absolute inset-y-0 left-[32.5%] w-0.5 bg-pine" />
                <span className="absolute inset-y-0 left-[67.5%] w-0.5 bg-pine" />
              </div>
              <div className="mt-1.5 flex justify-between text-xs text-white/70"><span>{t('Week {n}', { n: 1 })}</span><span>{num(13)}</span><span>{num(27)}</span><span>{num(40)}</span></div>
            </div>
            <div className="self-start rounded-xl bg-white/12 px-5 py-4 md:min-w-[230px]">
              <div className="flex items-center gap-2 text-white/85"><CalendarClock size={18} /> {t('Next check-up')}</div>
              <div className="mt-1 font-condensed text-[28px] font-semibold">{formatDate(preg.data.nextVisitDate)}</div>
              <div className="text-sm text-white/85">
                {next == null ? t('Your health volunteer will set the date.') : next < 0 ? t('{n} days ago. Please contact your health volunteer.', { n: -next }) : next === 0 ? t('Today') : next === 1 ? t('In 1 day') : t('In {n} days', { n: next })}
              </div>
            </div>
          </div>
        </section>
      ) : (
        <Panel className="mb-5"><Empty title={t('No active pregnancy recorded')}>{t('Your visits and readings are shown below.')}</Empty></Panel>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="flex flex-col gap-5">
          {preg && (
            <Panel>
              <PanelHead title={t('Your latest readings')} hint={t('Recorded by your health volunteer')} />
              <div className="grid grid-cols-2 sm:grid-cols-4">
                <Reading label={t('Blood pressure')} value={preg.data.bpSystolic ? `${preg.data.bpSystolic}/${preg.data.bpDiastolic}` : null} unit="mmHg" status={preg.data.bpSystolic ? (bpHigh ? 'high' : 'ok') : null} />
                <Reading label={t('Hemoglobin')} value={preg.data.hemoglobin} unit="g/dL" status={preg.data.hemoglobin ? (preg.data.hemoglobin < 10 ? 'high' : 'ok') : null} />
                <Reading label={t('Weight')} value={preg.data.weightKg} unit="kg" />
                <Reading label={t('Pregnancy number')} value={preg.data.gravida} unit="" />
              </div>
              {(bpHigh || preg.data.hemoglobin < 10) && (
                <p className="border-t border-line-soft px-5 py-3.5 text-sm text-ink-2">
                  {t('One of your readings needs another check. Please show this to your health volunteer and keep your next appointment.')}
                </p>
              )}
            </Panel>
          )}

          <Panel>
            <PanelHead title={t('Your visits')} hint={t('{n} recorded', { n: data.visits.length })} />
            {data.visits.length === 0 ? <Empty title={t('No visits yet')} /> : (
              <ol className="px-5 pb-1.5">
                {data.visits.map((v) => (
                  <li key={v.id} className="relative ml-1.5 border-l-2 border-line-soft py-3.5 pl-6.5 before:absolute before:top-[18px] before:-left-[7px] before:size-3 before:rounded-full before:border-2 before:border-pine before:bg-white">
                    <div className="text-[13px] text-ink-soft">{formatDate(v.data.date)}</div>
                    <div className="font-semibold">{v.data.type === 'ANC' ? t('Pregnancy check-up') : v.data.type === 'immunization' ? t('Vaccination') : t('Health visit')}</div>
                    <div className="text-sm text-ink-2">
                      {[v.data.bpSystolic && `${t('Blood pressure')} ${v.data.bpSystolic}/${v.data.bpDiastolic}`, v.data.hemoglobin && `${t('Hemoglobin')} ${v.data.hemoglobin}`, v.data.findings].filter(Boolean).join('. ')}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>

        <div className="flex flex-col gap-5">
          <Panel className="border-[#f2c4ce]">
            <div className="flex items-center gap-2.5 rounded-t-[10px] bg-lali-wash px-5 py-3.5 font-semibold text-lali-deep">
              <AlertTriangle size={18} /> {t('Go to the health post at once if you have')}
            </div>
            <ul className="px-5 py-3">
              {DANGER_SIGNS.map((s) => (
                <li key={s} className="flex items-start gap-2.5 py-1.5 text-[15px]"><span className="mt-2 size-1.5 flex-none rounded-full bg-lali" />{t(s)}</li>
              ))}
            </ul>
          </Panel>
          <Panel>
            <div className="flex items-start gap-3 px-5 py-4 text-sm text-ink-2">
              <ShieldCheck size={20} className="mt-0.5 flex-none text-pine" />
              <p>{t('Only you, your health volunteer and the health post doctor can see this record. If something looks wrong, tell your health volunteer at the next visit.')}</p>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
