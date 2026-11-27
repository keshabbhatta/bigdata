// Public home page: what the project is, who it is for, how it works and what
// it is built with. Long-scroll, with sections that animate in as you reach them.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  WifiOff, BatteryLow, Users, Smartphone, HardDrive, RefreshCw, GitMerge, Footprints, Stethoscope, HeartPulse,
  ShieldCheck, ArrowDown, ArrowRight, CheckCircle2, Signal, Database, Radio, Zap, Server, Boxes, Activity, Crown,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { Button, cx } from '../components/ui.jsx';
import { t, num, LanguageSwitcher } from '../i18n/index.jsx';

/* ---------------------------------------------------------------- helpers */

function useInView(options = { threshold: 0.2 }) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return undefined;
    if (!('IntersectionObserver' in window)) { setSeen(true); return undefined; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, options);
    io.observe(el);
    return () => io.disconnect();
  }, [seen]); // eslint-disable-line react-hooks/exhaustive-deps
  return [ref, seen];
}

/** Fades and lifts its children into place the first time they scroll into view. */
function Reveal({ children, delay = 0, className, as: As = 'div' }) {
  const [ref, seen] = useInView();
  return (
    <As ref={ref} className={cx('transition-all duration-700 ease-out', seen ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0', className)}
      style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </As>
  );
}

function usePhase(count, ms) {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setPhase((p) => (p + 1) % count), ms);
    return () => clearInterval(t);
  }, [count, ms]);
  return phase;
}

const STARS = Array.from({ length: 40 }, (_, i) => ({ left: `${(i * 37.7) % 100}%`, top: `${(i * 53.3) % 60}%`, d: `${(i % 6) * 0.6}s`, s: i % 4 === 0 ? 3 : 2 }));

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
  const phase = usePhase(3, 2600);
  const st = PHONE_STATES[phase];
  return (
    <div className="relative mx-auto w-[270px] animate-float-slow sm:w-[290px]">
      <div className="rounded-[2.6rem] border-[10px] border-[#0b1424] bg-[#0b1424] shadow-[0_40px_80px_-20px_rgba(0,0,0,.6)] ring-1 ring-white/10">
        <div className="overflow-hidden rounded-[2rem] bg-paper text-ink">
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
              <div key={l} className="rounded-xl bg-white p-2.5 shadow-sm">
                <div className="font-condensed text-xl font-semibold">{num(n)}</div>
                <div className="text-[10px] text-ink-soft">{t(l)}</div>
              </div>
            ))}
          </div>
          <div className="mx-3 mb-3 overflow-hidden rounded-xl bg-white shadow-sm">
            {PHONE_ROWS.map((r, i) => (
              <div key={r.name} className="flex items-center gap-2.5 border-t border-line-soft px-3 py-2.5 first:border-t-0">
                <span className="grid size-7 flex-none place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: ['#0d7a68', '#2f6fb0', '#a0243f'][i] }}>
                  {r.name.split(' ').map((p) => p[0]).join('')}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-semibold">{t(r.name)}</div>
                  <div className="truncate text-[10px] text-ink-soft">{t(r.what)}</div>
                </div>
                <span className={cx('rounded-full px-1.5 py-0.5 text-[9px] font-bold transition-all duration-500',
                  phase === 2 ? 'bg-pine-wash text-pine-deep' : 'bg-marigold-wash text-marigold-deep')}
                  style={{ transitionDelay: `${i * 180}ms` }}>
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

      {/* floating cards around the phone */}
      <div className="absolute top-[150px] -left-36 hidden w-48 animate-float rounded-2xl bg-white p-3 text-ink shadow-2xl sm:block [animation-delay:-2s]">
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-lali-deep"><GitMerge size={13} /> {t('Two readings kept')}</div>
        <div className="mt-1.5 flex gap-1.5 font-condensed text-lg font-semibold">
          <span className="rounded-lg bg-paper px-2">120/80</span><span className="rounded-lg bg-paper px-2">140/90</span>
        </div>
        <div className="mt-1 text-[10px] text-ink-soft">{t('A doctor chooses. Nothing is overwritten.')}</div>
      </div>
      <div className="absolute -right-24 bottom-16 hidden animate-float rounded-2xl bg-white px-3 py-2.5 text-ink shadow-2xl sm:block [animation-delay:-4s]">
        <div className="text-[10px] text-ink-soft">{t('Sync batch, gzip')}</div>
        <div className="font-condensed text-lg font-semibold text-pine">24 KB → 4 KB</div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- conflict demo */

function ConflictDemo() {
  const [ref, seen] = useInView({ threshold: 0.3 });
  const phase = usePhase(4, 2200);
  const p = seen ? phase : 0;
  const card = 'absolute top-0 w-[42%] rounded-2xl bg-white p-4 text-ink shadow-xl transition-all duration-700 ease-out';
  return (
    <div ref={ref} className="relative h-[330px] w-full">
      <div className={cx(card, p >= 1 ? 'left-[5%] translate-y-2 rotate-0' : 'left-0 -rotate-3')}>
        <div className="flex items-center gap-2 text-xs text-ink-soft"><Smartphone size={14} /> {t("Sita's phone, offline")}</div>
        <div className="mt-2 font-condensed text-3xl font-semibold">120/80</div>
        <div className="text-xs text-ink-soft">{t('Blood pressure, 10:12')}</div>
      </div>
      <div className={cx(card, p >= 1 ? 'right-[5%] translate-y-2 rotate-0' : 'right-0 rotate-3')}>
        <div className="flex items-center gap-2 text-xs text-ink-soft"><Smartphone size={14} /> {t("Gita's phone, offline")}</div>
        <div className="mt-2 font-condensed text-3xl font-semibold">140/90</div>
        <div className="text-xs text-ink-soft">{t('Blood pressure, 10:40')}</div>
      </div>
      <svg className="absolute top-[118px] left-1/2 h-16 w-[60%] -translate-x-1/2" viewBox="0 0 300 60" fill="none" aria-hidden>
        <path d="M20 0 C20 40 150 20 150 58 M280 0 C280 40 150 20 150 58" stroke="#5fe0c0" strokeWidth="2.5" strokeDasharray="6 8"
          className={cx('animate-dash transition-opacity duration-500', p >= 1 ? 'opacity-100' : 'opacity-0')} />
      </svg>
      <div className={cx('absolute top-[190px] left-1/2 w-[78%] -translate-x-1/2 rounded-2xl border-2 bg-white p-4 text-ink shadow-2xl transition-all duration-700 ease-out',
        p >= 2 ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-4 scale-95 opacity-0',
        p === 3 ? 'border-pine' : 'border-lali')}>
        {p === 3 ? (
          <>
            <div className="flex items-center gap-2 text-sm font-bold text-pine-deep"><CheckCircle2 size={16} /> {t('Resolved by Dr. Sharma')}</div>
            <div className="mt-1 text-sm text-ink-2">{t('Kept 140/90 after re-checking at the health post. Every phone receives the decision.')}</div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm font-bold text-lali-deep"><GitMerge size={16} /> {t('Conflicting readings, both kept')}</div>
            <div className="mt-1 text-sm text-ink-2">{t('A blood pressure value is clinical, so the server never picks one silently. It waits for a doctor.')}</div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- pipeline diagram */

function Pipeline() {
  const node = (x, y, w, label, sub, color) => (
    <g transform={`translate(${x} ${y})`}>
      <rect width={w} height="58" rx="14" fill="#fff" stroke={color} strokeWidth="2" />
      <text x={w / 2} y="26" textAnchor="middle" fontSize="15" fontWeight="600" fill="#12203a" fontFamily="IBM Plex Sans, IBM Plex Sans Devanagari, sans-serif">{t(label)}</text>
      <text x={w / 2} y="44" textAnchor="middle" fontSize="11.5" fill="#5a6b80" fontFamily="IBM Plex Sans, IBM Plex Sans Devanagari, sans-serif">{t(sub)}</text>
    </g>
  );
  const flow = (d, color = '#0d7a68') => <path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeDasharray="6 8" className="animate-dash" markerEnd="url(#arrow)" />;
  return (
    <svg viewBox="0 0 980 360" className="h-auto w-full min-w-[720px]" role="img" aria-label={t('Data flow: phones to load balancer, two API servers coordinated by etcd, PostgreSQL primary and replica, outbox to Kafka, Spark streaming and batch, analytics dashboard.')}>
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0 0 L10 5 L0 10z" fill="#0d7a68" />
        </marker>
      </defs>
      {node(10, 150, 140, 'Phones', 'IndexedDB + outbox', '#f2a93b')}
      {node(200, 150, 130, 'nginx', 'load balancer', '#dce3ea')}
      {node(380, 90, 140, 'API 1', 'Node.js', '#0d7a68')}
      {node(380, 210, 140, 'API 2', 'Node.js', '#0d7a68')}
      {node(380, 10, 140, 'etcd ×3', 'Raft leader', '#2f6fb0')}
      {node(580, 90, 170, 'PostgreSQL', 'primary, by ward', '#12203a')}
      {node(580, 210, 170, 'PostgreSQL', 'replica (WAL)', '#5a6b80')}
      {node(580, 300, 170, 'MinIO', 'files, backups', '#dce3ea')}
      {node(800, 10, 170, 'Kafka', '4 topics, key = ward', '#d23a5f')}
      {node(800, 120, 170, 'Spark', 'stream + nightly batch', '#f2a93b')}
      {node(800, 230, 170, 'Analytics', 'dashboard tables', '#0d7a68')}
      {flow('M150 179 L196 179')}
      {flow('M330 170 C355 165 355 125 376 120')}
      {flow('M330 188 C355 195 355 235 376 240')}
      {flow('M450 86 L450 72', '#2f6fb0')}
      {flow('M520 119 L576 119')}
      {flow('M520 239 C548 239 548 130 576 128')}
      {flow('M665 148 L665 206', '#5a6b80')}
      {flow('M520 252 C545 270 555 320 576 325', '#5a6b80')}
      {flow('M750 100 C780 90 780 45 796 40', '#d23a5f')}
      {flow('M885 68 L885 116', '#d23a5f')}
      {flow('M885 178 L885 226')}
      {flow('M750 245 C775 245 775 200 796 160', '#5a6b80')}
    </svg>
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
  { icon: HardDrive, title: 'Saved on the phone', text: 'Each change is written to the phone’s database together with an entry in a change queue, in one step.' },
  { icon: RefreshCw, title: 'Syncs by itself', text: 'When a signal appears, small compressed batches are sent. Retries are safe: the server ignores duplicates.' },
  { icon: GitMerge, title: 'Merged without loss', text: 'Version vectors detect overlapping edits. Clinical readings that disagree are kept side by side for a doctor.' },
];

const ROLES = [
  { icon: Footprints, title: 'Health volunteer', color: 'bg-pine-wash text-pine', points: ['Register households and mothers', 'Record ANC visits with vitals', 'Works with no internet for days'] },
  { icon: Stethoscope, title: 'Doctor', color: 'bg-sky-wash text-sky', points: ['See high-risk pregnancies first', 'Resolve conflicting readings', 'Analytics across villages'] },
  { icon: HeartPulse, title: 'Patient', color: 'bg-lali-wash text-lali', points: ['Pregnancy week and due date', 'Next check-up and readings', 'Danger signs to watch for'] },
  { icon: ShieldCheck, title: 'Administrator', color: 'bg-marigold-wash text-marigold-deep', points: ['Users, roles and wards', 'Database failover and backups', 'Live health of every service'] },
];

const CHAPTERS = [
  ['3', 'Data models', 'JSON documents + relational tables'],
  ['4', 'Storage', 'Append-only event log, outbox'],
  ['5', 'Encoding', 'Versioned events, old apps still sync'],
  ['6', 'Replication', 'Every phone a leader; WAL replica'],
  ['7', 'Sharding', 'Partitioned by ward'],
  ['8', 'Transactions', 'Atomic write + outbox'],
  ['9', 'Faults', 'Retries, hybrid logical clocks'],
  ['10', 'Consensus', 'etcd Raft leader election'],
  ['11', 'Batch & streams', 'Kafka + Spark'],
];

const STACK = [
  { icon: Smartphone, label: 'React PWA' }, { icon: Server, label: 'Node.js' }, { icon: Database, label: 'PostgreSQL' },
  { icon: Radio, label: 'Kafka' }, { icon: Zap, label: 'Spark' }, { icon: Crown, label: 'etcd' },
  { icon: Boxes, label: 'MinIO' }, { icon: Activity, label: 'Prometheus + Grafana' },
];

export function Home() {
  const { session } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [heroImage, setHeroImage] = useState(true);
  const [stepsRef, stepsSeen] = useInView({ threshold: 0.3 });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const cta = session ? { to: '/', label: t('Open the app') } : { to: '/login', label: t('Try the live demo') };

  return (
    <div className="min-h-full scroll-smooth bg-white">
      {/* ---------- top bar ---------- */}
      <header className={cx('fixed inset-x-0 top-0 z-40 transition-all duration-300',
        scrolled ? 'bg-ink/90 shadow-lg backdrop-blur-md' : 'bg-transparent')}>
        <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-6 px-5 text-white md:px-8">
          <Link to="/home" className="flex items-center gap-2.5 text-white no-underline">
            <img src="/favicon.svg" alt="" className="size-9 rounded-xl ring-1 ring-white/20" />
            <strong className="font-condensed text-lg font-semibold">RuralHealth Sync</strong>
          </Link>
          <nav className="hidden items-center gap-1 text-sm font-semibold md:flex" aria-label={t('Sections')}>
            {[['#problem', 'The problem'], ['#how', 'How it works'], ['#roles', 'Who uses it'], ['#tech', 'Technology']].map(([href, l]) => (
              <a key={href} href={href} className="rounded-full px-3.5 py-2 text-white/75 no-underline transition-colors hover:bg-white/10 hover:text-white">{t(l)}</a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher tone="dark" />
            {!session && <Button as={Link} to="/login?mode=signup" variant="glass" size="sm" className="hidden h-9 px-4 sm:inline-flex">{t('Create account')}</Button>}
            <Button as={Link} to={cta.to} variant="accent" size="sm" className="h-9 px-4">{session ? t('Open the app') : t('Sign in')}</Button>
          </div>
        </div>
      </header>

      {/* ---------- hero ---------- */}
      <section className="relative overflow-hidden bg-brand pt-28 pb-24 text-white md:pt-36 md:pb-32">
        {heroImage && (
          <img src="/images/hero.jpg" alt="" onError={() => setHeroImage(false)}
            className="absolute inset-0 h-full w-full object-cover opacity-30 mix-blend-luminosity" />
        )}
        <span aria-hidden className="absolute -top-32 -left-24 size-[420px] animate-aurora rounded-full bg-mint/20 blur-3xl" />
        <span aria-hidden className="absolute top-40 -right-32 size-[460px] animate-aurora rounded-full bg-marigold/15 blur-3xl [animation-delay:-8s]" />
        {STARS.map((s, i) => (
          <span key={i} aria-hidden className="absolute animate-twinkle rounded-full bg-white" style={{ left: s.left, top: s.top, width: s.s, height: s.s, animationDelay: s.d }} />
        ))}
        <svg aria-hidden className="absolute inset-x-0 bottom-0 h-40 w-full md:h-56" viewBox="0 0 1200 220" preserveAspectRatio="none">
          <path d="M0 150 L120 90 L220 130 L360 40 L470 120 L560 80 L700 140 L820 50 L930 110 L1040 70 L1200 120 L1200 220 L0 220Z" fill="#26426a" />
          <path d="M0 180 L160 140 L300 170 L460 120 L620 175 L780 140 L950 175 L1200 145 L1200 220 L0 220Z" fill="#0b5a4e" />
          <path d="M0 205 C200 185 420 200 620 192 S1000 185 1200 198 L1200 220 L0 220Z" fill="#ffffff" />
        </svg>

        <div className="relative mx-auto grid max-w-[1200px] items-center gap-14 px-5 md:px-8 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[13px] text-white/85 backdrop-blur">
                <Signal size={14} className="text-mint" /> {t('Local-first health records for rural South Asia')}
              </span>
            </Reveal>
            <Reveal delay={100}>
              <h1 className="mt-5 max-w-[16ch] font-condensed text-[42px] leading-[1.02] font-semibold tracking-tight md:text-[64px]">
                {t('Every reading saved, even where the signal never reaches.')}
              </h1>
            </Reveal>
            <Reveal delay={200}>
              <p className="mt-5 max-w-[52ch] text-lg text-white/80">
                {t('RuralHealth Sync lets community health volunteers record mothers, pregnancies and visits with no internet, then synchronizes safely when a connection appears. When two workers disagree, both readings are kept for a doctor. Nothing is silently overwritten.')}
              </p>
            </Reveal>
            <Reveal delay={300} className="mt-8 flex flex-wrap gap-3">
              <Button as={Link} to={cta.to} variant="accent" className="h-12 px-6 text-base">{cta.label}</Button>
              <Button as="a" href="#how" variant="glass" className="h-12 px-6 text-base"><ArrowDown size={18} /> {t('How it works')}</Button>
            </Reveal>
            <Reveal delay={400} className="mt-10 flex flex-wrap gap-x-8 gap-y-3 text-sm text-white/75">
              {['Works fully offline', 'Syncs on weak 2G', 'Installs like an app'].map((txt) => (
                <span key={txt} className="flex items-center gap-2"><CheckCircle2 size={17} className="text-mint" /> {t(txt)}</span>
              ))}
            </Reveal>
          </div>
          <Reveal delay={250}><PhoneMockup /></Reveal>
        </div>
      </section>

      {/* ---------- problem ---------- */}
      <section id="problem" className="scroll-mt-20 bg-white py-20 md:py-28">
        <div className="mx-auto max-w-[1200px] px-5 md:px-8">
          <Reveal className="max-w-[720px]">
            <h2 className="font-condensed text-[34px] leading-tight font-semibold tracking-tight md:text-[44px]">{t('Built for places the network forgets')}</h2>
            <p className="mt-4 text-lg text-ink-soft">
              {t('Female Community Health Volunteers in rural Nepal, Lady Health Workers in Pakistan and rural clinic staff in Bangladesh and Sri Lanka keep maternal and community health running in hill villages, often with no reliable connection.')}
            </p>
          </Reveal>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {PROBLEMS.map((p, i) => (
              <Reveal key={p.title} delay={i * 120}>
                <Link to={`/problems/${p.slug}`} aria-label={`${t(p.title)}: ${t('read the full explanation')}`}
                  className="group flex h-full flex-col rounded-3xl border border-line bg-paper p-7 text-ink no-underline transition-all duration-300 hover:-translate-y-1 hover:border-pine/30 hover:bg-white hover:shadow-xl focus-visible:-translate-y-1">
                  <span className="grid size-12 place-items-center rounded-2xl bg-white text-lali shadow-sm transition-transform duration-300 group-hover:scale-110"><p.icon size={22} /></span>
                  <h3 className="mt-5 text-xl font-semibold">{t(p.title)}</h3>
                  <p className="mt-2 flex-1 text-ink-soft">{t(p.text)}</p>
                  <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-pine">
                    {t('Read the full explanation')} <ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-1" />
                  </span>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- how it works ---------- */}
      <section id="how" className="relative scroll-mt-20 overflow-hidden bg-paper py-20 md:py-28">
        <div className="mx-auto max-w-[1200px] px-5 md:px-8">
          <Reveal className="mx-auto max-w-[720px] text-center">
            <h2 className="font-condensed text-[34px] leading-tight font-semibold tracking-tight md:text-[44px]">{t('How a visit travels from the village to the clinic')}</h2>
            <p className="mt-4 text-lg text-ink-soft">{t('Local first: the phone is the source of truth while offline, and the server merges everyone’s work when they reconnect.')}</p>
          </Reveal>
          <div ref={stepsRef} className="relative mt-16 grid gap-10 md:grid-cols-4 md:gap-6">
            <div aria-hidden className="absolute top-8 right-[12%] left-[12%] hidden h-1 overflow-hidden rounded-full bg-line md:block">
              <div className={cx('h-full origin-left rounded-full bg-gradient-to-r from-marigold via-pine to-mint transition-transform duration-[1800ms] ease-out', stepsSeen ? 'scale-x-100' : 'scale-x-0')} />
            </div>
            {STEPS.map((s, i) => (
              <div key={s.title} className={cx('relative text-center transition-all duration-700 ease-out', stepsSeen ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0')}
                style={{ transitionDelay: `${300 + i * 350}ms` }}>
                <div className="relative mx-auto grid size-16 place-items-center rounded-2xl bg-white text-pine shadow-lg ring-4 ring-paper">
                  <s.icon size={26} />
                  <span className="absolute -top-2 -right-2 grid size-7 place-items-center rounded-full bg-ink text-xs font-bold text-white">{i + 1}</span>
                </div>
                <h3 className="mt-5 text-lg font-semibold">{t(s.title)}</h3>
                <p className="mx-auto mt-2 max-w-[30ch] text-[15px] text-ink-soft">{t(s.text)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- conflict showcase ---------- */}
      <section className="relative overflow-hidden bg-brand py-20 text-white md:py-28">
        <span aria-hidden className="absolute -bottom-40 -left-20 size-[420px] animate-aurora rounded-full bg-mint/15 blur-3xl" />
        <div className="relative mx-auto grid max-w-[1200px] items-center gap-14 px-5 md:px-8 lg:grid-cols-2">
          <Reveal>
            <h2 className="font-condensed text-[34px] leading-tight font-semibold tracking-tight md:text-[44px]">{t('Two readings. Nothing lost.')}</h2>
            <p className="mt-4 text-lg text-white/80">
              {t('Sita and Gita both visit the same mother while offline and record different blood pressures. A naive app keeps whichever phone syncs last. RuralHealth Sync notices that neither worker saw the other’s reading and keeps both.')}
            </p>
            <ul className="mt-6 space-y-3 text-white/85">
              {['Version vectors tell concurrent edits apart from corrections', 'Clinical fields are never chosen automatically', 'Phone numbers and notes settle by hybrid logical clock, the same on every device', 'Every decision is recorded in an audit log'].map((txt) => (
                <li key={txt} className="flex gap-3"><CheckCircle2 size={20} className="mt-0.5 flex-none text-mint" /> {t(txt)}</li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={150}><ConflictDemo /></Reveal>
        </div>
      </section>

      {/* ---------- roles ---------- */}
      <section id="roles" className="scroll-mt-20 bg-white py-20 md:py-28">
        <div className="mx-auto max-w-[1200px] px-5 md:px-8">
          <Reveal className="max-w-[720px]">
            <h2 className="font-condensed text-[34px] leading-tight font-semibold tracking-tight md:text-[44px]">{t('One record, four kinds of users')}</h2>
            <p className="mt-4 text-lg text-ink-soft">{t('Each person sees what they need. Volunteers only see their own ward, and patients only their own record.')}</p>
          </Reveal>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {ROLES.map((r, i) => (
              <Reveal key={r.title} delay={i * 100}>
                <div className="group h-full rounded-3xl border border-line p-6 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl">
                  <span className={cx('grid size-12 place-items-center rounded-2xl transition-transform duration-300 group-hover:rotate-[-6deg] group-hover:scale-110', r.color)}><r.icon size={22} /></span>
                  <h3 className="mt-5 text-lg font-semibold">{t(r.title)}</h3>
                  <ul className="mt-3 space-y-2 text-[15px] text-ink-soft">
                    {r.points.map((p) => <li key={p} className="flex gap-2"><span className="mt-2 size-1.5 flex-none rounded-full bg-pine" />{t(p)}</li>)}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- technology ---------- */}
      <section id="tech" className="scroll-mt-20 bg-paper py-20 md:py-28">
        <div className="mx-auto max-w-[1200px] px-5 md:px-8">
          <Reveal className="max-w-[760px]">
            <h2 className="font-condensed text-[34px] leading-tight font-semibold tracking-tight md:text-[44px]">{t('A small distributed big data system')}</h2>
            <p className="mt-4 text-lg text-ink-soft">
              {t('Built on the ideas of Designing Data-Intensive Applications: replication, partitioning, transactions, consensus, and batch and stream processing, each with a concrete job in the system.')}
            </p>
          </Reveal>
          <Reveal delay={100} className="mt-10 overflow-x-auto rounded-3xl border border-line bg-white p-5 shadow-sm md:p-8">
            <Pipeline />
          </Reveal>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CHAPTERS.map(([n, title, d], i) => (
              <Reveal key={n} delay={i * 60}>
                <div className="flex h-full items-center gap-4 rounded-2xl border border-line bg-white px-4 py-3.5 transition-colors hover:border-pine/40">
                  <span className="grid size-11 flex-none place-items-center rounded-xl bg-ink font-condensed text-lg font-semibold text-white">{num(n)}</span>
                  <div><div className="font-semibold">{t(title)}</div><div className="text-sm text-ink-soft">{t(d)}</div></div>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={150} className="mt-10 flex flex-wrap justify-center gap-2.5">
            {STACK.map((s) => (
              <span key={s.label} className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink-2">
                <s.icon size={16} className="text-pine" /> {s.label}
              </span>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ---------- call to action ---------- */}
      <section className="bg-white py-20 md:py-24">
        <Reveal className="relative mx-5 overflow-hidden rounded-[2rem] bg-brand px-6 py-14 text-center text-white md:mx-auto md:max-w-[1100px] md:px-16">
          <span aria-hidden className="absolute -top-20 left-1/3 size-80 animate-aurora rounded-full bg-marigold/20 blur-3xl" />
          <div className="relative">
            <h2 className="font-condensed text-[32px] leading-tight font-semibold md:text-[44px]">{t('See it working')}</h2>
            <p className="mx-auto mt-3 max-w-[56ch] text-lg text-white/80">
              {t('Sign in as a health volunteer, a doctor or a patient with the demo accounts. Turn the network off from the Sync screen and keep working.')}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button as={Link} to={cta.to} variant="accent" className="h-12 px-7 text-base">{cta.label}</Button>
              {!session && <Button as={Link} to="/login?mode=signup" variant="glass" className="h-12 px-7 text-base">{t('Create an account')}</Button>}
            </div>
          </div>
        </Reveal>
      </section>

      <footer className="border-t border-line bg-white">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-4 px-5 py-8 text-sm text-ink-soft md:px-8">
          <img src="/favicon.svg" alt="" className="size-7" />
          <span><b className="text-ink">RuralHealth Sync</b>. {t('Final-semester Big Data project.')}</span>
          <span className="md:ml-auto">{t('Demo data is synthetic. Not for clinical use.')}</span>
        </div>
      </footer>
    </div>
  );
}
