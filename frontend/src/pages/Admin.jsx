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
import { t, tMsg, num } from '../i18n/index.jsx';

const AUDIT = {
  'auth.login': 'Signed in', 'auth.login_failed': 'Sign-in failed', 'auth.login_google': 'Signed in with Google',
  'auth.google_unknown': 'Google sign-in with unknown email', 'auth.register': 'New account created',
  'auth.register_google': 'New account created with Google', 'user.create': 'User added', 'user.update': 'User changed',
  'user.approve': 'Account approved', 'user.reject': 'Sign-up rejected', 'user.password_reset': 'Password reset',
  'conflict.resolve': 'Conflict resolved', 'sync.mode': 'Sync mode changed', 'backup.create': 'Backup created',
  'db.failover': 'Database failover', 'attachment.upload': 'Document uploaded',
};

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
      toast(t('{name} saved.', { name: f.fullName }));
      onSaved();
      onClose();
    } catch (e) {
      setError(tMsg(e.message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer title={t('Manage {name}', { name: u.full_name })} onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>{t('Cancel')}</Button><Button onClick={save} disabled={busy}>{busy ? t('Saving…') : t('Save changes')}</Button></>}>
      <div className="flex flex-col gap-3.5">
        {error && <div role="alert" className="rounded-md bg-lali-wash px-3.5 py-2.5 text-sm text-lali-deep">{error}</div>}
        <p className="text-[13px] text-ink-soft">
          {t('Username')} <b className="text-ink">{u.username}</b>, {t('created {date}', { date: formatDateTime(u.created_at) })}
          {u.auth_provider === 'google' ? `, ${t('signs in with Google')}` : ''}.
        </p>
        <Field label={t('Account status')} note={self ? t('You cannot switch off your own account.') : t('A switched-off account is signed out within seconds. Its records stay.')}>
          <Segmented label={t('Account status')} value={f.active ? 'on' : 'off'} onChange={(v) => !self && setF({ ...f, active: v === 'on' })}
            options={[{ value: 'on', label: t('Active') }, { value: 'off', label: t('Switched off') }]} />
        </Field>
        <Field label={t('Full name')}><Input value={f.fullName} onChange={set('fullName')} /></Field>
        <Field label={t('Email')} note={t('The person can sign in with this email. Google sign-in matches it too.')}>
          <Input type="email" value={f.email} onChange={set('email')} autoCapitalize="none" />
        </Field>
        <Field label={t('Role')}>
          <Select value={f.role} onChange={set('role')} disabled={self}>
            <option value="worker">{t('Health volunteer')}</option><option value="supervisor">{t('Doctor / supervisor')}</option>
            <option value="admin">{t('Administrator')}</option><option value="patient">{t('Patient')}</option>
          </Select>
        </Field>
        {f.role === 'patient' ? (
          <Field label={t('Patient record')} note={t('The patient sees only this record, read-only.')}>
            <Select value={f.patientId} onChange={set('patientId')}>
              <option value="">{t('Choose a patient…')}</option>
              {patients.map((p) => <option key={p.id} value={p.id}>{p.data.name}, {p.data.village} ({wardName(p.ward)})</option>)}
            </Select>
          </Field>
        ) : (
          <ScopeEditor label={t('Areas this person covers')} value={f.wards} onChange={(wards) => setF({ ...f, wards })}
            note={f.role === 'worker'
              ? t('A health volunteer only sees and changes records in these areas, usually one ward.')
              : t('Can be All of Nepal, a province, district, municipality or ward.')} />
        )}
        <Field label={t('Set a new password (optional)')} note={t('Leave empty to keep the current password.')}>
          <Input value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
        </Field>
        {pw && (
          <ul className="-mt-2 grid grid-cols-1 gap-x-3 text-[13px] sm:grid-cols-2">
            {passwordChecks(pw).map((c) => <li key={c.label} className={c.ok ? 'text-pine' : 'text-ink-soft'}>{c.ok ? '✓' : '○'} {t(c.label)}</li>)}
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
    } catch (e) { setError(tMsg(e.message)); }
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <Drawer title={t('Add user')} onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>{t('Cancel')}</Button><Button onClick={save}>{t('Add user')}</Button></>}>
      <div className="flex flex-col gap-3.5">
        {error && <div className="rounded-md bg-lali-wash px-3.5 py-2.5 text-sm text-lali-deep">{error}</div>}
        <Field label={t('Full name')}><Input value={form.fullName} onChange={set('fullName')} /></Field>
        <Field label={t('Username')}><Input value={form.username} onChange={set('username')} autoCapitalize="none" /></Field>
        <Field label={t('Temporary password')} note={t('At least 8 characters with an uppercase letter, a lowercase letter, a number and a symbol.')}>
          <Input value={form.password} onChange={set('password')} />
        </Field>
        <Field label={t('Google email (optional)')} note={t('Lets this person use Continue with Google once Google sign-in is set up.')}>
          <Input type="email" value={form.email} onChange={set('email')} />
        </Field>
        <Field label={t('Role')}>
          <Select value={form.role} onChange={set('role')}>
            <option value="worker">{t('Health volunteer')}</option><option value="supervisor">{t('Doctor / supervisor')}</option>
            <option value="admin">{t('Administrator')}</option><option value="patient">{t('Patient')}</option>
          </Select>
        </Field>
        {form.role === 'patient' && (
          <Field label={t('Patient record')} note={t('The patient will only see this record, read-only.')}>
            <Select value={form.patientId} onChange={(e) => {
              const p = patients.find((x) => x.id === e.target.value);
              setForm({ ...form, patientId: e.target.value, wards: p ? [p.ward] : form.wards, fullName: form.fullName || p?.data.name || '' });
            }}>
              <option value="">{t('Choose a patient…')}</option>
              {patients.map((p) => <option key={p.id} value={p.id}>{p.data.name}, {p.data.village}</option>)}
            </Select>
          </Field>
        )}
        {form.role !== 'patient' && (
          <ScopeEditor label={t('Areas this person covers')} value={form.wards} onChange={(wards) => setForm({ ...form, wards })}
            note={form.role === 'worker'
              ? t('Health volunteers only see records from these areas, usually one ward.')
              : t('Leave empty for All of Nepal, or add a province, district or municipality.')} />
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
    try { await fn(); toast(msg); onChanged(); } catch (e) { toast(tMsg(e.message), 'bad'); }
  };
  return (
    <Panel className="mb-5">
      <PanelHead title={t('New accounts waiting for approval')} icon={UserPlus} hint={t('{n} waiting', { n: pending.length })} />
      <ul>
        {pending.map((u) => {
          const canDecide = u.role !== 'supervisor' || isAdmin;
          return (
            <li key={u.id} className="flex flex-wrap items-center gap-3 border-t border-line-soft px-5 py-3.5 first:border-t-0">
              <div className="min-w-[220px] flex-1">
                <div className="font-semibold">{u.full_name} <Badge tone="marigold" className="ml-1">{t(ROLE_NAMES[u.role])}</Badge></div>
                <div className="text-[13px] text-ink-soft">
                  {u.email}{u.auth_provider === 'google' ? ' (Google)' : ''}, {u.wards.map(wardName).join('; ') || t('no area')}, {t('signed up {time}', { time: relativeTime(u.created_at) })}
                </div>
              </div>
              {u.role === 'patient' && (
                <Select className="w-auto min-w-[230px]" aria-label={t('Patient record for {name}', { name: u.full_name })} value={links[u.id] || ''}
                  onChange={(e) => setLinks({ ...links, [u.id]: e.target.value })}>
                  <option value="">{t('Link to patient record…')}</option>
                  {patients.filter((p) => inScope(p.ward, u.wards)).map((p) => (
                    <option key={p.id} value={p.id}>{p.data.name}, {p.data.village}</option>
                  ))}
                </Select>
              )}
              {canDecide ? (
                <>
                  <Button size="sm" disabled={u.role === 'patient' && !links[u.id]}
                    onClick={() => act(() => api.approveUser(u.id, links[u.id]), t('{name} can now sign in.', { name: u.full_name }))}>{t('Approve')}</Button>
                  <Button size="sm" variant="ghost"
                    onClick={() => window.confirm(t('Reject and delete the sign-up of {name}?', { name: u.full_name })) && act(() => api.rejectUser(u.id), t('Sign-up rejected.'))}>{t('Reject')}</Button>
                </>
              ) : <span className="text-[13px] text-ink-soft">{t('An administrator approves doctor accounts.')}</span>}
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
    } catch (e) { setError(e.offline ? t('The admin dashboard needs a connection.') : tMsg(e.message)); }
  }, []);
  useEffect(() => { load(); const timer = setInterval(load, 5000); return () => clearInterval(timer); }, [load]);

  const act = async (fn, okMsg) => {
    try { const r = await fn(); toast(typeof okMsg === 'function' ? okMsg(r) : okMsg); load(); } catch (e) { toast(tMsg(e.message), 'bad'); }
  };

  if (!o) return (<><PageHead title={t('Admin')} /><Panel><Empty title={error || t('Loading system status…')} /></Panel></>);

  const db = o.database;
  const lag = db.replicaLagSeconds;
  return (
    <>
      <PageHead title={t('System administration')} subtitle={t('Distributed system health, as seen by API instance {id}. Refreshes every 5 seconds.', { id: o.instanceId })} />

      <div className="mb-5 grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4">
        <Tile icon={Crown} name={t('Coordination (etcd)')}
          state={o.coordination.mode === 'standalone' ? { tone: 'off', text: t('Single instance (no etcd)') } : o.coordination.connected ? { tone: 'up', text: t('Raft cluster reachable') } : { tone: 'down', text: t('etcd unreachable') }}>
          {t('Leader')}: <b className="text-ink">{o.coordination.leaderId || '–'}</b>{o.coordination.isLeader ? ` (${t('this instance')})` : ''}.
          {' '}{t('The leader publishes the outbox and watches the database.')}
        </Tile>
        <Tile icon={Database} name="PostgreSQL"
          state={db.primaryOk === false && db.leader === 'primary' ? { tone: 'down', text: t('Primary not responding') } : { tone: 'up', text: db.leader === 'replica' ? t('Writes go to the replica') : t('Writes go to the primary') }}
          action={isAdmin && db.replicaConfigured && db.leader === 'primary' && (
            <Button size="sm" variant="danger" onClick={() => window.confirm(t('Promote the replica to be the new primary? Use this only when the primary has failed.')) && act(api.failover, t('Replica promoted. All instances now write to it.'))}>
              <ShieldAlert size={14} /> {t('Promote replica')}
            </Button>
          )}>
          {db.replicaConfigured
            ? <>{db.replicaOk ? t('Replica online') : t('Replica offline')}{lag != null ? `, ${lag < 1 ? t('under 1 second behind') : t('{n} s behind', { n: lag.toFixed(1) })}` : ''}. {t('Failover epoch {n}.', { n: db.epoch })} {db.autoFailover ? t('Automatic failover on.') : t('Automatic failover off.')}</>
            : t('No replica configured.')}
        </Tile>
        <Tile icon={Radio} name="Kafka"
          state={!o.kafka.enabled ? { tone: 'off', text: t('Not configured') } : o.kafka.connected ? { tone: 'up', text: t('Producer connected') } : { tone: 'down', text: t('Broker unreachable') }}
          action={isAdmin && o.kafka.enabled && <Button size="sm" variant="ghost" onClick={() => act(api.flushOutbox, (r) => t('Published {n} events.', { n: r.published }))}>{t('Publish outbox now')}</Button>}>
          {t('{n} events waiting in the outbox, {m} published.', { n: o.outbox.pending, m: o.outbox.published })}
          {o.kafka.lastError ? ` ${t('Last error: {error}', { error: o.kafka.lastError })}` : ''}
        </Tile>
        <Tile icon={HardDrive} name={o.storage.backend === 'minio' ? t('MinIO object storage') : t('File storage (local disk)')}
          state={o.storage.ready ? { tone: 'up', text: t('Ready') } : { tone: 'down', text: t('Unavailable') }}
          action={isAdmin && <Button size="sm" variant="ghost" onClick={() => act(api.backup, (r) => t('Backup saved: {n} records, {size} compressed.', { n: r.records, size: bytes(r.compressedBytes) }))}>{t('Back up now')}</Button>}>
          {backups.length === 1 ? t('1 backup') : t('{n} backups', { n: backups.length })}{backups[0] ? `, ${t('latest {time}', { time: relativeTime(backups[0].lastModified) })}` : ''}. {t('Old backups expire after 30 days.')}
        </Tile>
        <Tile icon={Server} name={t('Sync engine')} state={{ tone: 'up', text: t('{n} events received', { n: o.events.total }) }}>
          {t('{a} in the last hour, {b} with conflicts, {c} rejected.', { a: o.events.last_hour, b: o.events.conflicts, c: o.events.rejected })}
        </Tile>
      </div>

      <Panel className="mb-5">
        <PanelHead title={t('Conflict handling mode')} hint={t('Used for the comparison experiment')} />
        <div className="flex flex-wrap items-center gap-4 px-5 py-4.5">
          <Segmented label={t('Sync mode')} value={o.syncMode} onChange={(m) => isAdmin && act(() => api.setSyncMode(m), m === 'safe' ? t('Sync mode set to safe merge.') : t('Sync mode set to naive overwrite.'))}
            options={[{ value: 'safe', label: t('Safe merge (default)') }, { value: 'naive', label: t('Naive overwrite') }]} />
          <p className="max-w-[60ch] text-sm text-ink-soft">
            {o.syncMode === 'safe'
              ? t('Concurrent clinical readings are kept side by side for review. Other fields converge with last-writer-wins on hybrid logical clocks.')
              : t('Baseline only: whichever phone syncs last overwrites the others, the way simple offline caching works. Readings can be lost. Switch back after the experiment.')}
          </p>
          {o.syncMode === 'naive' && <Badge tone="lali">{t('Data loss possible')}</Badge>}
        </div>
      </Panel>

      <Panel className="mb-5">
        <PanelHead title={t('Devices')} hint={t('Phones and browsers that have synced')} />
        {o.devices.length === 0 ? <Empty title={t('No devices yet')} /> : (
          <Table head={[t('Device'), t('Health worker'), t('Last seen'), { label: t('Events sent'), hideSm: true }, t('Waiting on phone'), { label: t('Pulled up to'), hideSm: true }]}>
            {o.devices.filter((d) => d.device_id !== 'seed-device').map((d) => (
              <tr key={d.device_id}>
                <td className="font-medium">{d.device_id}</td>
                <td>{d.full_name || '–'}</td>
                <td className="whitespace-nowrap text-ink-soft">{relativeTime(d.last_seen)}</td>
                <td className="hidden md:table-cell">{num(d.events_pushed)}</td>
                <td>{d.pending_reported ? <Badge tone="marigold">{num(d.pending_reported)}</Badge> : num(0)}</td>
                <td className="hidden md:table-cell">#{num(d.last_pull_seq)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <PendingAccounts users={o.users} isAdmin={isAdmin} onChanged={load} />

      <Panel className="mb-5">
        <PanelHead title={t('Users')} hint={t('{n} accounts, {m} active', { n: o.users.length, m: o.users.filter((u) => u.active && u.approved !== false).length })}>
          <Input className="ml-2 h-8 w-full max-w-[240px] text-sm sm:ml-auto" placeholder={t('Search name, email, role')} value={userQuery}
            onChange={(e) => setUserQuery(e.target.value)} aria-label={t('Search users')} />
          {isAdmin && <Button size="sm" variant="ghost" onClick={() => setAdding(true)}><UserPlus size={14} /> {t('Add user')}</Button>}
        </PanelHead>
        <Table head={[t('Name'), t('Role'), { label: t('Areas'), hideSm: true }, t('Status'), { label: t('Created'), hideSm: true }, ...(isAdmin ? [''] : [])]}>
          {o.users
            .filter((u) => !userQuery.trim() || [u.full_name, u.username, u.email, ROLE_NAMES[u.role], t(ROLE_NAMES[u.role])].some((x) => (x || '').toLowerCase().includes(userQuery.trim().toLowerCase())))
            .map((u) => (
              <tr key={u.id} className={cx(!u.active && 'opacity-60')}>
                <td>
                  <div className="font-semibold">{u.full_name}{u.id === user.id && <span className="ml-1.5 text-[13px] font-normal text-ink-soft">({t('you')})</span>}</div>
                  <div className="text-[13px] text-ink-soft">{u.email || u.username}{u.auth_provider === 'google' ? ' · Google' : ''}</div>
                </td>
                <td>{ROLE_NAMES[u.role] ? t(ROLE_NAMES[u.role]) : u.role}</td>
                <td className="hidden max-w-[260px] text-[13px] md:table-cell">{u.wards.map(wardName).join('; ')}</td>
                <td>
                  {!u.active ? <Badge tone="lali">{t('Switched off')}</Badge>
                    : u.approved === false ? <Badge tone="marigold">{t('Waiting')}</Badge>
                      : <Badge tone="pine">{t('Active')}</Badge>}
                </td>
                <td className="hidden whitespace-nowrap text-[13px] text-ink-soft md:table-cell">{relativeTime(u.created_at)}</td>
                {isAdmin && <td className="text-right"><Button size="sm" variant="ghost" onClick={() => setManaging(u)}>{t('Manage')}</Button></td>}
              </tr>
            ))}
        </Table>
      </Panel>

      <div className="grid gap-5">
        <Panel>
          <PanelHead title={t('Audit log')} hint={t('Sign-ins, resolutions, failovers')} />
          <ul className="max-h-[420px] overflow-y-auto">
            {audit.map((a) => (
              <li key={a.id} className="border-t border-line-soft px-5 py-2.5 text-sm first:border-t-0">
                <span className="font-semibold">{AUDIT[a.action] ? t(AUDIT[a.action]) : a.action}</span> <span className="text-ink-soft">{t('by {name}', { name: a.username || t('system') })}</span>
                <div className="text-[13px] text-ink-soft">{formatDateTime(a.at)}{a.target ? `, ${a.target}` : ''}</div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {adding && <AddUser onClose={() => setAdding(false)} onAdded={() => { toast(t('User added.')); load(); }} />}
      {managing && <ManageUser account={managing} me={user} onClose={() => setManaging(null)} onSaved={load} />}
      {sync.isOffline && <p className="mt-4 text-sm text-marigold-deep">{t('You are offline. Figures shown are from the last refresh.')}</p>}
    </>
  );
}
