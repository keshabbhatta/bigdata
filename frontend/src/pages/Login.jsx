import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Footprints, Stethoscope, HeartPulse, Eye, EyeOff, WifiOff, Check, Circle, MailCheck } from 'lucide-react';
import { useAuth, ROLE_TABS } from '../context/AuthContext.jsx';
import { api } from '../services/api.js';
import { VillageScene } from '../components/VillageScene.jsx';
import { Button, Field, Input, Segmented, Select, cx } from '../components/ui.jsx';
import { passwordChecks, passwordProblems, isEmailFormat } from '../../../shared/accounts.js';
import { NATION, isValidWard } from '../../../shared/areas.js';
import { AreaPicker } from '../components/AreaPicker.jsx';
import { t, tMsg, LanguageSwitcher } from '../i18n/index.jsx';

const TABS = [
  { id: 'worker', icon: Footprints, blurb: 'Register households and record visits in the field, even with no signal.' },
  { id: 'doctor', icon: Stethoscope, blurb: 'Review high-risk pregnancies, resolve conflicting readings and watch the system.' },
  { id: 'patient', icon: HeartPulse, blurb: 'See your pregnancy progress, your readings and the date of your next check-up.' },
];

const SIGNUP_NOTE = {
  worker: 'Health worker accounts can sign in right away and see the ward you choose.',
  doctor: 'Doctor accounts can see every ward in the area you choose, so an administrator approves them before the first sign-in.',
  patient: 'Your health post links the account to your health record. You can sign in after that.',
};

const DEMO = {
  worker: [
    { u: 'sita', p: 'fchv123', who: 'Sita Tamang', role: 'Ward 1, Indrawati RM' },
    { u: 'gita', p: 'fchv123', who: 'Gita Gurung', role: 'Ward 1, Indrawati RM' },
    { u: 'maya', p: 'fchv123', who: 'Maya Rai', role: 'Ward 2, Indrawati RM' },
  ],
  doctor: [
    { u: 'supervisor', p: 'super123', who: 'Dr. Anita Sharma', role: 'All of Nepal' },
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

function PasswordInput({ id, value, onChange, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input id={id} type={show ? 'text' : 'password'} value={value} onChange={onChange} autoComplete={autoComplete} required className="pr-11" />
      <button type="button" onClick={() => setShow(!show)} aria-label={show ? t('Hide password') : t('Show password')}
        className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 cursor-pointer place-items-center rounded text-ink-soft hover:text-ink">
        {show ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
}

// Google Identity Services. The official button is rendered only when the
// server has a Google client ID configured (GOOGLE_CLIENT_ID). On the
// "Create an account" screen it also creates the account (signupRef gives the ward).
function GoogleSignIn({ tab, signupRef, onError, onBusy, onPending }) {
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
          onError('');
          try {
            const r = await loginWithGoogle(credential, tabRef.current, signupRef.current?.());
            if (r.pending) onPending(tMsg(r.message)); else navigate('/', { replace: true });
          } catch (e) { onError(tMsg(e.message)); } finally { onBusy(false); }
        },
      });
      window.google.accounts.id.renderButton(holder.current, { theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular', width: holder.current.offsetWidth || 360 });
    };
    if (window.google?.accounts?.id) { render(); return; }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = render;
    s.onerror = () => setNote(t('Google sign-in needs an internet connection.'));
    document.head.appendChild(s);
  }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (clientId) return <div><div ref={holder} className="min-h-[44px] w-full" />{note && <p className="mt-2 text-[13px] text-ink-soft">{note}</p>}</div>;
  return (
    <div>
      <button type="button" onClick={() => setNote(t('Google sign-in is not set up on this server yet. Use your email and password.'))}
        className="flex h-11 w-full cursor-pointer items-center justify-center gap-2.5 rounded-md border border-line bg-white font-semibold text-ink hover:border-ink-soft">
        <GoogleIcon /> {t('Continue with Google')}
      </button>
      {note && <p className="mt-2 text-[13px] text-ink-soft" role="status">{note}</p>}
    </div>
  );
}

function SignInForm({ tab, onError, error }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    onError('');
    try {
      await login(username, password, tab);
      navigate('/', { replace: true });
    } catch (err) {
      onError(tMsg(err.message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
        <Field label={t('Email or username')}>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" inputMode="email" required />
        </Field>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="login-password" className="text-[13px] font-semibold text-ink-2">{t('Password')}</label>
          <PasswordInput id="login-password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </div>
        {error && <div role="alert" className="rounded-md bg-lali-wash px-3.5 py-2.5 text-sm text-lali-deep">{error}</div>}
        <Button type="submit" disabled={busy} className="h-[46px]">{busy ? t('Signing in…') : t('Sign in')}</Button>
      </form>
      <DemoAccounts tab={tab} onPick={(u, p) => { setUsername(u); setPassword(p); onError(''); }} />
    </>
  );
}

function DemoAccounts({ tab, onPick }) {
  return (
    <div className="mt-7 border-t border-line pt-4">
      <p className="text-sm text-ink-soft">{t('Demo accounts with synthetic data. Tap one to fill the form.')}</p>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        {DEMO[tab].map((d) => (
          <button key={d.u} type="button" onClick={() => onPick(d.u, d.p)}
            className="cursor-pointer rounded-md border border-line bg-white px-3 py-2 text-left transition-colors hover:border-pine">
            <b className="block text-sm">{t(d.who)}</b>
            <span className="text-xs text-ink-soft">{t(d.role)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SignUpForm({ tab, signupRef, onPending, onError, error }) {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [f, setF] = useState({ fullName: '', email: '', password: '', confirm: '', ward: '', area: NATION });
  const [busy, setBusy] = useState(false);
  const needsWard = tab !== 'doctor';
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const checks = passwordChecks(f.password);
  const where = () => (needsWard ? { ward: f.ward } : { area: f.area || NATION });
  // Google sign-up on this screen uses the ward / area chosen here.
  signupRef.current = () => {
    if (needsWard && !isValidWard(f.ward)) throw new Error(t('Choose your province, district, municipality and ward first.'));
    return where();
  };

  const submit = async (e) => {
    e.preventDefault();
    onError('');
    if (f.fullName.trim().length < 2) return onError(t('Enter your full name.'));
    if (!isEmailFormat(f.email)) return onError(t('Enter a valid email address, for example name@gmail.com.'));
    const problems = passwordProblems(f.password);
    if (problems.length) return onError(tMsg(problems[0]));
    if (f.password !== f.confirm) return onError(t('The two passwords do not match.'));
    if (needsWard && !isValidWard(f.ward)) return onError(t('Choose your province, district, municipality and ward.'));
    setBusy(true);
    try {
      const r = await register({ fullName: f.fullName.trim(), email: f.email.trim(), password: f.password, ...where() }, tab);
      if (r.pending) onPending(tMsg(r.message)); else navigate('/', { replace: true });
    } catch (err) {
      onError(err.offline ? t('Creating an account needs an internet connection.') : tMsg(err.message));
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-4" noValidate>
      <Field label={t('Full name')}>
        <Input value={f.fullName} onChange={set('fullName')} autoComplete="name" required />
      </Field>
      <Field label={t('Email')} note={t('Use a real address you can receive mail at. Fake or misspelled domains are rejected.')}>
        <Input type="email" value={f.email} onChange={set('email')} autoComplete="email" autoCapitalize="none" inputMode="email" required />
      </Field>
      {needsWard ? (
        <fieldset className="rounded-lg border border-line p-3">
          <legend className="px-1 text-[13px] font-semibold text-ink-2">{tab === 'patient' ? t('Where you live') : t('The ward you work in')}</legend>
          <AreaPicker value={f.ward} onChange={(ward) => setF({ ...f, ward })} level="ward" compact />
        </fieldset>
      ) : (
        <fieldset className="rounded-lg border border-line p-3">
          <legend className="px-1 text-[13px] font-semibold text-ink-2">{t('The area you cover')}</legend>
          <AreaPicker value={f.area} onChange={(area) => setF({ ...f, area: area || NATION })} level="any" allowNation compact />
          <p className="mt-2 text-xs text-ink-soft">{t('Leave as "All of Nepal" or narrow it to a province, district or municipality.')}</p>
        </fieldset>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="signup-password" className="text-[13px] font-semibold text-ink-2">{t('Password')}</label>
        <PasswordInput id="signup-password" value={f.password} onChange={set('password')} autoComplete="new-password" />
        <ul className="mt-1 grid grid-cols-1 gap-x-3 gap-y-0.5 text-[13px] sm:grid-cols-2" aria-label={t('Password rules')}>
          {checks.map((c) => (
            <li key={c.label} className={cx('flex items-center gap-1.5', c.ok ? 'text-pine' : 'text-ink-soft')}>
              {c.ok ? <Check size={14} /> : <Circle size={10} className="mx-0.5" />} {t(c.label)}
            </li>
          ))}
        </ul>
      </div>
      <Field label={t('Repeat password')}>
        <PasswordInput id="signup-confirm" value={f.confirm} onChange={set('confirm')} autoComplete="new-password" />
      </Field>
      <p className="text-[13px] text-ink-soft">{t(SIGNUP_NOTE[tab])}</p>
      {error && <div role="alert" className="rounded-md bg-lali-wash px-3.5 py-2.5 text-sm text-lali-deep">{error}</div>}
      <Button type="submit" disabled={busy} className="h-[46px]">{busy ? t('Creating account…') : t('Create account')}</Button>
    </form>
  );
}

export function Login() {
  const { session } = useAuth();
  const [tab, setTab] = useState(() => (ROLE_TABS[localStorage.getItem('rh.loginTab')] ? localStorage.getItem('rh.loginTab') : 'worker'));
  const [params, setParams] = useSearchParams();
  const [mode, setMode] = useState(() => (params.get('mode') === 'signup' ? 'signup' : 'signin'));
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [, setBusy] = useState(false);
  const signupRef = useRef(null);
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (mode === 'signin') signupRef.current = null;

  if (session && !session.expired) return <Navigate to="/" replace />;

  const chooseTab = (id) => { setTab(id); setError(''); setNotice(''); localStorage.setItem('rh.loginTab', id); };
  const switchMode = (m) => {
    setMode(m); setError(''); setNotice('');
    setParams(m === 'signup' ? { mode: 'signup' } : {}, { replace: true });
  };
  const active = TABS.find((tb) => tb.id === tab) || TABS[0];

  return (
    <div className="grid min-h-full md:grid-cols-[1.15fr_1fr]">
      <div className="relative flex min-h-[440px] flex-col overflow-hidden bg-ink px-6 py-7 text-white md:min-h-full md:p-12">
        <Link to="/home" className="relative z-10 flex items-center gap-2.5 self-start text-white no-underline">
          <img src="/favicon.svg" alt="" className="size-[34px]" />
          <strong className="font-condensed text-[19px] font-semibold">RuralHealth Sync</strong>
          <span className="ml-2 rounded-full border border-white/20 px-2.5 py-0.5 text-xs text-white/70 transition-colors hover:bg-white/10">{t('About the project')}</span>
        </Link>
        <div className="relative z-10 mt-8 md:mt-[9vh]">
          <h1 className="max-w-[15ch] font-condensed text-[32px] leading-[1.05] font-semibold md:text-[48px]">
            {t("Health records that keep working when the signal doesn't.")}
          </h1>
          <p className="mt-4 hidden max-w-[44ch] text-[#b8c5d3] sm:block">
            {t("Volunteers record visits with no internet. Every reading is saved on the phone and syncs when a connection appears, and two workers can never overwrite each other's measurements.")}
          </p>
        </div>
        <VillageScene />
      </div>

      <div className="mx-auto flex w-full max-w-[480px] animate-rise flex-col justify-center px-6 py-8 md:p-12">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Segmented label={t('Sign in or create an account')} value={mode} onChange={switchMode}
            options={[{ value: 'signin', label: t('I have an account') }, { value: 'signup', label: t('I am new here') }]} />
          <LanguageSwitcher />
        </div>
        <h2 className="font-condensed text-[30px] font-semibold">{mode === 'signin' ? t('Sign in') : t('Create an account')}</h2>
        <p className="mt-1 text-sm text-ink-soft">
          {mode === 'signin' ? t('Welcome back. Sign in with your email or username.') : t('New to RuralHealth Sync? Choose who you are, then fill in your details.')}
        </p>

        <div role="tablist" aria-label={t('I am a')} className="mt-5 grid grid-cols-3 gap-1 rounded-[10px] bg-line-soft p-1">
          {TABS.map((tb) => (
            <button key={tb.id} role="tab" type="button" aria-selected={tab === tb.id} onClick={() => chooseTab(tb.id)}
              className={cx('flex cursor-pointer flex-col items-center gap-1 rounded-md px-2 py-2.5 text-[13px] font-semibold transition-colors',
                tab === tb.id ? 'bg-white text-ink shadow-sm' : 'text-ink-soft hover:text-ink')}>
              <tb.icon size={19} className={tab === tb.id ? 'text-pine' : ''} />
              {t(ROLE_TABS[tb.id].label)}
            </button>
          ))}
        </div>
        <p className="mt-3 min-h-[44px] text-sm text-ink-soft">{t(active.blurb)}</p>

        {offline && (
          <div className="mt-2 flex items-start gap-2 rounded-md bg-marigold-wash px-3 py-2.5 text-sm text-marigold-deep">
            <WifiOff size={16} className="mt-0.5 flex-none" />
            {mode === 'signin'
              ? t('You are offline. You can sign in with an account that has signed in on this phone before.')
              : t('You are offline. Creating an account needs an internet connection.')}
          </div>
        )}

        {notice ? (
          <div role="status" className="mt-4 rounded-xl border border-pine/30 bg-pine-wash px-4 py-4 text-sm text-pine-deep">
            <div className="flex items-center gap-2 font-semibold"><MailCheck size={18} /> {t('Almost done')}</div>
            <p className="mt-1.5">{notice}</p>
            <Button variant="ghost" size="sm" className="mt-3" onClick={() => switchMode('signin')}>{t('Back to sign in')}</Button>
          </div>
        ) : (
          <>
            {mode === 'signin'
              ? <SignInForm key={tab} tab={tab} error={error} onError={setError} />
              : <SignUpForm key={tab} tab={tab} signupRef={signupRef} error={error} onError={setError} onPending={setNotice} />}

            <div className="my-5 flex items-center gap-3 text-[13px] text-ink-soft">
              <span className="h-px flex-1 bg-line" /> {t('or')} <span className="h-px flex-1 bg-line" />
            </div>
            <GoogleSignIn tab={tab} signupRef={signupRef} onError={setError} onBusy={setBusy} onPending={setNotice} />

            <p className="mt-5 text-center text-sm text-ink-soft">
              {mode === 'signin' ? (
                <>{t('New here?')} <button type="button" onClick={() => switchMode('signup')} className="cursor-pointer font-semibold text-pine underline-offset-2 hover:underline">{t('Create an account')}</button></>
              ) : (
                <>{t('Already have an account?')} <button type="button" onClick={() => switchMode('signin')} className="cursor-pointer font-semibold text-pine underline-offset-2 hover:underline">{t('Sign in')}</button></>
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
