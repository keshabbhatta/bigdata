import { useCallback, useEffect, useState } from 'react';
import { Server, Database, Radio, Crown, HardDrive, ShieldAlert, UserPlus } from 'lucide-react';
import { api } from '../services/api.js';
import { useAuth, ROLE_NAMES } from '../context/AuthContext.jsx';
import { usePatients } from '../hooks/useRecords.js';
import { useSync } from '../context/SyncContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Badge, Button, Drawer, Empty, Field, Input, PageHead, Panel, PanelHead, Segmented, Select, Table, cx } from '../components/ui.jsx';
import { bytes, formatDateTime, relativeTime, wardName } from '../utils/format.js';
import { passwordChecks } from '../../../shared/accounts.js';

import { ScopeEditor } from '../components/AreaPicker.jsx';
import { inScope, NATION } from '../../../shared/areas.js';

/** Admin edits any account: details, role, wards, patient link, on/off, password. */
function ManageUser({ account: u, me, onClose, onSaved }) {
  const patients = usePatients() || [];
  const toast = useToast();
  const [f, setF] = useState({
    fullName: u.full_name, email: u.email || '', role: u.role, wards: u.wards || [], patientId: u.patient_id || '', active: u.active,
  });
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const self = u.id === me.id;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    setError('');
    setBusy(true);
    try {
      const changes = { fullName: f.fullName, email: f.email, role: f.role, active: f.active };
      if (f.role === 'patient') changes.patientId = f.patientId;
      else changes.wards = f.wards;
      await api.updateUser(u.id, changes);
      if (pw) await api.resetPassword(u.id, pw);
      toast(`${f.fullName} saved.`);
      onSaved();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer title={`Manage ${u.full_name}`} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</Button></>}>
      <div className="flex flex-col gap-3.5">
        {error && <div role="alert" className="rounded-md bg-lali-wash px-3.5 py-2.5 text-sm text-lali-deep">{error}</div>}
        <p className="text-[13px] text-ink-soft">
          Username <b className="text-ink">{u.username}</b>, created {formatDateTime(u.created_at)}
          {u.auth_provider === 'google' ? ', signs in with Google' : ''}.
        </p>
        <Field label="Account status" note={self ? 'You cannot switch off your own account.' : 'A switched-off account is signed out within seconds. Its records stay.'}>
          <Segmented label="Account status" value={f.active ? 'on' : 'off'} onChange={(v) => !self && setF({ ...f, active: v === 'on' })}
            options={[{ value: 'on', label: 'Active' }, { value: 'off', label: 'Switched off' }]} />
        </Field>
        <Field label="Full name"><Input value={f.fullName} onChange={set('fullName')} /></Field>
        <Field label="Email" note="The person can sign in with this email. Google sign-in matches it too.">
          <Input type="email" value={f.email} onChange={set('email')} autoCapitalize="none" />
        </Field>
        <Field label="Role">
          <Select value={f.role} onChange={set('role')} disabled={self}>
            <option value="worker">Health volunteer</option><option value="supervisor">Doctor / supervisor</option>
            <option value="admin">Administrator</option><option value="patient">Patient</option>
          </Select>
        </Field>
        {f.role === 'patient' ? (
          <Field label="Patient record" note="The patient sees only this record, read-only.">
            <Select value={f.patientId} onChange={set('patientId')}>
              <option value="">Choose a patient…</option>
              {patients.map((p) => <option key={p.id} value={p.id}>{p.data.name}, {p.data.village} ({wardName(p.ward)})</option>)}
            </Select>
          </Field>
        ) : (
          <ScopeEditor label="Areas this person covers" value={f.wards} onChange={(wards) => setF({ ...f, wards })}
            note={f.role === 'worker'
              ? 'A health volunteer only sees and changes records in these areas, usually one ward.'
              : 'Can be All of Nepal, a province, district, municipality or ward.'} />
        )}
        <Field label="Set a new password (optional)" note="Leave empty to keep the current password.">
          <Input value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
        </Field>
        {pw && (
          <ul className="-mt-2 grid grid-cols-1 gap-x-3 text-[13px] sm:grid-cols-2">
            {passwordChecks(pw).map((c) => <li key={c.label} className={c.ok ? 'text-pine' : 'text-ink-soft'}>{c.ok ? '✓' : '○'} {c.label}</li>)}
          </ul>
        )}
      </div>
    </Drawer>
  );
}

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
  const [form, setForm] = useState({ username: '', password: '', fullName: '', email: '', role: 'worker', wards: [], patientId: '' });
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
        <Field label="Temporary password" note="At least 8 characters with an uppercase letter, a lowercase letter, a number and a symbol.">
          <Input value={form.password} onChange={set('password')} />
        </Field>
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
        {form.role !== 'patient' && (
          <ScopeEditor label="Areas this person covers" value={form.wards} onChange={(wards) => setForm({ ...form, wards })}
            note={form.role === 'worker'
              ? 'Health volunteers only see records from these areas, usually one ward.'
              : 'Leave empty for All of Nepal, or add a province, district or municipality.'} />
        )}
      </div>
    </Drawer>
  );
}

// Accounts created from the sign-up page that still need a decision.
function PendingAccounts({ users, isAdmin, onChanged }) {
  const patients = usePatients() || [];
  const toast = useToast();
  const [links, setLinks] = useState({});
  const pending = users.filter((u) => u.approved === false);
  if (!pending.length) return null;
  const act = async (fn, msg) => {
    try { await fn(); toast(msg); onChanged(); } catch (e) { toast(e.message, 'bad'); }
  };
  return (
    <Panel className="mb-5">
      <PanelHead title="New accounts waiting for approval" icon={UserPlus} hint={`${pending.length} waiting`} />
      <ul>
        {pending.map((u) => {
          const canDecide = u.role !== 'supervisor' || isAdmin;
          return (
            <li key={u.id} className="flex flex-wrap items-center gap-3 border-t border-line-soft px-5 py-3.5 first:border-t-0">
              <div className="min-w-[220px] flex-1">
                <div className="font-semibold">{u.full_name} <Badge tone="marigold" className="ml-1">{ROLE_NAMES[u.role]}</Badge></div>
                <div className="text-[13px] text-ink-soft">
                  {u.email}{u.auth_provider === 'google' ? ' (Google)' : ''}, {u.wards.map(wardName).join('; ') || 'no area'}, signed up {relativeTime(u.created_at)}
                </div>
              </div>
              {u.role === 'patient' && (
                <Select className="w-auto min-w-[230px]" aria-label={`Patient record for ${u.full_name}`} value={links[u.id] || ''}
                  onChange={(e) => setLinks({ ...links, [u.id]: e.target.value })}>
                  <option value="">Link to patient record…</option>
                  {patients.filter((p) => inScope(p.ward, u.wards)).map((p) => (
                    <option key={p.id} value={p.id}>{p.data.name}, {p.data.village}</option>
                  ))}
                </Select>
              )}
              {canDecide ? (
                <>
                  <Button size="sm" disabled={u.role === 'patient' && !links[u.id]}
                    onClick={() => act(() => api.approveUser(u.id, links[u.id]), `${u.full_name} can now sign in.`)}>Approve</Button>
                  <Button size="sm" variant="ghost"
                    onClick={() => window.confirm(`Reject and delete the sign-up of ${u.full_name}?`) && act(() => api.rejectUser(u.id), 'Sign-up rejected.')}>Reject</Button>
                </>
              ) : <span className="text-[13px] text-ink-soft">An administrator approves doctor accounts.</span>}
            </li>
          );
        })}
      </ul>
    </Panel>
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
  const [managing, setManaging] = useState(null);
  const [userQuery, setUserQuery] = useState('');
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

      <PendingAccounts users={o.users} isAdmin={isAdmin} onChanged={load} />

      <Panel className="mb-5">
        <PanelHead title="Users" hint={`${o.users.length} accounts, ${o.users.filter((u) => u.active && u.approved !== false).length} active`}>
          <Input className="ml-2 h-8 w-full max-w-[240px] text-sm sm:ml-auto" placeholder="Search name, email, role" value={userQuery}
            onChange={(e) => setUserQuery(e.target.value)} aria-label="Search users" />
          {isAdmin && <Button size="sm" variant="ghost" onClick={() => setAdding(true)}><UserPlus size={14} /> Add user</Button>}
        </PanelHead>
        <Table head={['Name', 'Role', { label: 'Wards', hideSm: true }, 'Status', { label: 'Created', hideSm: true }, ...(isAdmin ? [''] : [])]}>
          {o.users
            .filter((u) => !userQuery.trim() || [u.full_name, u.username, u.email, ROLE_NAMES[u.role]].some((x) => (x || '').toLowerCase().includes(userQuery.trim().toLowerCase())))
            .map((u) => (
              <tr key={u.id} className={cx(!u.active && 'opacity-60')}>
                <td>
                  <div className="font-semibold">{u.full_name}{u.id === user.id && <span className="ml-1.5 text-[13px] font-normal text-ink-soft">(you)</span>}</div>
                  <div className="text-[13px] text-ink-soft">{u.email || u.username}{u.auth_provider === 'google' ? ' · Google' : ''}</div>
                </td>
                <td>{ROLE_NAMES[u.role] || u.role}</td>
                <td className="hidden max-w-[260px] text-[13px] md:table-cell">{u.wards.map(wardName).join('; ')}</td>
                <td>
                  {!u.active ? <Badge tone="lali">Switched off</Badge>
                    : u.approved === false ? <Badge tone="marigold">Waiting</Badge>
                      : <Badge tone="pine">Active</Badge>}
                </td>
                <td className="hidden whitespace-nowrap text-[13px] text-ink-soft md:table-cell">{relativeTime(u.created_at)}</td>
                {isAdmin && <td className="text-right"><Button size="sm" variant="ghost" onClick={() => setManaging(u)}>Manage</Button></td>}
              </tr>
            ))}
        </Table>
      </Panel>

      <div className="grid gap-5">
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
      {managing && <ManageUser account={managing} me={user} onClose={() => setManaging(null)} onSaved={load} />}
      {sync.isOffline && <p className="mt-4 text-sm text-marigold-deep">You are offline. Figures shown are from the last refresh.</p>}
    </>
  );
}
