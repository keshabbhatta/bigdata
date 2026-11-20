import { useCallback, useEffect, useState } from 'react';
import { Server, Database, Radio, Crown, HardDrive, ShieldAlert, UserPlus } from 'lucide-react';
import { api } from '../services/api.js';
import { useAuth, ROLE_NAMES } from '../context/AuthContext.jsx';
import { usePatients } from '../hooks/useRecords.js';
import { useSync } from '../context/SyncContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Badge, Button, Drawer, Empty, Field, Input, PageHead, Panel, PanelHead, Segmented, Select, Table, cx } from '../components/ui.jsx';
import { bytes, formatDateTime, relativeTime, wardName } from '../utils/format.js';

function Tile({ icon: Icon, name, state, children, action }) {
  const tone = { up: 'text-pine', down: 'text-lali', off: 'text-ink-soft' }[state.tone];
  return (
    <div className="flex flex-col gap-2 rounded-[10px] border border-line bg-white px-4.5 py-4">
      <div className="flex items-center gap-2 font-semibold"><Icon size={17} /> {name}</div>
      <div className={cx('flex items-center gap-1.5 text-[13px] font-semibold', tone)}>
        <span className="size-2 rounded-full bg-current" /> {state.text}
      </div>
      <div className="text-[13px] text-ink-soft">{children}</div>
      {action}
    </div>
  );
}

function AddUser({ onClose, onAdded }) {
  const [form, setForm] = useState({ username: '', password: '', fullName: '', email: '', role: 'worker', wards: ['ward-1'], patientId: '' });
  const patients = usePatients() || [];
  const [error, setError] = useState('');
  const save = async () => {
    try {
      await api.addUser(form);
      onAdded();
      onClose();
    } catch (e) { setError(e.message); }
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <Drawer title="Add user" onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save}>Add user</Button></>}>
      <div className="flex flex-col gap-3.5">
        {error && <div className="rounded-md bg-lali-wash px-3.5 py-2.5 text-sm text-lali-deep">{error}</div>}
        <Field label="Full name"><Input value={form.fullName} onChange={set('fullName')} /></Field>
        <Field label="Username"><Input value={form.username} onChange={set('username')} autoCapitalize="none" /></Field>
        <Field label="Temporary password"><Input value={form.password} onChange={set('password')} /></Field>
        <Field label="Google email (optional)" note="Lets this person use Continue with Google once Google sign-in is set up.">
          <Input type="email" value={form.email} onChange={set('email')} />
        </Field>
        <Field label="Role">
          <Select value={form.role} onChange={set('role')}>
            <option value="worker">Health volunteer</option><option value="supervisor">Doctor / supervisor</option>
            <option value="admin">Administrator</option><option value="patient">Patient</option>
          </Select>
        </Field>
        {form.role === 'patient' && (
          <Field label="Patient record" note="The patient will only see this record, read-only.">
            <Select value={form.patientId} onChange={(e) => {
              const p = patients.find((x) => x.id === e.target.value);
              setForm({ ...form, patientId: e.target.value, wards: p ? [p.ward] : form.wards, fullName: form.fullName || p?.data.name || '' });
            }}>
              <option value="">Choose a patient…</option>
              {patients.map((p) => <option key={p.id} value={p.id}>{p.data.name}, {p.data.village}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Wards" note="Health volunteers only see records from their wards.">
          <div className="flex flex-wrap gap-3">
            {['ward-1', 'ward-2', 'ward-3'].map((w) => (
              <label key={w} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.wards.includes(w)}
                  onChange={(e) => setForm({ ...form, wards: e.target.checked ? [...form.wards, w] : form.wards.filter((x) => x !== w) })} />
                {wardName(w)}
              </label>
            ))}
          </div>
        </Field>
      </div>
    </Drawer>
  );
}

export function Admin() {
  const { user } = useAuth();
  const sync = useSync();
  const toast = useToast();
  const [o, setO] = useState(null);
  const [audit, setAudit] = useState([]);
  const [backups, setBackups] = useState([]);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const isAdmin = user.role === 'admin';

  const load = useCallback(async () => {
    try {
      const [ov, au, bk] = await Promise.all([api.adminOverview(), api.audit(), api.backups()]);
      setO(ov); setAudit(au.entries); setBackups(bk.backups); setError('');
    } catch (e) { setError(e.offline ? 'The admin dashboard needs a connection.' : e.message); }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);

  const act = async (fn, okMsg) => {
    try { const r = await fn(); toast(typeof okMsg === 'function' ? okMsg(r) : okMsg); load(); } catch (e) { toast(e.message, 'bad'); }
  };

  if (!o) return (<><PageHead title="Admin" /><Panel><Empty title={error || 'Loading system status…'} /></Panel></>);

  const db = o.database;
  const lag = db.replicaLagSeconds;
  return (
    <>
      <PageHead title="System administration" subtitle={`Distributed system health, as seen by API instance ${o.instanceId}. Refreshes every 5 seconds.`} />

      <div className="mb-5 grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4">
        <Tile icon={Crown} name="Coordination (etcd)"
          state={o.coordination.mode === 'standalone' ? { tone: 'off', text: 'Single instance (no etcd)' } : o.coordination.connected ? { tone: 'up', text: 'Raft cluster reachable' } : { tone: 'down', text: 'etcd unreachable' }}>
          Leader: <b className="text-ink">{o.coordination.leaderId || '–'}</b>{o.coordination.isLeader ? ' (this instance)' : ''}.
          The leader publishes the outbox and watches the database.
        </Tile>
        <Tile icon={Database} name="PostgreSQL"
          state={db.primaryOk === false && db.leader === 'primary' ? { tone: 'down', text: 'Primary not responding' } : { tone: 'up', text: `Writes go to the ${db.leader}` }}
          action={isAdmin && db.replicaConfigured && db.leader === 'primary' && (
            <Button size="sm" variant="danger" onClick={() => window.confirm('Promote the replica to be the new primary? Use this only when the primary has failed.') && act(api.failover, 'Replica promoted. All instances now write to it.')}>
              <ShieldAlert size={14} /> Promote replica
            </Button>
          )}>
          {db.replicaConfigured
            ? <>Replica {db.replicaOk ? 'online' : 'offline'}{lag != null ? `, ${lag < 1 ? 'under 1 second' : `${lag.toFixed(1)} s`} behind` : ''}. Failover epoch {db.epoch}. Automatic failover {db.autoFailover ? 'on' : 'off'}.</>
            : 'No replica configured.'}
        </Tile>
        <Tile icon={Radio} name="Kafka"
          state={!o.kafka.enabled ? { tone: 'off', text: 'Not configured' } : o.kafka.connected ? { tone: 'up', text: 'Producer connected' } : { tone: 'down', text: 'Broker unreachable' }}
          action={isAdmin && o.kafka.enabled && <Button size="sm" variant="ghost" onClick={() => act(api.flushOutbox, (r) => `Published ${r.published} events.`)}>Publish outbox now</Button>}>
          {o.outbox.pending} events waiting in the outbox, {o.outbox.published} published.
          {o.kafka.lastError ? ` Last error: ${o.kafka.lastError}` : ''}
        </Tile>
        <Tile icon={HardDrive} name={o.storage.backend === 'minio' ? 'MinIO object storage' : 'File storage (local disk)'}
          state={o.storage.ready ? { tone: 'up', text: 'Ready' } : { tone: 'down', text: 'Unavailable' }}
          action={isAdmin && <Button size="sm" variant="ghost" onClick={() => act(api.backup, (r) => `Backup saved: ${r.records} records, ${bytes(r.compressedBytes)} compressed.`)}>Back up now</Button>}>
          {backups.length} backup{backups.length === 1 ? '' : 's'}{backups[0] ? `, latest ${relativeTime(backups[0].lastModified)}` : ''}. Old backups expire after 30 days.
        </Tile>
        <Tile icon={Server} name="Sync engine" state={{ tone: 'up', text: `${o.events.total} events received` }}>
          {o.events.last_hour} in the last hour, {o.events.conflicts} with conflicts, {o.events.rejected} rejected.
        </Tile>
      </div>

      <Panel className="mb-5">
        <PanelHead title="Conflict handling mode" hint="Used for the comparison experiment" />
        <div className="flex flex-wrap items-center gap-4 px-5 py-4.5">
          <Segmented label="Sync mode" value={o.syncMode} onChange={(m) => isAdmin && act(() => api.setSyncMode(m), `Sync mode set to ${m === 'safe' ? 'safe merge' : 'naive overwrite'}.`)}
            options={[{ value: 'safe', label: 'Safe merge (default)' }, { value: 'naive', label: 'Naive overwrite' }]} />
          <p className="max-w-[60ch] text-sm text-ink-soft">
            {o.syncMode === 'safe'
              ? 'Concurrent clinical readings are kept side by side for review. Other fields converge with last-writer-wins on hybrid logical clocks.'
              : 'Baseline only: whichever phone syncs last overwrites the others, the way simple offline caching works. Readings can be lost. Switch back after the experiment.'}
          </p>
          {o.syncMode === 'naive' && <Badge tone="lali">Data loss possible</Badge>}
        </div>
      </Panel>

      <Panel className="mb-5">
        <PanelHead title="Devices" hint="Phones and browsers that have synced" />
        {o.devices.length === 0 ? <Empty title="No devices yet" /> : (
          <Table head={['Device', 'Health worker', 'Last seen', { label: 'Events sent', hideSm: true }, 'Waiting on phone', { label: 'Pulled up to', hideSm: true }]}>
            {o.devices.filter((d) => d.device_id !== 'seed-device').map((d) => (
              <tr key={d.device_id}>
                <td className="font-medium">{d.device_id}</td>
                <td>{d.full_name || '–'}</td>
                <td className="whitespace-nowrap text-ink-soft">{relativeTime(d.last_seen)}</td>
                <td className="hidden md:table-cell">{d.events_pushed}</td>
                <td>{d.pending_reported ? <Badge tone="marigold">{d.pending_reported}</Badge> : '0'}</td>
                <td className="hidden md:table-cell">#{d.last_pull_seq}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel>
          <PanelHead title="Users">
            {isAdmin && <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setAdding(true)}><UserPlus size={14} /> Add user</Button>}
          </PanelHead>
          <Table head={['Name', 'Role', 'Wards']}>
            {o.users.map((u) => (
              <tr key={u.id}>
                <td><div className="font-semibold">{u.full_name}</div><div className="text-[13px] text-ink-soft">{u.username}</div></td>
                <td>{ROLE_NAMES[u.role] || u.role}</td>
                <td className="text-[13px]">{u.wards.map((w) => w.replace('ward-', 'Ward ')).join(', ')}</td>
              </tr>
            ))}
          </Table>
        </Panel>
        <Panel>
          <PanelHead title="Audit log" hint="Sign-ins, resolutions, failovers" />
          <ul className="max-h-[420px] overflow-y-auto">
            {audit.map((a) => (
              <li key={a.id} className="border-t border-line-soft px-5 py-2.5 text-sm first:border-t-0">
                <span className="font-semibold">{a.action}</span> <span className="text-ink-soft">by {a.username || 'system'}</span>
                <div className="text-[13px] text-ink-soft">{formatDateTime(a.at)}{a.target ? `, ${a.target}` : ''}</div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {adding && <AddUser onClose={() => setAdding(false)} onAdded={() => { toast('User added.'); load(); }} />}
      {sync.isOffline && <p className="mt-4 text-sm text-marigold-deep">You are offline. Figures shown are from the last refresh.</p>}
    </>
  );
}
