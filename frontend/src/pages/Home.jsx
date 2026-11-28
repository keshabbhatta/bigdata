// Public home page: what the project is, who it is for and how it works,
// illustrated with real photographs of health work in Nepal.
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  WifiOff, BatteryLow, Users, Smartphone, HardDrive, RefreshCw, GitMerge, Footprints, Stethoscope, HeartPulse,
  ShieldCheck, ArrowRight, CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { Button, cx } from '../components/ui.jsx';
import { Photo, Picture, Credit, Slideshow } from '../components/Photo.jsx';
import { PHOTOS, HERO_SLIDES } from '../content/photos.js';
import { t, num, LanguageSwitcher } from '../i18n/index.jsx';

function usePhase(count, ms) {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setPhase((p) => (p + 1) % count), ms);
    return () => clearInterval(timer);
  }, [count, ms]);
  return phase;
}

const H2 = 'font-serif text-[30px] leading-[1.15] font-semibold text-ink md:text-[40px]';

/* ------------------------------------------------------------ phone mockup */

const PHONE_STATES = [
  { ribbon: 'Offline. 3 visits saved on this phone', tone: 'off' },
  { ribbon: 'Signal found. Syncing 3 changes…', tone: 'sync' },
  { ribbon: 'All changes synced', tone: 'ok' },
];
const PHONE_ROWS = [
  { name: 'Sabina Tamang', what: 'Antenatal check, BP 118/78' },
  { name: 'Laxmi Gurung', what: 'New patient registered' },
  { name: 'Puja Shrestha', what: 'Iron and folic acid given' },
];

function PhoneMockup() {
  const phase = usePhase(3, 2800);
  const st = PHONE_STATES[phase];
  return (
    <div className="mx-auto w-[260px] sm:w-[280px]">
      <div className="rounded-[2.4rem] border-[9px] border-ink bg-ink shadow-[0_24px_50px_-24px_rgba(28,38,56,.55)]">
        <div className="overflow-hidden rounded-[1.8rem] bg-paper text-ink">
          <div className="flex items-center justify-between bg-brand px-5 pt-3 pb-2 text-[10px] text-white/80">
            <span>9:41</span><span className="h-4 w-16 rounded-full bg-black/40" /><span>{phase === 0 ? t('No signal') : '2G'}</span>
          </div>
          <div className="bg-brand px-4 pb-3 text-white">
            <div className="font-condensed text-[15px] font-semibold">{t('Good morning, Sita')}</div>
            <div className="text-[11px] text-white/70">{t('Ward 1, Simle')}</div>
          </div>
          <div className={cx('flex h-8 items-center gap-2 px-3 text-[11px] font-semibold transition-colors duration-500',
            st.tone === 'off' && 'bg-marigold-wash text-marigold-deep', st.tone === 'sync' && 'stripes animate-flow text-white',
            st.tone === 'ok' && 'bg-pine-wash text-pine-deep')}>
            {st.tone === 'off' ? <WifiOff size={13} /> : st.tone === 'sync' ? <RefreshCw size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
            {t(st.ribbon)}
          </div>
          <div className="grid grid-cols-2 gap-2 p-3">
            {[['30', 'Patients'], ['6', 'Pregnancies']].map(([n, l]) => (
              <div key={l} className="rounded-lg border border-line-soft bg-white p-2.5">
                <div className="font-condensed text-xl font-semibold">{num(n)}</div>
                <div className="text-[10px] text-ink-soft">{t(l)}</div>
              </div>
            ))}
          </div>
          <div className="mx-3 mb-3 overflow-hidden rounded-lg border border-line-soft bg-white">
            {PHONE_ROWS.map((r, i) => (
              <div key={r.name} className="flex items-center gap-2.5 border-t border-line-soft px-3 py-2.5 first:border-t-0">
                <span className="grid size-7 flex-none place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: ['#0b6f93', '#284f8a', '#95192d'][i] }}>
                  {r.name.split(' ').map((p) => p[0]).join('')}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-semibold">{t(r.name)}</div>
                  <div className="truncate text-[10px] text-ink-soft">{t(r.what)}</div>
                </div>
                <span className={cx('rounded-full px-1.5 py-0.5 text-[9px] font-bold transition-colors duration-500',
                  phase === 2 ? 'bg-pine-wash text-pine-deep' : 'bg-marigold-wash text-marigold-deep')}>
                  {phase === 2 ? t('Synced') : t('On phone')}
                </span>
              </div>
            ))}
          </div>
          <div className="flex justify-around border-t border-line bg-white py-2.5 text-ink-soft">
            {[Users, HeartPulse, RefreshCw, GitMerge].map((I, i) => <I key={i} size={16} className={i === 0 ? 'text-pine' : ''} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ page */

const PROBLEMS = [
  { slug: 'signal', icon: WifiOff, title: 'The signal comes and goes', text: 'Volunteers walk between households on 2G and 3G that drops for hours. A cloud-only app simply stops working.' },
  { slug: 'power', icon: BatteryLow, title: 'Power cuts that last days', text: 'Phones may not reach a server for days. Records must stay safe on the phone, through restarts and flat batteries.' },
  { slug: 'shared-records', icon: Users, title: 'Two workers, one family', text: 'Household and referral records are shared. When two people update them offline, simple caching silently loses one update.' },
];

const STEPS = [
  { icon: Smartphone, title: 'Record offline', text: 'Register a patient or an antenatal visit anywhere. The app never waits for the network.' },
  { icon: HardDrive, title: 'Saved on the phone', text: 'Every change is kept safely on the phone, even if the phone is switched off or the battery runs out.' },
  { icon: RefreshCw, title: 'Syncs by itself', text: 'When a signal appears, saved changes are sent by themselves. Nothing is lost and nothing is saved twice.' },
  { icon: GitMerge, title: 'Merged without loss', text: 'If two workers record different readings for the same person, both are kept side by side for a doctor to decide.' },
];

const ROLES = [
  { icon: Footprints, title: 'Health volunteer', bar: 'border-pine', ic: 'text-pine', points: ['Register households and mothers', 'Record ANC visits with vitals', 'Works with no internet for days'] },
  { icon: Stethoscope, title: 'Doctor', bar: 'border-sky', ic: 'text-sky', points: ['See high-risk pregnancies first', 'Resolve conflicting readings', 'Analytics across villages'] },
  { icon: HeartPulse, title: 'Patient', bar: 'border-lali', ic: 'text-lali', points: ['Pregnancy week and due date', 'Next check-up and readings', 'Danger signs to watch for'] },
  { icon: ShieldCheck, title: 'Administrator', bar: 'border-marigold', ic: 'text-marigold-deep', points: ['Users, roles and wards', 'Approve new accounts', 'Backups of all records'] },
];

/**
 * Scrolls to the section named in the address (/home#how) every time a link is used,
 * also when coming back from another page, and to the top for a plain /home link
 * (for example the Sewika logo).
 */
function useSectionScroll() {
  const { hash, key } = useLocation();
  useEffect(() => {
    let tries = 0;
    let frame;
    const go = () => {
      if (!hash) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      const el = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (el) {
        const bar = document.querySelector('header')?.offsetHeight || 64; // height of the top bar
        const top = el.getBoundingClientRect().top + window.scrollY - bar;
        window.scrollTo({ top, behavior: 'smooth' });
      } else if (tries++ < 30) frame = requestAnimationFrame(go); // the page may still be drawing
    };
    frame = requestAnimationFrame(go);
    return () => cancelAnimationFrame(frame);
  }, [hash, key]);
}

export function Home() {
  const { session } = useAuth();
  const cta = session ? { to: '/', label: t('Open the app') } : { to: '/login', label: t('Try the live demo') };
  useEffect(() => { document.title = 'Sewika (सेविका) – Health records that work without a signal'; }, []);
  useSectionScroll();

  return (
    <div className="min-h-full scroll-smooth bg-paper">
      {/* ---------- top bar ---------- */}
      <header className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1180px] items-center gap-3 px-4 sm:gap-6 md:px-8">
          <Link to="/home" className="flex items-center gap-2.5 text-ink no-underline">
            <img src="/favicon.svg" alt="" className="size-9 rounded-[10px]" />
            <span className="leading-none">
              <strong className="block font-serif text-[19px] font-semibold">Sewika</strong>
              <span className="mt-1 hidden text-[12px] leading-none text-pine sm:block">सेविका</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-5 text-[15px] md:flex" aria-label={t('Sections')}>
            {[['#problem', 'The problem'], ['#how', 'How it works'], ['#roles', 'Who uses it']].map(([href, l]) => (
              <Link key={href} to={`/home${href}`} className="text-ink-soft no-underline hover:text-ink hover:underline hover:underline-offset-4">{t(l)}</Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher />
            {!session && <span className="hidden sm:inline-flex"><Button as={Link} to="/login?mode=signup" variant="ghost" size="sm" className="h-9 px-4">{t('Create account')}</Button></span>}
            <Button as={Link} to={cta.to} size="sm" className="h-9 px-4">{session ? t('Open the app') : t('Sign in')}</Button>
          </div>
        </div>
        <nav className="scrollbar-none flex gap-1 overflow-x-auto border-t border-line px-3 py-1.5 text-[14px] md:hidden" aria-label={t('Sections')}>
          {[['#problem', 'The problem'], ['#how', 'How it works'], ['#roles', 'Who uses it']].map(([href, l]) => (
            <Link key={href} to={`/home${href}`} className="flex-none rounded-full px-3 py-1.5 font-medium whitespace-nowrap text-ink-2 no-underline active:bg-line-soft">{t(l)}</Link>
          ))}
        </nav>
      </header>

      {/* ---------- hero ---------- */}
      <section className="mx-auto grid max-w-[1180px] items-center gap-10 px-4 pt-10 pb-16 md:px-8 md:pt-16 md:pb-24 lg:grid-cols-[1fr_1.05fr] lg:gap-14">
        <div>
          <p className="text-[15px] font-semibold text-pine">{t("For Nepal's female community health volunteers")}</p>
          <h1 className="mt-3 max-w-[18ch] font-serif text-[36px] leading-[1.1] font-semibold text-ink md:text-[52px]">
            {t('Every reading saved, even where the signal never reaches.')}
          </h1>
          <p className="mt-5 max-w-[54ch] text-[17px] leading-relaxed text-ink-2">
            {t('Sewika lets community health volunteers record mothers, pregnancies and visits with no internet, then synchronizes safely when a connection appears. When two workers disagree, both readings are kept for a doctor. Nothing is silently overwritten.')}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button as={Link} to={cta.to} className="h-12 px-6 text-base">{cta.label} <ArrowRight size={18} /></Button>
            <Button as={Link} to="/home#how" variant="ghost" className="h-12 px-6 text-base">{t('How it works')}</Button>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[15px] text-ink-2">
            {['Works fully offline', 'Syncs on weak 2G', 'Installs like an app'].map((txt) => (
              <li key={txt} className="flex items-center gap-2"><CheckCircle2 size={17} className="text-pine" /> {t(txt)}</li>
            ))}
          </ul>
        </div>
        <Slideshow photos={HERO_SLIDES} interval={5000} imgClassName="rounded-lg shadow-[0_18px_40px_-22px_rgba(28,38,56,.6)]" />
      </section>

      {/* ---------- problem ---------- */}
      <section id="problem" className="scroll-mt-16 border-y border-line bg-white py-16 md:py-24">
        <div className="mx-auto grid max-w-[1180px] gap-12 px-4 md:px-8 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
          <div>
            <h2 className={H2}>{t('Built for places the network forgets')}</h2>
            <p className="mt-4 text-[17px] leading-relaxed text-ink-2">
              {t('Female Community Health Volunteers in rural Nepal, Lady Health Workers in Pakistan and rural clinic staff in Bangladesh and Sri Lanka keep maternal and community health running in hill villages, often with no reliable connection.')}
            </p>
            <Photo photo={PHOTOS.village} className="mt-8" imgClassName="aspect-[4/3] rounded-lg" />
          </div>
          <ol className="m-0 list-none self-center p-0">
            {PROBLEMS.map((p, i) => (
              <li key={p.slug} className="border-t border-line first:border-t-0">
                <Link to={`/problems/${p.slug}`} aria-label={`${t(p.title)}: ${t('read the full explanation')}`}
                  className="group flex gap-5 py-7 text-ink no-underline">
                  <span className="font-serif text-[34px] leading-none text-lali">{num(String(i + 1))}</span>
                  <span className="flex-1">
                    <span className="flex items-center gap-2 text-xl font-semibold"><p.icon size={19} className="text-ink-soft" /> {t(p.title)}</span>
                    <span className="mt-2 block text-ink-soft">{t(p.text)}</span>
                    <span className="mt-3 inline-flex items-center gap-1.5 text-[15px] font-semibold text-pine group-hover:underline group-hover:underline-offset-4">
                      {t('Read the full explanation')} <ArrowRight size={16} />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------- how it works ---------- */}
      <section id="how" className="scroll-mt-16 py-16 md:py-24">
        <div className="mx-auto grid max-w-[1180px] items-center gap-12 px-4 md:px-8 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <h2 className={H2}>{t('How a visit travels from the village to the clinic')}</h2>
            <p className="mt-4 max-w-[60ch] text-[17px] leading-relaxed text-ink-2">{t('Local first: the phone is the source of truth while offline, and the server merges everyone’s work when they reconnect.')}</p>
            <ol className="relative mt-10 list-none space-y-8 p-0">
              <span aria-hidden className="absolute top-2 bottom-2 left-[19px] w-px bg-line" />
              {STEPS.map((s, i) => (
                <li key={s.title} className="relative flex gap-5">
                  <span className="relative grid size-10 flex-none place-items-center rounded-full border-2 border-pine bg-paper font-semibold text-pine">{num(String(i + 1))}</span>
                  <div>
                    <h3 className="flex items-center gap-2 text-lg font-semibold"><s.icon size={18} className="text-ink-soft" /> {t(s.title)}</h3>
                    <p className="mt-1 max-w-[52ch] text-ink-soft">{t(s.text)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <PhoneMockup />
        </div>
      </section>

      {/* ---------- conflict showcase ---------- */}
      <section className="bg-brand py-16 text-white md:py-24">
        <div className="mx-auto grid max-w-[1180px] items-center gap-12 px-4 md:px-8 lg:grid-cols-2 lg:gap-16">
          <Photo photo={PHOTOS.checkup} tone="dark" imgClassName="aspect-[3/2] rounded-lg" />
          <div>
            <h2 className="font-serif text-[30px] leading-[1.15] font-semibold md:text-[40px]">{t('Two readings. Nothing lost.')}</h2>
            <p className="mt-4 text-[17px] leading-relaxed text-white/80">
              {t('Sita and Gita both visit the same mother while offline and record different blood pressures. A naive app keeps whichever phone syncs last. Sewika notices that neither worker saw the other’s reading and keeps both.')}
            </p>
            <div className="mt-7 grid grid-cols-2 gap-3 text-ink">
              {[["Sita's phone, offline", '120/80', 'Blood pressure, 10:12'], ["Gita's phone, offline", '140/90', 'Blood pressure, 10:40']].map(([who, bp, when]) => (
                <div key={who} className="rounded-lg bg-white p-4">
                  <div className="flex items-center gap-1.5 text-xs text-ink-soft"><Smartphone size={13} /> {t(who)}</div>
                  <div className="mt-1 font-condensed text-[28px] font-semibold">{bp}</div>
                  <div className="text-xs text-ink-soft">{t(when)}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-lg border-l-4 border-marigold bg-white/10 p-4">
              <div className="flex items-center gap-2 font-semibold"><GitMerge size={16} className="text-marigold" /> {t('Conflicting readings, both kept')}</div>
              <p className="mt-1 text-[15px] text-white/80">{t('A blood pressure value is clinical, so the server never picks one silently. It waits for a doctor.')}</p>
            </div>
            <ul className="mt-6 space-y-2 text-white/85">
              {['Clinical fields are never chosen automatically', 'Every decision is recorded in an audit log'].map((txt) => (
                <li key={txt} className="flex gap-3"><CheckCircle2 size={19} className="mt-0.5 flex-none text-mint" /> {t(txt)}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ---------- roles ---------- */}
      <section id="roles" className="scroll-mt-16 bg-white py-16 md:py-24">
        <div className="mx-auto max-w-[1180px] px-4 md:px-8">
          <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-end">
            <div>
              <h2 className={H2}>{t('One record, four kinds of users')}</h2>
              <p className="mt-4 max-w-[60ch] text-[17px] leading-relaxed text-ink-2">{t('Each person sees what they need. Volunteers only see their own ward, and patients only their own record.')}</p>
            </div>
          </div>
          <div className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {ROLES.map((r) => (
              <div key={r.title} className={cx('border-t-[3px] pt-5', r.bar)}>
                <h3 className="flex items-center gap-2 text-lg font-semibold"><r.icon size={19} className={r.ic} /> {t(r.title)}</h3>
                <ul className="mt-3 space-y-1.5 text-ink-soft">
                  {r.points.map((p) => <li key={p}>{t(p)}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- call to action ---------- */}
      <section className="relative overflow-hidden bg-ink text-white">
        <div className="absolute inset-0"><Picture photo={PHOTOS.terraces} sizes="100vw" className="h-full" /></div>
        <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-ink/90 via-ink/70 to-ink/20" />
        <div className="relative mx-auto max-w-[1180px] px-4 py-20 md:px-8 md:py-28">
          <h2 className="max-w-[18ch] font-serif text-[32px] leading-[1.15] font-semibold md:text-[44px]">{t('See it working')}</h2>
          <p className="mt-4 max-w-[52ch] text-[17px] leading-relaxed text-white/85">
            {t('Sign in as a health volunteer, a doctor or a patient with the demo accounts. Turn the network off from the Sync screen and keep working.')}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button as={Link} to={cta.to} variant="accent" className="h-12 px-7 text-base">{cta.label}</Button>
            {!session && <Button as={Link} to="/login?mode=signup" variant="light" className="h-12 px-7 text-base">{t('Create an account')}</Button>}
          </div>
          <p className="mt-12 text-[13px] text-white/60">{t(PHOTOS.terraces.caption)} <Credit photo={PHOTOS.terraces} className="text-white/45" /></p>
        </div>
      </section>

      <footer className="border-t border-line bg-paper text-[15px]">
        <div className="mx-auto grid max-w-[1180px] gap-10 px-4 py-12 sm:grid-cols-2 md:px-8 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Link to="/home" className="flex items-center gap-2.5 text-ink no-underline">
              <img src="/favicon.svg" alt="" className="size-9 rounded-[10px]" />
              <span className="leading-none"><strong className="block font-serif text-[19px] font-semibold">Sewika</strong><span className="mt-1 block text-[12px] leading-none text-pine">सेविका</span></span>
            </Link>
            <p className="mt-4 max-w-[34ch] text-ink-soft">{t('Health records that work without a signal, for the volunteers who look after mothers in Nepal’s villages.')}</p>
          </div>
          <nav aria-label={t('The project')}>
            <h3 className="text-sm font-semibold text-ink">{t('The project')}</h3>
            <ul className="mt-3 space-y-2">
              {[['#problem', 'The problem'], ['#how', 'How it works'], ['#roles', 'Who uses it']].map(([href, l]) => (
                <li key={href}><Link to={`/home${href}`} className="text-ink-soft no-underline hover:text-ink hover:underline">{t(l)}</Link></li>
              ))}
            </ul>
          </nav>
          <nav aria-label={t('The three problems')}>
            <h3 className="text-sm font-semibold text-ink">{t('The three problems')}</h3>
            <ul className="mt-3 space-y-2">
              {PROBLEMS.map((p) => (
                <li key={p.slug}><Link to={`/problems/${p.slug}`} className="text-ink-soft no-underline hover:text-ink hover:underline">{t(p.title)}</Link></li>
              ))}
            </ul>
          </nav>
          <nav aria-label={t('Use the app')}>
            <h3 className="text-sm font-semibold text-ink">{t('Use the app')}</h3>
            <ul className="mt-3 space-y-2">
              <li><Link to={cta.to} className="text-ink-soft no-underline hover:text-ink hover:underline">{session ? t('Open the app') : t('Sign in')}</Link></li>
              {!session && <li><Link to="/login?mode=signup" className="text-ink-soft no-underline hover:text-ink hover:underline">{t('Create an account')}</Link></li>}
            </ul>
          </nav>
        </div>
        <div className="border-t border-line">
          <div className="mx-auto flex max-w-[1180px] flex-col gap-2 px-4 py-5 text-[13px] text-ink-soft md:flex-row md:justify-between md:px-8">
            <span>© {num('2026')} Sewika. {t('Final-semester Big Data project.')} {t('Demo data is synthetic. Not for clinical use.')}</span>
            <span>{t('Photos from Wikimedia Commons, credited under each photo. The people shown are not users of this app.')}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
