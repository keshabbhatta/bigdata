import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getMeta } from '../offline/indexedDB.js';
import { deviceId, clock } from '../offline/device.js';
import { PROFILES, setProfile } from '../offline/networkSim.js';
import { useSync } from '../context/SyncContext.jsx';
import { useOutbox, useSyncLog } from '../hooks/useRecords.js';
import { Badge, Button, Empty, PageHead, Panel, PanelHead, Segmented, Table, cx } from '../components/ui.jsx';
import { bytes, formatDateTime, relativeTime } from '../utils/format.js';

const OP_LABEL = { CREATE: 'New', UPDATE: 'Edit', DELETE: 'Delete' };
const ENTITY_LABEL = { patient: 'patient', pregnancy: 'pregnancy', visit: 'visit' };

export function SyncStatus() {
  const s = useSync();
  const outbox = useOutbox();
  const log = useSyncLog();
  const names = useLiveQuery(async () => {
    const recs = await db.records.toArray();
    const pat = new Map(recs.filter((r) => r.entity === 'patient').map((p) => [p.id, p.data.name]));
    return new Map(recs.map((r) => [r.id, r.entity === 'patient' ? r.data.name : pat.get(r.data.patientId)]));
  }, [], new Map());
  const [meta, setMetaState] = useState({});
  useEffect(() => {
    (async () => setMetaState({ lastSeq: await getMeta('lastSeq', 0), counter: await getMeta('counter', 0) }))();
  }, [s.lastSyncAt, s.pending]);

  const pending = outbox.filter((e) => e.status === 'PENDING').sort((a, b) => a.seq - b.seq);
  const rejected = outbox.filter((e) => e.status === 'REJECTED');
  const tone = s.state === 'syncing' ? 'syncing' : s.isOffline ? 'offline' : s.state === 'error' || s.state === 'auth' ? 'error' : 'synced';
  const headline = { syncing: 'Syncing now', offline: 'Working offline', error: 'Sync needs attention', synced: s.pending ? 'Waiting to sync' : 'Up to date' }[tone];

  return (
    <>
      <PageHead title="Sync status" subtitle="Changes are saved on this phone first, then sent to the server when there is a connection. Nothing is marked as sent until the server confirms it." />

      <div className={cx(
        'relative mb-5 grid items-center gap-3 overflow-hidden rounded-2xl px-7 py-6.5 text-white md:grid-cols-[auto_1fr_auto] md:gap-6',
        tone === 'synced' && 'bg-pine', tone === 'offline' && 'bg-marigold-deep', tone === 'error' && 'bg-lali-deep',
        tone === 'syncing' && 'stripes animate-flow',
      )}>
        <div className="font-condensed text-[64px] leading-[.9] font-semibold">{s.pending}</div>
        <div>
          <div className="text-[22px] font-semibold">{headline}</div>
          <div className="mt-1 opacity-85">
            {s.state === 'syncing' ? s.progress
              : `${s.pending} change${s.pending === 1 ? '' : 's'} waiting. Last successful sync ${relativeTime(s.lastSyncAt)}.`}
            {s.lastError && tone === 'error' ? ` ${s.lastError}` : ''}
          </div>
        </div>
        <Button variant="light" onClick={s.syncNow} disabled={s.state === 'syncing' || s.isOffline}>
          <RefreshCw size={16} className={s.state === 'syncing' ? 'animate-spin' : ''} /> Sync now
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <Panel>
          <PanelHead title="Network simulator" hint="For demonstrations and experiments" />
          <div className="px-5 py-4.5">
            <Segmented label="Network" value={s.network} onChange={setProfile}
              options={Object.entries(PROFILES).map(([value, p]) => ({ value, label: p.label }))} />
            <p className="mt-3 text-sm text-ink-soft">
              {s.network === 'real' && 'Using the real connection of this device.'}
              {s.network === 'offline' && 'The app behaves exactly as with no signal. Keep working; edits queue up on this phone.'}
              {s.network === '2g' && 'Adds 650 ms delay and limits speed to 40 kbit/s, like a weak 2G signal. Batches are gzip-compressed.'}
              {s.network === '3g' && 'Adds 250 ms delay and limits speed to 400 kbit/s.'}
              {s.network === 'flaky' && 'One in three requests drops mid-way. Retries are safe because the server ignores duplicate events.'}
            </p>
          </div>
        </Panel>

        <Panel>
          <PanelHead title="This device" />
          <dl className="grid grid-cols-[130px_1fr] gap-x-4 gap-y-2 px-5 py-4.5 text-sm">
            <dt className="text-ink-soft">Device ID</dt><dd className="font-medium">{deviceId}</dd>
            <dt className="text-ink-soft">Events created</dt><dd className="font-medium">{meta.counter}</dd>
            <dt className="text-ink-soft">Pulled up to</dt><dd className="font-medium">Change #{meta.lastSeq}</dd>
            <dt className="text-ink-soft">Logical clock</dt><dd className="font-medium break-all">{clock.current().split(':').slice(0, 2).join(':')}</dd>
          </dl>
        </Panel>
      </div>

      <Panel className="mt-5">
        <PanelHead title="Waiting to sync" hint={`${pending.length} in the queue, oldest first`} />
        {pending.length === 0 ? (
          <Empty title="The queue is empty">Every change on this phone has been confirmed by the server.</Empty>
        ) : (
          <Table head={['Change', 'Patient', { label: 'Fields', hideSm: true }, 'Saved', { label: 'Attempts', hideSm: true }]}>
            {pending.map((e) => (
              <tr key={e.seq}>
                <td><Badge tone={e.op === 'CREATE' ? 'pine' : 'sky'}>{OP_LABEL[e.op]} {ENTITY_LABEL[e.entity]}</Badge></td>
                <td className="font-semibold">{names.get(e.recordId) || names.get(e.changes.patientId) || '–'}</td>
                <td className="hidden max-w-[320px] truncate text-ink-soft md:table-cell">{Object.keys(e.changes).join(', ')}</td>
                <td className="text-ink-soft">{relativeTime(e.createdAt)}</td>
                <td className="hidden md:table-cell">{e.attempts || 0}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      {rejected.length > 0 && (
        <Panel className="mt-5">
          <PanelHead title="Not accepted by the server" hint="These changes were undone on this phone" />
          <Table head={['Change', 'Reason', 'When']}>
            {rejected.map((e) => (
              <tr key={e.seq}>
                <td><Badge tone="lali">{OP_LABEL[e.op]} {ENTITY_LABEL[e.entity]}</Badge></td>
                <td className="text-lali-deep">{e.reason}</td>
                <td className="text-ink-soft">{formatDateTime(e.syncedAt)}</td>
              </tr>
            ))}
          </Table>
        </Panel>
      )}

      <Panel className="mt-5">
        <PanelHead title="Sync history" hint="Bytes sent are after gzip compression" />
        {log.length === 0 ? <Empty title="No sync attempts yet" /> : (
          <Table head={['Time', 'Result', 'Sent', 'Received', { label: 'Data sent', hideSm: true }, { label: 'Duration', hideSm: true }]}>
            {log.map((l) => {
              const saving = l.rawBytes ? Math.round((1 - l.sentBytes / l.rawBytes) * 100) : 0;
              return (
                <tr key={l.id}>
                  <td className="whitespace-nowrap text-ink-soft">{formatDateTime(l.at)}</td>
                  <td>
                    {l.ok ? <Badge tone="pine">Synced</Badge> : <Badge tone={l.error?.includes('reach') || l.error?.includes('dropped') ? 'marigold' : 'lali'}>{l.error?.includes('reach') || l.error?.includes('dropped') ? 'No connection' : 'Failed'}</Badge>}
                    {l.conflicts > 0 && <Badge tone="lali" className="ml-1.5">{l.conflicts} conflict{l.conflicts > 1 ? 's' : ''}</Badge>}
                    {l.duplicates > 0 && <Badge tone="neutral" className="ml-1.5">{l.duplicates} retried</Badge>}
                  </td>
                  <td>{l.pushed}</td>
                  <td>{l.pulled}</td>
                  <td className="hidden whitespace-nowrap md:table-cell">
                    {l.rawBytes ? <>{bytes(l.sentBytes)} <span className="text-ink-soft">of {bytes(l.rawBytes)}{saving > 0 ? `, ${saving}% smaller` : ''}</span></> : '–'}
                  </td>
                  <td className="hidden md:table-cell">{l.durationMs != null ? `${(l.durationMs / 1000).toFixed(2)} s` : '–'}</td>
                </tr>
              );
            })}
          </Table>
        )}
      </Panel>
    </>
  );
}
