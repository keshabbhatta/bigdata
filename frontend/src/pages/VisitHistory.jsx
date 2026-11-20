import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useVisits } from '../hooks/useRecords.js';
import { Badge, Empty, Input, PageHead, Panel, Segmented } from '../components/ui.jsx';
import { formatDate } from '../utils/format.js';

const TYPE_TONE = { ANC: 'lali', PNC: 'lali', immunization: 'sky', referral: 'marigold', general: 'neutral' };
const TYPE_LABEL = { ANC: 'Antenatal', PNC: 'Postnatal', immunization: 'Immunization', referral: 'Referral', general: 'General' };

export function VisitHistory() {
  const visits = useVisits();
  const [type, setType] = useState('all');
  const [q, setQ] = useState('');

  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = (visits || []).filter((v) => (type === 'all' || v.data.type === type)
      && (!term || (v.patient?.data.name || '').toLowerCase().includes(term) || (v.data.findings || '').toLowerCase().includes(term)));
    const map = new Map();
    for (const v of list.slice(0, 400)) {
      const k = v.data.date || 'Unknown date';
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(v);
    }
    return [...map.entries()];
  }, [visits, type, q]);

  return (
    <>
      <PageHead title="Visit history" subtitle="Every visit recorded in your area. Visits are never edited; a correction is saved as a new visit, so the history stays complete." />
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <div className="relative max-w-[360px] min-w-[220px] flex-1">
          <Search size={17} className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-soft" />
          <Input className="pl-[38px]" placeholder="Search by patient or findings" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search visits" />
        </div>
        <Segmented label="Visit type" value={type} onChange={setType} options={[
          { value: 'all', label: 'All' }, { value: 'ANC', label: 'Antenatal' }, { value: 'general', label: 'General' },
          { value: 'immunization', label: 'Immunization' }, { value: 'referral', label: 'Referral' },
        ]} />
      </div>

      {visits && groups.length === 0 ? (
        <Panel><Empty title="No visits match">Change the visit type or search term.</Empty></Panel>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(([date, list]) => (
            <Panel key={date}>
              <div className="flex items-center gap-3 border-b border-line-soft px-5 py-3">
                <h2 className="font-semibold">{formatDate(date)}</h2>
                <span className="ml-auto text-[13px] text-ink-soft">{list.length} visit{list.length > 1 ? 's' : ''}</span>
              </div>
              <ul>
                {list.map((v) => (
                  <li key={v.id} className="border-t border-line-soft first:border-t-0">
                    <Link to={`/patients/${v.data.patientId}`} className="flex items-start gap-3.5 px-5 py-3 text-inherit no-underline hover:bg-[#f6f8fa]">
                      <Badge tone={TYPE_TONE[v.data.type]} className="mt-0.5 w-[100px] justify-center">{TYPE_LABEL[v.data.type] || v.data.type}</Badge>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">{v.patient?.data.name || 'Unknown patient'}</div>
                        <div className="text-[13px] text-ink-soft">
                          {[v.data.bpSystolic && `BP ${v.data.bpSystolic}/${v.data.bpDiastolic}`, v.data.hemoglobin && `Hb ${v.data.hemoglobin}`,
                            v.data.temperatureC && `${v.data.temperatureC} °C`, v.data.findings].filter(Boolean).join(', ') || 'No details recorded'}
                        </div>
                      </div>
                      {v.pendingCount > 0 && <Badge tone="marigold">Not synced</Badge>}
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          ))}
        </div>
      )}
    </>
  );
}
