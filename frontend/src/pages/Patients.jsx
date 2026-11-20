import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../offline/indexedDB.js';
import { useAuth } from '../context/AuthContext.jsx';
import { usePatients } from '../hooks/useRecords.js';
import { RecordForm, PATIENT_FIELDS } from '../components/RecordForm.jsx';
import { Avatar, Badge, Button, Empty, Input, PageHead, Panel, Select } from '../components/ui.jsx';

export function Patients() {
  const { user } = useAuth();
  const patients = usePatients();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [village, setVillage] = useState('');
  const location = useLocation();
  const [adding, setAdding] = useState(Boolean(location.state?.add));
  const pregnant = useLiveQuery(async () => new Set(
    (await db.records.where('entity').equals('pregnancy').filter((p) => !p.deleted && p.data.status === 'active').toArray()).map((p) => p.data.patientId),
  ), [], new Set());

  const villages = useMemo(() => [...new Set((patients || []).map((p) => p.data.village).filter(Boolean))].sort(), [patients]);
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (patients || []).filter((p) => (!village || p.data.village === village)
      && (!term || [p.data.name, p.data.village, p.data.household, p.data.phone].some((x) => (x || '').toLowerCase().includes(term))));
  }, [patients, q, village]);

  return (
    <>
      <PageHead title="Patients" subtitle={patients ? `${patients.length} people registered in your ${user.wards.length > 1 ? 'wards' : 'ward'}.` : ' '}>
        <Button onClick={() => setAdding(true)}><Plus size={18} /> Register patient</Button>
      </PageHead>

      <div className="mb-4 flex flex-wrap gap-2.5">
        <div className="relative max-w-[420px] min-w-[220px] flex-1">
          <Search size={17} className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-soft" />
          <Input className="pl-[38px]" placeholder="Search by name, village, household or phone" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search patients" />
        </div>
        <Select className="w-auto" value={village} onChange={(e) => setVillage(e.target.value)} aria-label="Filter by village">
          <option value="">All villages</option>
          {villages.map((v) => <option key={v}>{v}</option>)}
        </Select>
      </div>

      <Panel>
        {patients && list.length === 0 ? (
          <Empty title={patients.length ? 'No patients match your search' : 'No patients yet'}
            action={!patients.length && <Button onClick={() => setAdding(true)}>Register patient</Button>}>
            {patients.length ? 'Try another name or clear the village filter.' : 'Patients you register appear here, even before they sync.'}
          </Empty>
        ) : (
          <ul>
            {list.map((p, idx) => (
              <li key={p.id} className="reveal border-t border-line-soft first:border-t-0" style={{ '--i': Math.min(idx, 12) }}>
                <button type="button" onClick={() => navigate(`/patients/${p.id}`)}
                  className="flex w-full cursor-pointer items-center gap-3.5 px-5 py-3 text-left transition-colors hover:bg-pine-wash/40">
                  <Avatar name={p.data.name} seed={p.data.village} />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{p.data.name}</div>
                    <div className="text-[13px] text-ink-soft">
                      {[p.data.age && `${p.data.age} yrs`, p.data.sex, p.data.village, p.data.household].filter(Boolean).join(', ')}
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {pregnant.has(p.id) && <Badge tone="pine">Pregnant</Badge>}
                    {p.openConflicts > 0 && <Badge tone="lali">Conflict</Badge>}
                    {p.pendingCount > 0 && <Badge tone="marigold">Not synced</Badge>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {adding && (
        <RecordForm
          entity="patient" title="Register patient" fields={PATIENT_FIELDS} wards={user.wards} villages={villages}
          fixed={{ defaults: { sex: 'female' } }}
          onClose={(saved) => { setAdding(false); if (saved) navigate(`/patients/${saved.id}`); }}
        />
      )}
    </>
  );
}
