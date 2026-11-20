// The connection ribbon slides down under the navbar only when something needs
// the health worker's attention: no signal, a sync in progress (if it takes a
// moment), a failed sync, or an expired session. It says in one sentence
// whether their work is safe and where it is.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WifiOff, AlertTriangle, RefreshCw, KeyRound } from 'lucide-react';
import { useSync } from '../context/SyncContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { cx } from './ui.jsx';

export function SignalRibbon() {
  const s = useSync();
  const { logout } = useAuth();
  const navigate = useNavigate();
  // Quick background syncs finish in a blink; only show the ribbon if one lasts.
  const [slowSync, setSlowSync] = useState(false);
  useEffect(() => {
    if (s.state !== 'syncing') { setSlowSync(false); return undefined; }
    const t = setTimeout(() => setSlowSync(true), 700);
    return () => clearTimeout(t);
  }, [s.state]);

  const changes = (n) => `${n} change${n === 1 ? '' : 's'}`;
  let view = null;
  if (s.state === 'syncing' && slowSync) {
    view = { tone: 'sync', Icon: RefreshCw, msg: <><b>Syncing.</b> {s.progress || 'Talking to the server'}…</> };
  } else if (s.isOffline && s.state !== 'syncing') {
    view = {
      tone: 'off', Icon: WifiOff,
      msg: s.pending
        ? <><b>Offline.</b> {changes(s.pending)} saved on this phone. They sync by themselves when the signal returns.</>
        : <><b>Offline.</b> Keep working. Everything you enter is saved on this phone.</>,
    };
  } else if (s.state === 'auth') {
    view = { tone: 'bad', Icon: KeyRound, msg: <><b>Session expired.</b> Sign in again to sync. Your changes are safe on this phone.</>,
      action: { label: 'Sign in', run: () => { logout(); navigate('/login'); } } };
  } else if (s.state === 'error') {
    view = { tone: 'bad', Icon: AlertTriangle, msg: <><b>Sync failed.</b> {s.lastError} Your changes are safe on this phone.</>,
      action: { label: 'Try again', run: s.syncNow } };
  }
  if (!view) return null;

  return (
    <div role="status"
      className={cx(
        'animate-drop border-b text-sm',
        view.tone === 'off' && 'border-[#f1d6a8] bg-marigold-wash text-marigold-deep',
        view.tone === 'bad' && 'border-[#f2c4ce] bg-lali-wash text-lali-deep',
        view.tone === 'sync' && 'stripes animate-flow border-pine-deep text-white',
      )}>
      <div className="mx-auto flex h-11 max-w-[1280px] items-center gap-3 px-4 md:px-8">
        <view.Icon size={17} className={cx('flex-none', view.tone === 'sync' && 'animate-spin')} />
        <span className="min-w-0 flex-1 truncate">{view.msg}</span>
        {view.action && (
          <button type="button" onClick={view.action.run} className="cursor-pointer rounded-md px-2.5 py-1.5 font-semibold underline underline-offset-[3px]">
            {view.action.label}
          </button>
        )}
      </div>
    </div>
  );
}
