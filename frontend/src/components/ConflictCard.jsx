// Shows every concurrent value of one clinical field side by side, with who
// recorded it, when and on which phone. A supervisor picks the correct value
// (or enters a re-measured one). Until then nothing is overwritten.
import { useState } from 'react';
import { GitMerge } from 'lucide-react';
import { api } from '../services/api.js';
import { useAuth, isStaff } from '../context/AuthContext.jsx';
import { useSync } from '../context/SyncContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { ENTITIES } from '../../../shared/schema.js';
import { Badge, Button, Field, Input, cx } from './ui.jsx';
import { FIELD_LABELS, UNITS, formatDateTime } from '../utils/format.js';
import { hlcToDate } from '../../../shared/hlc.js';
import { t, tMsg } from '../i18n/index.jsx';

export function ConflictCard({ conflict, showPatient = true }) {
  const { user } = useAuth();
  const sync = useSync();
  const toast = useToast();
  const [chosen, setChosen] = useState(null);
  const [custom, setCustom] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const spec = ENTITIES[conflict.entity]?.fields[conflict.field];
  const label = t(FIELD_LABELS[conflict.field] || spec?.label || conflict.field);
  const unit = UNITS[conflict.field] || '';
  const canResolve = isStaff(user) && conflict.status === 'open';

  const resolve = async () => {
    let value = custom !== '' ? custom : chosen;
    if (value === null || value === undefined) return;
    if (spec?.type === 'number') value = Number(value);
    setBusy(true);
    try {
      await api.resolveConflict(conflict.id, value, note);
      toast(t('Conflict resolved. Every phone will receive the decision on its next sync.'));
      sync.syncNow();
    } catch (e) {
      toast(e.offline ? t('Connect to the internet to resolve conflicts.') : tMsg(e.message), 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-[10px] border border-[#f2c4ce] bg-white">
      <div className="flex flex-wrap items-center gap-3 bg-lali-wash px-4.5 py-3">
        <GitMerge size={18} className="text-lali-deep" />
        <span className="font-semibold text-lali-deep">
          {showPatient && conflict.patient ? t('{field} for {name}', { field: label, name: conflict.patient.data.name }) : label}
        </span>
        <span className="ml-auto text-[13px] text-lali-deep">
          {conflict.status === 'open' ? t('{n} different readings recorded while offline', { n: conflict.observations.length }) : t('Resolved')}
        </span>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3 px-4.5 py-4">
        {conflict.observations.map((o, i) => {
          const when = o.at || (o.hlc ? hlcToDate(o.hlc).toISOString() : null);
          const isChosen = chosen !== null && chosen === o.value && custom === '';
          return (
            <div key={`${o.value}-${i}`} className={cx('flex flex-col gap-1.5 rounded-md border p-3.5', isChosen ? 'border-pine ring-2 ring-pine-wash' : 'border-line')}>
              <div className="font-condensed text-[30px] leading-tight font-semibold">
                {String(o.value ?? '–')}<small className="ml-1 font-sans text-[13px] font-medium text-ink-soft">{unit}</small>
              </div>
              <div className="text-[13px] text-ink-soft">
                {t('Recorded by')} <b className="text-ink">{o.userName || t('Unknown')}</b><br />
                {formatDateTime(when)}, {o.deviceId === 'server' ? t('on the server') : t('on phone {id}', { id: o.deviceId?.replace('dev-', '') || '?' })}
              </div>
              {canResolve && (
                <Button size="sm" variant={isChosen ? 'primary' : 'ghost'} className="mt-1.5 self-start"
                  onClick={() => { setChosen(o.value); setCustom(''); }}>
                  {isChosen ? t('Selected') : t('Keep this reading')}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {conflict.status === 'resolved' && conflict.resolution && (
        <div className="px-4.5 pb-4 text-sm">
          <Badge tone="pine">{t('Kept {value}', { value: `${String(conflict.resolution.value)} ${unit}`.trim() })}</Badge>
          <span className="ml-2 text-ink-soft">{t('by {name}', { name: conflict.resolution.by })}, {formatDateTime(conflict.resolution.at)}{conflict.resolution.note ? `. ${conflict.resolution.note}` : ''}</span>
        </div>
      )}

      {canResolve && (
        <div className="flex flex-wrap items-end gap-2.5 px-4.5 pb-4">
          <Field label={t('Or enter a new measurement')} className="min-w-[160px] flex-1">
            <Input type={spec?.type === 'number' ? 'number' : 'text'} step="any" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={unit} />
          </Field>
          <Field label={t('Note for the record')} className="min-w-[200px] flex-[2]">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('For example: rechecked at the health post')} />
          </Field>
          <Button onClick={resolve} disabled={busy || (chosen === null && custom === '')}>
            {busy ? t('Saving…') : t('Resolve conflict')}
          </Button>
        </div>
      )}
      {!isStaff(user) && conflict.status === 'open' && (
        <p className="px-4.5 pb-4 text-[13px] text-ink-soft">{t('A supervisor will review these readings. Both are kept until then.')}</p>
      )}
    </div>
  );
}
