import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePregnancies } from '../hooks/useRecords.js';
import { gestationalWeeks, riskFlags } from '../../../shared/schema.js';
import { Badge, Empty, Figures, PageHead, Panel, Segmented, Table, WeeksBar, cx } from '../components/ui.jsx';
import { daysFromToday, formatDate } from '../utils/format.js';
import { t } from '../i18n/index.jsx';

const RISK = { high: 'High', moderate: 'Moderate', low: 'Low' };

const RISK_TONE = { high: 'lali', moderate: 'marigold', low: 'pine' };

export function MaternalHealth() {
  const pregnancies = usePregnancies();
  const navigate = useNavigate();
  const [filter, setFilter] = useState('all');

  const active = useMemo(() => (pregnancies || [])
    .filter((p) => p.data.status === 'active' && p.patient)
    .map((p) => ({ ...p, weeks: gestationalWeeks(p.data.lmp), due: daysFromToday(p.data.nextVisitDate), flags: riskFlags(p.data) }))
    .sort((a, b) => (b.weeks ?? 0) - (a.weeks ?? 0)), [pregnancies]);

  const shown = active.filter((p) => (filter === 'high' ? p.data.riskLevel === 'high' || p.flags.length
    : filter === 'due' ? p.due !== null && p.due <= 7
      : filter === 'third' ? (p.weeks ?? 0) >= 28 : true));

  return (
    <>
      <PageHead title={t('Maternal health')} subtitle={t('Active pregnancies in your area, with gestational age, risk and the next antenatal visit.')} />
      <Figures items={[
        { label: t('Active pregnancies'), value: active.length, tone: 'good' },
        { label: t('High risk or danger signs'), value: active.filter((p) => p.data.riskLevel === 'high' || p.flags.length).length, tone: 'alert' },
        { label: t('Third trimester (28+ weeks)'), value: active.filter((p) => (p.weeks ?? 0) >= 28).length },
        { label: t('Visit overdue'), value: active.filter((p) => p.due !== null && p.due < 0).length, tone: 'warn' },
      ]} />

      <div className="mb-4">
        <Segmented label={t('Filter pregnancies')} value={filter} onChange={setFilter} options={[
          { value: 'all', label: t('All') }, { value: 'high', label: t('Needs attention') },
          { value: 'due', label: t('Visit due this week') }, { value: 'third', label: t('Third trimester') },
        ]} />
      </div>

      <Panel>
        {pregnancies && shown.length === 0 ? (
          <Empty title={t('No pregnancies in this view')}>{t("Register a pregnancy from a patient's page.")}</Empty>
        ) : (
          <Table head={[t('Mother'), t('Gestation'), { label: t('Expected delivery'), hideSm: true }, t('Risk'), { label: t('Blood pressure'), hideSm: true }, { label: t('Hb'), hideSm: true }, t('Next visit')]}>
            {shown.map((p) => (
              <tr key={p.id} className="cursor-pointer hover:[&_td]:bg-[#f6f8fa]" onClick={() => navigate(`/patients/${p.patient.id}`)}>
                <td>
                  <div className="font-semibold">{p.patient.data.name}</div>
                  <div className="text-[13px] text-ink-soft">{p.patient.data.village}{p.openConflicts ? `, ${t('conflicting readings')}` : ''}</div>
                </td>
                <td><WeeksBar weeks={p.weeks} /></td>
                <td className="hidden md:table-cell">{formatDate(p.data.edd)}</td>
                <td><Badge tone={RISK_TONE[p.data.riskLevel] || 'neutral'} >{RISK[p.data.riskLevel] ? t(RISK[p.data.riskLevel]) : '–'}</Badge></td>
                <td className={cx('hidden md:table-cell', (p.data.bpSystolic >= 140 || p.data.bpDiastolic >= 90) && 'font-semibold text-lali')}>
                  {p.data.bpSystolic ? `${p.data.bpSystolic}/${p.data.bpDiastolic}` : '–'}
                </td>
                <td className={cx('hidden md:table-cell', p.data.hemoglobin < 10 && 'font-semibold text-lali')}>{p.data.hemoglobin ?? '–'}</td>
                <td>
                  <span className={cx(p.due !== null && p.due < 0 && 'font-semibold text-lali')}>{formatDate(p.data.nextVisitDate)}</span>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </>
  );
}
