import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Stethoscope, Baby, Paperclip, Upload } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../offline/indexedDB.js';
import { saveRecord } from '../offline/repository.js';
import { api } from '../services/api.js';
import { useRecord, useRelated } from '../hooks/useRecords.js';
import { useSync } from '../context/SyncContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { RecordForm, PATIENT_FIELDS, PREGNANCY_FIELDS, VISIT_FIELDS } from '../components/RecordForm.jsx';
import { ConflictCard } from '../components/ConflictCard.jsx';
import { Avatar, Badge, Button, Empty, Panel, PanelHead, WeeksBar, cx } from '../components/ui.jsx';
import { gestationalWeeks, riskFlags } from '../../../shared/schema.js';
import { formatDate, formatDateTime, today, wardName, bytes } from '../utils/format.js';

const RISK_TONE = { high: 'lali', moderate: 'marigold', low: 'pine' };

function Vital({ label, value, unit, bad }) {
  return (
    <div className="border-line-soft px-3.5 py-3 [&:not(:first-child)]:border-l max-sm:[&:nth-child(3)]:border-l-0 max-sm:[&:nth-child(n+3)]:border-t">
      <div className={cx('font-condensed text-2xl font-semibold', bad && 'text-lali')}>
        {value ?? '–'}{value != null && unit && <small className="ml-0.5 font-sans text-[13px] font-medium text-ink-soft">{unit}</small>}
      </div>
      <div className="text-xs text-ink-soft">{label}</div>
    </div>
  );
}

function Attachments({ recordId }) {
  const sync = useSync();
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => api.attachments(recordId).then((r) => setItems(r.attachments)).catch(() => setItems(null));
  useEffect(() => { if (!sync.isOffline) load(); }, [recordId, sync.isOffline]); // eslint-disable-line react-hooks/exhaustive-deps

  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const dataBase64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result).split(',')[1]);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      await api.upload(recordId, file, dataBase64);
      toast('File uploaded to object storage.');
      load();
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      setBusy(false);
    }
  };
  const open = async (id) => {
    const blob = await api.download(id);
    window.open(URL.createObjectURL(blob), '_blank');
  };

  return (
    <Panel>
      <PanelHead title="Documents" hint={sync.isOffline ? 'Available when online' : 'Stored in MinIO'}>
        {!sync.isOffline && (
          <label className="ml-2 inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-line px-3 text-[13px] font-semibold hover:border-ink-soft">
            <Upload size={14} /> {busy ? 'Uploading…' : 'Upload'}
            <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={upload} disabled={busy} />
          </label>
        )}
      </PanelHead>
      {sync.isOffline ? (
        <Empty title="Documents need a connection">Photos of ANC cards and lab reports are kept in object storage, not on the phone.</Empty>
      ) : !items?.length ? (
        <Empty title="No documents">Upload a photo of the ANC card or a lab report.</Empty>
      ) : (
        <ul>
          {items.map((a) => (
            <li key={a.id} className="flex items-center gap-3 border-t border-line-soft px-5 py-3 first:border-t-0">
              <Paperclip size={16} className="text-ink-soft" />
              <button type="button" className="cursor-pointer font-semibold text-pine" onClick={() => open(a.id)}>{a.filename}</button>
              <span className="ml-auto text-[13px] text-ink-soft">{bytes(a.size_bytes)}, {formatDateTime(a.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function PatientDetail() {
  const { id } = useParams();
  const patient = useRecord(id);
  const related = useRelated(id);
  const sync = useSync();
  const toast = useToast();
  const [form, setForm] = useState(null);
  const conflicts = useLiveQuery(async () => {
    const ids = [id, ...related.map((r) => r.id)];
    return db.conflicts.where('recordId').anyOf(ids).filter((c) => c.status === 'open').toArray();
  }, [id, related], []);

  const pregnancies = useMemo(() => related.filter((r) => r.entity === 'pregnancy').sort((a, b) => (b.data.lmp || '').localeCompare(a.data.lmp || '')), [related]);
  const visits = useMemo(() => related.filter((r) => r.entity === 'visit').sort((a, b) => (b.data.date || '').localeCompare(a.data.date || '')), [related]);
  const activePreg = pregnancies.find((p) => p.data.status === 'active');

  if (patient === null) return null;
  if (!patient) {
    return <Empty title="Patient not found" action={<Link to="/patients" className="font-semibold text-pine">Back to patients</Link>}>This record is not on this phone.</Empty>;
  }
  const d = patient.data;
  const villages = [d.village].filter(Boolean);

  const updatePregnancyFromVisit = async (_saved, changes) => {
    if (!activePreg || changes.type !== 'ANC' || !form?.syncVitals) return;
    const vitals = {};
    for (const k of ['bpSystolic', 'bpDiastolic', 'hemoglobin', 'weightKg']) if (changes[k] != null) vitals[k] = changes[k];
    if (changes.followUpDate) vitals.nextVisitDate = changes.followUpDate;
    if (Object.keys(vitals).length) await saveRecord({ entity: 'pregnancy', id: activePreg.id, ward: activePreg.ward, changes: vitals });
  };

  const markDelivered = async () => {
    await saveRecord({ entity: 'pregnancy', id: activePreg.id, ward: activePreg.ward, changes: { status: 'delivered', deliveryDate: today() } });
    sync.schedule(800);
    toast('Pregnancy marked as delivered.', sync.isOffline ? 'pending' : 'ok');
  };

  const flags = activePreg ? riskFlags(activePreg.data) : [];
  const weeks = activePreg ? gestationalWeeks(activePreg.data.lmp) : null;

  return (
    <>
      <Link to="/patients" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft no-underline hover:text-ink">
        <ArrowLeft size={16} /> Patients
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-4.5">
        <Avatar name={d.name} seed={d.village} size="lg" />
        <div>
          <h1 className="font-condensed text-[30px] font-semibold md:text-[32px]">{d.name}</h1>
          <p className="text-ink-soft">{[d.age && `${d.age} years`, d.sex, d.village, wardName(patient.ward)].filter(Boolean).join(', ')}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {patient.pendingCount > 0 && <Badge tone="marigold">{patient.pendingCount} change{patient.pendingCount > 1 ? 's' : ''} not synced</Badge>}
            {patient.localOnly && <Badge tone="marigold">Created offline</Badge>}
            {!patient.pendingCount && !patient.localOnly && <Badge tone="pine">Synced, version {patient.version}</Badge>}
          </div>
        </div>
        <div className="flex w-full flex-wrap gap-2.5 md:ml-auto md:w-auto">
          <Button variant="ghost" onClick={() => setForm({ kind: 'patient' })}><Pencil size={16} /> Edit</Button>
          {d.sex === 'female' && !activePreg && <Button variant="ghost" onClick={() => setForm({ kind: 'pregnancy' })}><Baby size={16} /> Register pregnancy</Button>}
          <Button onClick={() => setForm({ kind: 'visit', syncVitals: true })}><Stethoscope size={16} /> Record visit</Button>
        </div>
      </div>

      {conflicts.length > 0 && (
        <div className="mb-5">
          {conflicts.map((c) => <div key={c.id} className="mb-3"><ConflictCard conflict={c} showPatient={false} /></div>)}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
        <div className="flex flex-col gap-5">
          {activePreg && (
            <Panel>
              <PanelHead title="Current pregnancy">
                <Badge tone={RISK_TONE[activePreg.data.riskLevel] || 'neutral'} className="ml-auto capitalize">{activePreg.data.riskLevel || 'Unknown'} risk</Badge>
              </PanelHead>
              <div className="px-5 py-4.5">
                <WeeksBar weeks={weeks} />
                <p className="mt-2 text-sm text-ink-soft">
                  Expected delivery {formatDate(activePreg.data.edd)}. Next visit {formatDate(activePreg.data.nextVisitDate)}.
                  {activePreg.data.gravida ? ` Gravida ${activePreg.data.gravida}, para ${activePreg.data.parity ?? 0}.` : ''}
                </p>
                <div className="mt-4 grid grid-cols-2 rounded-md border border-line-soft sm:grid-cols-4">
                  <Vital label="Systolic" value={activePreg.data.bpSystolic} unit="mmHg" bad={activePreg.data.bpSystolic >= 140} />
                  <Vital label="Diastolic" value={activePreg.data.bpDiastolic} unit="mmHg" bad={activePreg.data.bpDiastolic >= 90} />
                  <Vital label="Hemoglobin" value={activePreg.data.hemoglobin} unit="g/dL" bad={activePreg.data.hemoglobin < 10} />
                  <Vital label="Weight" value={activePreg.data.weightKg} unit="kg" />
                </div>
                {flags.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{flags.map((f) => <Badge key={f} tone="lali">{f}</Badge>)}</div>}
                {activePreg.data.dangerSigns && <p className="mt-3 text-sm"><b>Danger signs:</b> {activePreg.data.dangerSigns}</p>}
                <div className="mt-4 flex flex-wrap gap-2.5">
                  <Button size="sm" variant="ghost" onClick={() => setForm({ kind: 'pregnancy', record: activePreg })}>Update pregnancy</Button>
                  <Button size="sm" variant="ghost" onClick={markDelivered}>Mark as delivered</Button>
                </div>
              </div>
            </Panel>
          )}

          <Panel>
            <PanelHead title="Visits" hint={`${visits.length} recorded`} />
            {visits.length === 0 ? (
              <Empty title="No visits yet" action={<Button size="sm" onClick={() => setForm({ kind: 'visit', syncVitals: true })}>Record visit</Button>}>
                Each visit is kept permanently. Corrections are recorded as a new visit.
              </Empty>
            ) : (
              <ol className="px-5 pb-1.5">
                {visits.map((v) => (
                  <li key={v.id} className={cx(
                    'relative ml-1.5 border-l-2 border-line-soft py-3.5 pl-6.5 before:absolute before:top-[18px] before:-left-[7px] before:size-3 before:rounded-full before:border-2 before:bg-white',
                    v.data.type === 'ANC' ? 'before:border-lali' : v.data.type === 'immunization' ? 'before:border-sky' : v.data.type === 'referral' ? 'before:border-marigold' : 'before:border-pine',
                  )}>
                    <div className="text-[13px] text-ink-soft">{formatDate(v.data.date)}{v.pendingCount ? ', not synced yet' : ''}</div>
                    <div className="font-semibold">{v.data.type === 'ANC' ? 'Antenatal check' : v.data.type === 'PNC' ? 'Postnatal check' : `${v.data.type[0].toUpperCase()}${v.data.type.slice(1)} visit`}</div>
                    <div className="mt-0.5 text-sm text-ink-2">
                      {[v.data.bpSystolic && `BP ${v.data.bpSystolic}/${v.data.bpDiastolic}`, v.data.hemoglobin && `Hb ${v.data.hemoglobin}`,
                        v.data.weightKg && `${v.data.weightKg} kg`, v.data.temperatureC && `${v.data.temperatureC} °C`].filter(Boolean).join(', ')}
                      {v.data.findings && <div>{v.data.findings}</div>}
                      {v.data.referredTo && <div>Referred to {v.data.referredTo}</div>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>

        <div className="flex flex-col gap-5">
          <Panel>
            <PanelHead title="Profile" />
            <dl className="grid grid-cols-1 gap-x-4 gap-y-0.5 px-5 py-4.5 sm:grid-cols-[140px_1fr] sm:gap-y-2.5">
              {[['Phone', d.phone], ['Household', d.household], ['Blood group', d.bloodGroup], ['Allergies', d.allergies],
                ['Chronic conditions', d.chronicConditions], ['Notes', d.notes]].map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-sm text-ink-soft">{k}</dt>
                  <dd className="mb-2 font-medium sm:mb-0">{v || '–'}</dd>
                </div>
              ))}
            </dl>
          </Panel>
          {pregnancies.filter((p) => p.data.status !== 'active').length > 0 && (
            <Panel>
              <PanelHead title="Past pregnancies" />
              <ul>
                {pregnancies.filter((p) => p.data.status !== 'active').map((p) => (
                  <li key={p.id} className="border-t border-line-soft px-5 py-3 text-sm first:border-t-0">
                    <b className="capitalize">{p.data.status}</b> {p.data.deliveryDate ? `on ${formatDate(p.data.deliveryDate)}` : ''}
                    <div className="text-ink-soft">Last period {formatDate(p.data.lmp)}</div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          <Attachments recordId={patient.id} />
        </div>
      </div>

      {form?.kind === 'patient' && (
        <RecordForm entity="patient" title="Edit patient" fields={PATIENT_FIELDS} record={patient} villages={villages} onClose={() => setForm(null)} />
      )}
      {form?.kind === 'pregnancy' && (
        <RecordForm entity="pregnancy" title={form.record ? 'Update pregnancy' : 'Register pregnancy'} fields={PREGNANCY_FIELDS}
          record={form.record} fixed={form.record ? {} : { patientId: patient.id, ward: patient.ward, defaults: { status: 'active', riskLevel: 'low' } }}
          onClose={() => setForm(null)} />
      )}
      {form?.kind === 'visit' && (
        <RecordForm entity="visit" title="Record visit" fields={VISIT_FIELDS} saveLabel="Save visit"
          fixed={{ patientId: patient.id, ward: patient.ward, ...(activePreg ? { pregnancyId: activePreg.id } : {}),
            defaults: { type: activePreg ? 'ANC' : 'general', date: today() } }}
          afterSave={updatePregnancyFromVisit}
          extra={activePreg && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.syncVitals} onChange={(e) => setForm({ ...form, syncVitals: e.target.checked })} />
              For antenatal visits, also update the pregnancy record with these readings
            </label>
          )}
          onClose={() => setForm(null)} />
      )}
    </>
  );
}
