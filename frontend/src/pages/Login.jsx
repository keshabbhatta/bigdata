import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Footprints, Stethoscope, HeartPulse, Eye, EyeOff, WifiOff } from 'lucide-react';
import { useAuth, ROLE_TABS } from '../context/AuthContext.jsx';
import { api } from '../services/api.js';
import { VillageScene } from '../components/VillageScene.jsx';
import { Button, Field, Input, cx } from '../components/ui.jsx';

const TABS = [
  { id: 'worker', icon: Footprints, blurb: 'Register households and record visits in the field, even with no signal.' },
  { id: 'doctor', icon: Stethoscope, blurb: 'Review high-risk pregnancies, resolve conflicting readings and watch the system.' },
  { id: 'patient', icon: HeartPulse, blurb: 'See your pregnancy progress, your readings and the date of your next check-up.' },
];

const DEMO = {
  worker: [
    { u: 'sita', p: 'fchv123', who: 'Sita Tamang', role: 'Ward 1' },
    { u: 'gita', p: 'fchv123', who: 'Gita Gurung', role: 'Ward 1' },
    { u: 'maya', p: 'fchv123', who: 'Maya Rai', role: 'Ward 2' },
  ],
  doctor: [
    { u: 'supervisor', p: 'super123', who: 'Dr. Anita Sharma', role: 'All wards' },
    { u: 'admin', p: 'admin123', who: 'System Admin', role: 'Administrator' },
  ],
  patient: [{ u: 'mother', p: 'patient123', who: 'Demo mother', role: 'Ward 1, pregnant' }],
};

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

// Google Identity Services. The official button is rendered only when the
// server has a Google client ID configured (GOOGLE_CLIENT_ID).
function GoogleSignIn({ tab, onError, onBusy }) {
  const { loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const holder = useRef(null);
  const tabRef = useRef(tab);
  const [clientId, setClientId] = useState(() => localStorage.getItem('rh.googleClientId') || null);
  const [note, setNote] = useState('');
  tabRef.current = tab;

  useEffect(() => {
    api.authConfig().then((c) => {
      setClientId(c.googleClientId);
      if (c.googleClientId) localStorage.setItem('rh.googleClientId', c.googleClientId);
      else localStorage.removeItem('rh.googleClientId');
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!clientId || !holder.current) return;
    const render = () => {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async ({ credential }) => {
          onBusy(true);
          try { await loginWithGoogle(credential, tabRef.current); navigate('/', { replace: true }); } catch (e) { onError(e.message); } finally { onBusy(false); }
        },
      });
      window.google.accounts.id.renderButton(holder.current, { theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular', width: holder.current.offsetWidth || 360 });
    };
    if (window.google?.accounts?.id) { render(); return; }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = render;
    s.onerror = () => setNote('Google sign-in needs an internet connection.');
    document.head.appendChild(s);
  }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (clientId) return <div><div ref={holder} className="min-h-[44px] w-full" />{note && <p className="mt-2 text-[13px] text-ink-soft">{note}</p>}</div>;
  return (
    <div>
      <button type="button" onClick={() => setNote('Google sign-in is not set up on this server yet. Use your username and password.')}
        className="flex h-11 w-full cursor-pointer items-center justify-center gap-2.5 rounded-md border border-line bg-white font-semibold text-ink hover:border-ink-soft">
        <GoogleIcon /> Continue with Google
      </button>
      {note && <p className="mt-2 text-[13px] text-ink-soft" role="status">{note}</p>}
    </div>
  );
}

export function Login() {
  const { session, login } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState(() => (ROLE_TABS[localStorage.getItem('rh.loginTab')] ? localStorage.getItem('rh.loginTab') : 'worker'));
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;

  if (session && !session.expired) return <Navigate to="/" replace />;

  const chooseTab = (id) => { setTab(id); setError(''); localStorage.setItem('rh.loginTab', id); };
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(username, password, tab);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const active = TABS.find((t) => t.id === tab) || TABS[0];

  return (
    <div className="grid min-h-full md:grid-cols-[1.15fr_1fr]">
      <div className="relative flex min-h-[440px] flex-col overflow-hidden bg-ink px-6 py-7 text-white md:min-h-full md:p-12">
        <Link to="/home" className="relative z-10 flex items-center gap-2.5 self-start text-white no-underline">
          <img src="/favicon.svg" alt="" className="size-[34px]" />
          <strong className="font-condensed text-[19px] font-semibold">RuralHealth Sync</strong>
          <span className="ml-2 rounded-full border border-white/20 px-2.5 py-0.5 text-xs text-white/70 transition-colors hover:bg-white/10">About the project</span>
        </Link>
        <div className="relative z-10 mt-8 md:mt-[9vh]">
          <h1 className="max-w-[15ch] font-condensed text-[32px] leading-[1.05] font-semibold md:text-[48px]">
            Health records that keep working when the signal doesn&apos;t.
          </h1>
          <p className="mt-4 hidden max-w-[44ch] text-[#b8c5d3] sm:block">
            Volunteers record visits with no internet. Every reading is saved on the phone and syncs when
            a connection appears, and two workers can never overwrite each other&apos;s measurements.
          </p>
        </div>
        <VillageScene />
      </div>

      <div className="mx-auto flex w-full max-w-[480px] animate-rise flex-col justify-center px-6 py-8 md:p-12">
        <h2 className="font-condensed text-[30px] font-semibold">Sign in</h2>

        <div role="tablist" aria-label="I am a" className="mt-5 grid grid-cols-3 gap-1 rounded-[10px] bg-line-soft p-1">
          {TABS.map((t) => (
            <button key={t.id} role="tab" type="button" aria-selected={tab === t.id} onClick={() => chooseTab(t.id)}
              className={cx('flex cursor-pointer flex-col items-center gap-1 rounded-md px-2 py-2.5 text-[13px] font-semibold transition-colors',
                tab === t.id ? 'bg-white text-ink shadow-sm' : 'text-ink-soft hover:text-ink')}>
              <t.icon size={19} className={tab === t.id ? 'text-pine' : ''} />
              {ROLE_TABS[t.id].label}
            </button>
          ))}
        </div>
        <p className="mt-3 min-h-[44px] text-sm text-ink-soft">{active.blurb}</p>

        {offline && (
          <div className="mt-2 flex items-start gap-2 rounded-md bg-marigold-wash px-3 py-2.5 text-sm text-marigold-deep">
            <WifiOff size={16} className="mt-0.5 flex-none" /> You are offline. You can sign in with an account that has signed in on this phone before.
          </div>
        )}

        <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
          <Field label={tab === 'patient' ? 'Username from your health post' : 'Username'}>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" required />
          </Field>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="login-password" className="text-[13px] font-semibold text-ink-2">Password</label>
            <div className="relative">
              <Input id="login-password" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required className="pr-11" />
              <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}
                className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 cursor-pointer place-items-center rounded text-ink-soft hover:text-ink">
                {show ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>
          {error && <div role="alert" className="rounded-md bg-lali-wash px-3.5 py-2.5 text-sm text-lali-deep">{error}</div>}
          <Button type="submit" disabled={busy} className="h-[46px]">{busy ? 'Signing in…' : 'Sign in'}</Button>
        </form>

        <div className="my-5 flex items-center gap-3 text-[13px] text-ink-soft">
          <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
        </div>
        <GoogleSignIn tab={tab} onError={setError} onBusy={setBusy} />

        <div className="mt-7 border-t border-line pt-4">
          <p className="text-sm text-ink-soft">Demo accounts with synthetic data. Tap one to fill the form.</p>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            {DEMO[tab].map((d) => (
              <button key={d.u} type="button" onClick={() => { setUsername(d.u); setPassword(d.p); setError(''); }}
                className="cursor-pointer rounded-md border border-line bg-white px-3 py-2 text-left transition-colors hover:border-pine">
                <b className="block text-sm">{d.who}</b>
                <span className="text-xs text-ink-soft">{d.role}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
