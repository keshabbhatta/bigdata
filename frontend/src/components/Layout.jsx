// App shell: a horizontal navigation bar on top (sticky), the connection
// ribbon under it when something needs attention, and the page content.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Baby, ClipboardList, RefreshCw, GitMerge, BarChart3, ShieldCheck, LogOut, HeartPulse, ChevronDown, Info,
} from 'lucide-react';
import { useAuth, isStaff, ROLE_NAMES } from '../context/AuthContext.jsx';
import { useSync } from '../context/SyncContext.jsx';
import { SignalRibbon } from './SignalRibbon.jsx';
import { cx } from './ui.jsx';
import { wardName, relativeTime } from '../utils/format.js';

const BARS = { real: 4, '3g': 3, '2g': 2, flaky: 1, offline: 0 };

/** Compact connection status in the navbar; opens the Sync status page. */
function SyncChip() {
  const s = useSync();
  const navigate = useNavigate();
  let tone = 'ok';
  let label = 'Synced';
  if (s.state === 'syncing') { tone = 'sync'; label = 'Syncing'; }
  else if (s.isOffline) { tone = 'off'; label = s.pending ? `Offline, ${s.pending} saved` : 'Offline'; }
  else if (s.state === 'error' || s.state === 'auth') { tone = 'bad'; label = 'Sync problem'; }
  else if (s.pending) { tone = 'off'; label = `${s.pending} to sync`; }
  const bars = s.isOffline ? 0 : BARS[s.network] ?? 4;
  return (
    <button type="button" onClick={() => navigate('/sync')}
      title={s.lastSyncAt ? `Last sync ${relativeTime(s.lastSyncAt)}` : 'Not synced yet'}
      className={cx(
        'inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border px-3 text-[13px] font-semibold transition-all duration-300',
        tone === 'ok' && 'border-white/15 bg-white/10 text-mint hover:bg-white/15',
        tone === 'off' && 'border-marigold/40 bg-marigold text-ink',
        tone === 'bad' && 'border-lali/40 bg-lali text-white',
        tone === 'sync' && 'stripes animate-flow border-mint/40 text-white',
      )}>
      <span className="flex h-3.5 items-end gap-[2px]" aria-hidden>
        {[4, 7, 10, 14].map((h, i) => (
          <i key={h} style={{ height: h, animationDelay: `${i * 0.15}s` }}
            className={cx('block w-[3px] rounded-[1px] bg-current', tone === 'sync' ? 'animate-climb' : i < bars ? 'opacity-100' : 'opacity-30')} />
        ))}
      </span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function ConflictBell() {
  const { openConflicts } = useSync();
  return (
    <NavLink to="/conflicts" aria-label={`Conflicting readings: ${openConflicts}`}
      className={({ isActive }) => cx('relative grid size-9 place-items-center rounded-full border transition-colors',
        isActive ? 'border-white bg-white text-ink' : 'border-white/15 bg-white/10 text-white hover:bg-white/20')}>
      <GitMerge size={17} />
      {openConflicts > 0 && (
        <span className="absolute -top-1 -right-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-lali px-1 text-[10px] font-bold text-white ring-2 ring-ink">
          <span className="absolute inset-0 animate-ping-soft rounded-full bg-lali" />
          <span className="relative">{openConflicts}</span>
        </span>
      )}
    </NavLink>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  const initials = user.name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu"
        className="flex h-9 cursor-pointer items-center gap-2 rounded-full border border-white/15 bg-white/10 py-0 pr-2.5 pl-0.5 text-white transition-colors hover:bg-white/20">
        <span className="grid size-8 place-items-center rounded-full bg-marigold text-[13px] font-bold text-ink">{initials}</span>
        <span className="hidden max-w-[140px] truncate text-sm font-semibold md:inline">{user.name.split(' ')[0]}</span>
        <ChevronDown size={15} className={cx('transition-transform duration-200', open && 'rotate-180')} />
      </button>
      {open && (
        <div role="menu" className="absolute top-12 right-0 z-50 w-64 origin-top-right animate-pop overflow-hidden rounded-2xl border border-line bg-white text-ink shadow-2xl">
          <div className="bg-brand px-4 py-3.5 text-white">
            <div className="font-semibold">{user.name}</div>
            <div className="text-[13px] text-white/75">{ROLE_NAMES[user.role]}, {user.wards.length > 1 ? `${user.wards.length} wards` : wardName(user.wards[0])}</div>
          </div>
          <Link to="/sync" role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-4 py-3 text-sm text-ink no-underline hover:bg-paper">
            <RefreshCw size={16} className="text-ink-soft" /> Sync status
          </Link>
          <Link to="/home" role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-2.5 border-t border-line-soft px-4 py-3 text-sm text-ink no-underline hover:bg-paper">
            <Info size={16} className="text-ink-soft" /> About the project
          </Link>
          <button type="button" role="menuitem" onClick={logout} className="flex w-full cursor-pointer items-center gap-2.5 border-t border-line-soft px-4 py-3 text-left text-sm text-lali-deep hover:bg-lali-wash">
            <LogOut size={16} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

/** Horizontal links with a highlight that slides to the active page. */
function NavLinks({ items, mobile }) {
  const location = useLocation();
  const box = useRef(null);
  const refs = useRef({});
  const [pill, setPill] = useState(null);

  const measure = useCallback(() => {
    const active = items.find((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to)));
    const el = active && refs.current[active.to];
    setPill(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
    if (el && mobile) el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [items, location.pathname, mobile]);

  useLayoutEffect(() => { measure(); }, [measure]);
  useEffect(() => {
    window.addEventListener('resize', measure);
    document.fonts?.ready.then(measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  return (
    <nav ref={box} aria-label="Main"
      className={cx('relative flex items-center gap-1', mobile && 'scrollbar-none overflow-x-auto px-3 pb-2.5 lg:hidden', !mobile && 'hidden lg:flex')}>
      {pill && (
        <span aria-hidden className="absolute top-0 h-10 rounded-full bg-white/12 ring-1 ring-white/15 transition-all duration-300 ease-out"
          style={{ left: pill.left, width: pill.width }}>
          <span className="absolute inset-x-4 -bottom-[1px] h-[3px] rounded-full bg-marigold" />
        </span>
      )}
      {items.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.end} ref={(el) => { refs.current[n.to] = el; }}
          className={({ isActive }) => cx(
            'relative z-10 flex h-10 flex-none items-center gap-2 rounded-full px-3.5 text-sm font-semibold whitespace-nowrap no-underline transition-colors',
            isActive ? 'text-white' : 'text-white/65 hover:text-white',
          )}>
          <n.icon size={17} /> {n.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function Layout() {
  const { user } = useAuth();
  const location = useLocation();
  const patient = user.role === 'patient';

  const items = patient
    ? [{ to: '/', label: 'My health', icon: HeartPulse, end: true }, { to: '/sync', label: 'Sync status', icon: RefreshCw }]
    : [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/patients', label: 'Patients', icon: Users },
      { to: '/maternal', label: 'Maternal health', icon: Baby },
      { to: '/visits', label: 'Visits', icon: ClipboardList },
      { to: '/analytics', label: 'Analytics', icon: BarChart3 },
      ...(isStaff(user) ? [{ to: '/admin', label: 'Admin', icon: ShieldCheck }] : []),
    ];

  useEffect(() => { window.scrollTo({ top: 0 }); }, [location.pathname]);

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-40">
        <div className="bg-brand text-white shadow-[0_10px_30px_-14px_rgba(18,32,58,.7)]">
          <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-3 px-4 md:px-8">
            <Link to="/" className="mr-2 flex items-center gap-2.5 text-white no-underline lg:mr-6">
              <img src="/favicon.svg" alt="" className="size-9 rounded-xl ring-1 ring-white/20" />
              <span className="leading-tight">
                <strong className="block font-condensed text-[15px] font-semibold tracking-wide whitespace-nowrap sm:text-lg">RuralHealth Sync</strong>
                <span className="hidden text-[11px] text-white/60 sm:block">Community health records</span>
              </span>
            </Link>
            <NavLinks items={items} />
            <div className="ml-auto flex items-center gap-2">
              <SyncChip />
              {!patient && <ConflictBell />}
              <UserMenu />
            </div>
          </div>
          <NavLinks items={items} mobile />
        </div>
        <SignalRibbon />
      </header>

      <main key={location.pathname} className="mx-auto w-full max-w-[1280px] animate-page-in px-4 pt-6 pb-16 md:px-8 md:pt-8">
        <Outlet />
      </main>
    </div>
  );
}
