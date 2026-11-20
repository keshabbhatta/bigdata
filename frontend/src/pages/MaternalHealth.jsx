import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePregnancies } from '../hooks/useRecords.js';
import { gestationalWeeks, riskFlags } from '../../../shared/schema.js';
import { Badge, Empty, Figures, PageHead, Panel, Segmented, Table, WeeksBar, cx } from '../components/ui.jsx';
import { daysFromToday, formatDate } from '../utils/format.js';

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
      <PageHead title="Maternal health" subtitle="Active pregnancies in your area, with gestational age, risk and the next antenatal visit." />
      <Figures items={[
        { label: 'Active pregnancies', value: active.length, tone: 'good' },
        { label: 'High risk or danger signs', value: active.filter((p) => p.data.riskLevel === 'high' || p.flags.length).length, tone: 'alert' },
        { label: 'Third trimester (28+ weeks)', value: active.filter((p) => (p.weeks ?? 0) >= 28).length },
        { label: 'Visit overdue', value: active.filter((p) => p.due !== null && p.due < 0).length, tone: 'warn' },
      ]} />

      <div className="mb-4">
        <Segmented label="Filter pregnancies" value={filter} onChange={setFilter} options={[
          { value: 'all', label: 'All' }, { value: 'high', label: 'Needs attention' },
          { value: 'due', label: 'Visit due this week' }, { value: 'third', label: 'Third trimester' },
        ]} />
      </div>

      <Panel>
        {pregnancies && shown.length === 0 ? (
          <Empty title="No pregnancies in this view">Register a pregnancy from a patient&apos;s page.</Empty>
        ) : (
          <Table head={['Mother', 'Gestation', { label: 'Expected delivery', hideSm: true }, 'Risk', { label: 'Blood pressure', hideSm: true }, { label: 'Hb', hideSm: true }, 'Next visit']}>
            {shown.map((p) => (
              <tr key={p.id} className="cursor-pointer hover:[&_td]:bg-[#f6f8fa]" onClick={() => navigate(`/patients/${p.patient.id}`)}>
                <td>
                  <div className="font-semibold">{p.patient.data.name}</div>
                  <div className="text-[13px] text-ink-soft">{p.patient.data.village}{p.openConflicts ? ', conflicting readings' : ''}</div>
                </td>
                <td><WeeksBar weeks={p.weeks} /></td>
                <td className="hidden md:table-cell">{formatDate(p.data.edd)}</td>
                <td><Badge tone={RISK_TONE[p.data.riskLevel] || 'neutral'} className="capitalize">{p.data.riskLevel || '–'}</Badge></td>
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
