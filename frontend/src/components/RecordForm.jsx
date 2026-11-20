// A form generated from the shared schema. The same field rules are checked
// here (instantly, offline) and again on the server.
import { useState } from 'react';
import { ENTITIES, isClinical, eddFromLmp } from '../../../shared/schema.js';
import { saveRecord, ValidationError } from '../offline/repository.js';
import { useSync } from '../context/SyncContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Button, Drawer, Field, Input, Select, Textarea, cx } from './ui.jsx';
import { wardName } from '../utils/format.js';

const LONG_TEXT = new Set(['notes', 'findings', 'dangerSigns', 'outcome']);
const ENUM_LABELS = {
  female: 'Female', male: 'Male', other: 'Other', low: 'Low', moderate: 'Moderate', high: 'High',
  active: 'Active', delivered: 'Delivered', closed: 'Closed', general: 'General', immunization: 'Immunization',
  referral: 'Referral', ANC: 'ANC (antenatal)', PNC: 'PNC (postnatal)', '': 'Not known',
};

function toForm(entity, fields, data) {
  const out = {};
  for (const f of fields) out[f] = data?.[f] ?? '';
  return out;
}

function fromForm(entity, values) {
  const spec = ENTITIES[entity].fields;
  const out = {};
  for (const [k, v] of Object.entries(values)) {
    if (spec[k]?.type === 'number') out[k] = v === '' || v === null ? null : Number(v);
    else out[k] = typeof v === 'string' ? v.trim() : v;
  }
  return out;
}

/**
 * @param {object} p
 * @param {'patient'|'pregnancy'|'visit'} p.entity
 * @param {string[]} p.fields        which fields to show, in order
 * @param {object} [p.record]        existing record to edit
 * @param {object} [p.fixed]         values set by the caller (e.g. patientId)
 * @param {string[]} [p.wards]       wards the user can choose from (new records)
 * @param {Function} [p.afterSave]   extra local writes after saving (same offline queue)
 */
export function RecordForm({ entity, title, fields, record, fixed = {}, wards = [], villages = [], afterSave, onClose, saveLabel, extra }) {
  const def = ENTITIES[entity];
  const [values, setValues] = useState(() => toForm(entity, fields, record?.data || fixed.defaults));
  const [ward, setWard] = useState(record?.ward || fixed.ward || wards[0]);
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const sync = useSync();
  const toast = useToast();

  const set = (k, v) => setValues((cur) => {
    const next = { ...cur, [k]: v };
    if (k === 'lmp' && entity === 'pregnancy' && v && !cur.edd) next.edd = eddFromLmp(v);
    return next;
  });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors([]);
    try {
      const { defaults, ward: _w, ...fixedValues } = fixed;
      const changes = { ...fromForm(entity, values), ...fixedValues };
      if (!record) for (const k of Object.keys(changes)) if (changes[k] === null || changes[k] === '') delete changes[k];
      const saved = await saveRecord({ entity, id: record?.id, ward, op: record ? 'UPDATE' : 'CREATE', changes });
      if (afterSave) await afterSave(saved, changes, ward);
      sync.schedule(800);
      toast(sync.isOffline ? 'Saved on this phone. It will sync when you are back online.' : 'Saved. Syncing now.', sync.isOffline ? 'pending' : 'ok');
      onClose(saved);
    } catch (err) {
      setErrors(err instanceof ValidationError ? err.problems : [err.message]);
    } finally {
      setBusy(false);
    }
  };

  const formId = `form-${entity}`;
  return (
    <Drawer
      title={title}
      onClose={() => onClose(null)}
      footer={(
        <>
          <Button variant="ghost" type="button" onClick={() => onClose(null)}>Cancel</Button>
          <Button type="submit" form={formId} disabled={busy}>{busy ? 'Saving…' : saveLabel || (record ? 'Save changes' : `Save ${def.label.toLowerCase()}`)}</Button>
        </>
      )}
    >
      <form id={formId} onSubmit={submit} className="grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2" noValidate>
        {errors.length > 0 && (
          <div className="rounded-md bg-lali-wash px-3.5 py-2.5 text-sm text-lali-deep sm:col-span-2" role="alert">
            {errors.map((x) => <div key={x}>{x}</div>)}
          </div>
        )}
        {!record && wards.length > 1 && (
          <Field label="Ward" className="sm:col-span-2">
            <Select value={ward} onChange={(e) => setWard(e.target.value)}>
              {wards.map((w) => <option key={w} value={w}>{wardName(w)}</option>)}
            </Select>
          </Field>
        )}
        {fields.map((f) => {
          const spec = def.fields[f];
          const full = LONG_TEXT.has(f) || f === 'name';
          const common = { value: values[f] ?? '', onChange: (e) => set(f, e.target.value), id: `${entity}-${f}`, name: f };
          let control;
          if (spec.type === 'enum') {
            control = (
              <Select {...common}>
                {!spec.values.includes('') && <option value="">Choose…</option>}
                {spec.values.map((v) => <option key={v} value={v}>{ENUM_LABELS[v] ?? v}</option>)}
              </Select>
            );
          } else if (LONG_TEXT.has(f)) {
            control = <Textarea {...common} rows={3} />;
          } else if (spec.type === 'number') {
            control = <Input {...common} type="number" inputMode="decimal" step="any" min={spec.min} max={spec.max} />;
          } else if (spec.type === 'date') {
            control = <Input {...common} type="date" />;
          } else {
            control = <Input {...common} type={f === 'phone' ? 'tel' : 'text'} list={f === 'village' ? 'villages' : undefined} autoComplete="off" />;
          }
          return (
            <Field key={f} label={`${spec.label}${spec.required ? ' *' : ''}`} clinical={isClinical(entity, f)} className={cx(full && 'sm:col-span-2')}>
              {control}
            </Field>
          );
        })}
        <datalist id="villages">{villages.map((v) => <option key={v} value={v} />)}</datalist>
        {extra && <div className="sm:col-span-2">{extra}</div>}
      </form>
    </Drawer>
  );
}

export const PATIENT_FIELDS = ['name', 'age', 'sex', 'phone', 'village', 'household', 'bloodGroup', 'allergies', 'chronicConditions', 'notes'];
export const PREGNANCY_FIELDS = ['lmp', 'edd', 'gravida', 'parity', 'riskLevel', 'bpSystolic', 'bpDiastolic', 'hemoglobin', 'weightKg', 'dangerSigns', 'nextVisitDate', 'status'];
export const VISIT_FIELDS = ['type', 'date', 'bpSystolic', 'bpDiastolic', 'weightKg', 'temperatureC', 'hemoglobin', 'findings', 'referredTo', 'followUpDate'];
