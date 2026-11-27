// Detail pages for the three problems on the home page (/problems/:slug).
// Written in simple language for students, health workers and visitors.
// All pictures are drawn in code (SVG), so they load instantly and work offline.
import { useEffect } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import {
  WifiOff, BatteryLow, Users, ArrowLeft, ArrowRight, CheckCircle2, XCircle, Lightbulb, Clock, Smartphone, BookOpen, PlayCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { Button, cx } from '../components/ui.jsx';
import { Photo } from '../components/Photo.jsx';
import { PHOTOS } from '../content/photos.js';
import { t, LanguageSwitcher } from '../i18n/index.jsx';

// Translate plain text; leave numbers and readings ("120/80", "BP 140/90") untouched where there is no translation.
const tr = (s) => (typeof s === 'string' ? t(s) : s);

/* ------------------------------------------------------------------ drawing helpers */

const C = { ink: '#1c2638', soft: '#5f6878', line: '#e2dacb', paper: '#f7f3eb', pine: '#0b6f93', mint: '#7ccbe6', mari: '#eaa53c', lali: '#c22a40', sky: '#284f8a', white: '#ffffff' };
const T = ({ x, y, children, size = 15, color = C.ink, weight = 600, anchor = 'middle' }) => (
  <text x={x} y={y} fontSize={size} fill={color} fontWeight={weight} textAnchor={anchor} fontFamily="IBM Plex Sans, IBM Plex Sans Devanagari, system-ui, sans-serif">{tr(children)}</text>
);
const Arrow = ({ d, color = C.pine, dashed }) => (
  <path d={d} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeDasharray={dashed ? '7 8' : undefined} markerEnd={`url(#arrow-${color.slice(1)})`} />
);
const Defs = () => (
  <defs>
    {Object.values(C).map((c) => (
      <marker key={c} id={`arrow-${c.slice(1)}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
        <path d="M0 0 L10 5 L0 10z" fill={c} />
      </marker>
    ))}
  </defs>
);
/** A simple phone with a few lines of text on its screen. */
function Phone({ x, y, title, lines = [], tone = C.pine, off = false, scale = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <rect width="96" height="170" rx="16" fill={C.ink} />
      <rect x="7" y="16" width="82" height="140" rx="6" fill={off ? '#2b3d55' : C.white} />
      {!off && (
        <>
          <rect x="7" y="16" width="82" height="26" rx="6" fill={tone} />
          <T x={48} y={34} size={11} color={C.white}>{title}</T>
          {lines.map((l, i) => (
            <g key={i}>
              <rect x="14" y={50 + i * 25} width="68" height="19" rx="4" fill={l.fill || C.paper} />
              <T x={48} y={63 + i * 25} size={10} color={l.color || C.ink} weight={l.weight || 500}>{l.text}</T>
            </g>
          ))}
        </>
      )}
      {off && <T x={48} y={92} size={11} color="#9fb0c3">Phone off</T>}
    </g>
  );
}
function Figure({ children, caption, label }) {
  return (
    <figure className="my-8">
      <p className="mb-2 text-xs text-ink-soft sm:hidden">{t('Swipe sideways to see the whole picture →')}</p>
      <div className="overflow-x-auto rounded-3xl border border-line bg-white p-3 shadow-sm sm:overflow-hidden sm:p-5">
        {/* On phones the picture keeps a readable size and scrolls sideways inside this box. */}
        <svg viewBox="0 0 640 340" className="h-auto w-full min-w-[600px] sm:min-w-0" role="img" aria-label={t(label)}>
          <Defs />
          {children}
        </svg>
      </div>
      <figcaption className="mt-3 text-center text-sm text-ink-soft">{t(caption)}</figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ pictures */

function SignalProblemPicture() {
  const houses = [{ x: 70, y: 232 }, { x: 190, y: 214 }, { x: 310, y: 236 }];
  return (
    <Figure label="A volunteer walks between three houses with no signal; only the health post far away has signal."
      caption="Picture 1. The houses are in valleys with no signal. Only the hill near the tower has a connection.">
      <rect width="640" height="340" fill="#eaf1f7" />
      <path d="M0 170 L90 120 L170 150 L280 80 L360 140 L450 95 L560 60 L640 100 L640 340 L0 340Z" fill="#c9d8e6" />
      <path d="M0 250 C120 220 220 200 330 225 S520 200 640 170 L640 340 L0 340Z" fill="#9ec9b7" />
      {/* tower */}
      <path d="M560 95 L572 50 L584 95 M565 78 L579 78" stroke={C.ink} strokeWidth="3" fill="none" />
      {[12, 24, 36].map((r) => <path key={r} d={`M${572 - r} ${48 - r / 3} A${r} ${r} 0 0 1 ${572 + r} ${48 - r / 3}`} stroke={C.pine} strokeWidth="2.5" fill="none" opacity={0.95 - r / 70} />)}
      <T x={572} y={115} size={13} color={C.pine}>Signal tower</T>
      {/* health post */}
      <g transform="translate(470 150)">
        <rect width="70" height="40" rx="4" fill={C.white} stroke={C.ink} strokeWidth="2" />
        <path d="M30 10 h10 v8 h8 v10 h-8 v8 h-10 v-8 h-8 v-10 h8z" fill={C.lali} transform="scale(.7) translate(20 4)" />
        <T x={35} y={60} size={13}>Health post</T>
        <T x={35} y={77} size={12} color={C.pine}>4 bars</T>
      </g>
      {/* houses with no signal */}
      {houses.map((h, i) => (
        <g key={i} transform={`translate(${h.x} ${h.y})`}>
          <rect x="0" y="0" width="44" height="30" fill="#f4e9d6" stroke={C.ink} strokeWidth="1.5" />
          <path d="M-5 2 L22 -18 L49 2Z" fill="#9b1c36" />
          <g transform="translate(12 -50)">
            {[6, 11, 16, 21].map((hgt, k) => <rect key={k} x={k * 6} y={22 - hgt} width="4" height={hgt} fill={C.lali} opacity={k === 0 ? 0.9 : 0.25} />)}
            <path d="M-2 -2 L26 24" stroke={C.lali} strokeWidth="2.5" />
          </g>
          <T x={22} y={50} size={12} color={C.lali}>No signal</T>
        </g>
      ))}
      <path d="M30 312 C150 296 270 312 380 304 S520 296 560 250" fill="none" stroke={C.ink} strokeWidth="2" strokeDasharray="4 7" opacity=".5" />
      <circle cx="160" cy="303" r="9" fill={C.mari} stroke={C.ink} strokeWidth="2" />
      <T x={178} y={334} size={13} anchor="start">Volunteer walking</T>
    </Figure>
  );
}

function SignalSolutionPicture() {
  return (
    <Figure label="The record is saved on the phone, waits in a queue, and is sent to the server when the signal returns."
      caption="Picture 2. Save on the phone first. The waiting list sends everything by itself when the signal comes back.">
      <rect width="640" height="340" fill={C.white} />
      <Phone x={20} y={70} title="Saved" tone={C.pine} lines={[{ text: 'Sabina - ANC' }, { text: 'BP 118/78' }, { text: 'Saved on phone', color: C.pine, weight: 700 }]} />
      <T x={68} y={265} size={14}>1. Save on phone</T>
      <T x={68} y={284} size={12} color={C.soft} weight={500}>works with no signal</T>
      <Arrow d="M125 155 L185 155" />
      <g transform="translate(195 85)">
        <rect width="150" height="140" rx="14" fill={C.paper} stroke={C.mari} strokeWidth="2.5" />
        <T x={75} y={26} size={13} color={C.ink}>Waiting list</T>
        {['Visit - Sabina', 'New patient - Laxmi', 'Visit - Puja'].map((t, i) => (
          <g key={t}>
            <rect x="12" y={40 + i * 31} width="126" height="24" rx="5" fill="#fef3e0" />
            <T x={75} y={57 + i * 31} size={11} color="#9a5f06" weight={500}>{t}</T>
          </g>
        ))}
      </g>
      <T x={270} y={265} size={14}>2. Wait in a queue</T>
      <T x={270} y={284} size={12} color={C.soft} weight={500}>nothing is lost</T>
      <Arrow d="M355 155 L445 155" color={C.mari} dashed />
      <T x={400} y={140} size={12} color="#9a5f06">signal back</T>
      <g transform="translate(455 95)">
        <path d="M30 70 a30 30 0 0 1 10 -58 a40 40 0 0 1 75 10 a28 28 0 0 1 20 48z" fill="#e5eff9" stroke={C.sky} strokeWidth="2.5" />
        <rect x="35" y="80" width="90" height="46" rx="6" fill={C.ink} />
        <circle cx="50" cy="96" r="4" fill={C.mint} /><circle cx="50" cy="112" r="4" fill={C.mint} />
        <T x={90} y={100} size={11} color={C.white}>Server</T>
        <T x={90} y={116} size={10} color={C.mint}>3 received</T>
      </g>
      <T x={535} y={265} size={14}>3. Send by itself</T>
      <T x={535} y={284} size={12} color={C.soft} weight={500}>marked "sent" only after OK</T>
    </Figure>
  );
}

function Battery({ x, y, level, label, sub, charging }) {
  const color = level > 50 ? C.pine : level > 15 ? C.mari : C.lali;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width="96" height="46" rx="8" fill={C.white} stroke={C.ink} strokeWidth="3" />
      <rect x="96" y="14" width="8" height="18" rx="2" fill={C.ink} />
      <rect x="6" y="6" width={Math.max(2, (84 * level) / 100)} height="34" rx="4" fill={color} />
      {charging && <path d="M52 8 L40 26 L50 26 L44 40 L58 20 L48 20Z" fill={C.mari} stroke={C.ink} strokeWidth="1.5" />}
      <T x={48} y={74} size={14}>{label}</T>
      <T x={48} y={93} size={12} color={C.soft} weight={500}>{sub}</T>
    </g>
  );
}

function PowerProblemPicture() {
  return (
    <Figure label="Over three days the phone battery goes from full to empty because there is no electricity."
      caption="Picture 3. No electricity for days: the battery runs out, the phone switches off, and it may not reach a server for a long time.">
      <rect width="640" height="340" fill="#fbf7ef" />
      <T x={320} y={40} size={17}>Three days without electricity</T>
      <Battery x={30} y={90} level={90} label="Day 1, morning" sub="Full, 12 visits saved" />
      <Arrow d="M150 113 L178 113" color={C.soft} />
      <Battery x={190} y={90} level={45} label="Day 2" sub="No power to charge" />
      <Arrow d="M310 113 L338 113" color={C.soft} />
      <Battery x={350} y={90} level={6} label="Day 3" sub="Almost empty" />
      <Arrow d="M470 113 L498 113" color={C.soft} />
      <Phone x={520} y={70} off scale={0.62} />
      <T x={550} y={200} size={14} color={C.lali}>Switched off</T>
      <g transform="translate(70 240)">
        <rect width="500" height="62" rx="12" fill={C.white} stroke={C.lali} strokeWidth="2" />
        <T x={250} y={27} size={14} color={C.lali}>The big question</T>
        <T x={250} y={48} size={13} color={C.ink} weight={500}>Are the 12 visits still there when the phone is switched on again?</T>
      </g>
    </Figure>
  );
}

function PowerSolutionPicture() {
  return (
    <Figure label="Records are stored in the phone's permanent storage, so after a restart they are still there and sync later."
      caption="Picture 4. Records live in the phone's permanent storage, not in its short-term memory, so a dead battery does not erase them.">
      <rect width="640" height="340" fill={C.white} />
      <Phone x={30} y={60} title="Before" tone={C.pine} lines={[{ text: '12 visits saved' }, { text: '12 waiting to sync', color: '#9a5f06' }, { text: 'Battery 6%', color: C.lali }]} />
      <Arrow d="M135 145 L185 145" color={C.soft} />
      <Phone x={195} y={60} off />
      <T x={243} y={255} size={13} color={C.soft} weight={500}>battery dead</T>
      <Arrow d="M300 145 L350 145" color={C.soft} />
      <Phone x={360} y={60} title="Charged" tone={C.pine} lines={[{ text: '12 visits still here', color: C.pine, weight: 700 }, { text: '12 waiting to sync', color: '#9a5f06' }, { text: 'Signal found' }]} />
      <Arrow d="M465 145 L515 145" />
      <g transform="translate(520 95)">
        <rect width="104" height="100" rx="14" fill={C.paper} stroke={C.pine} strokeWidth="2.5" />
        <circle cx="52" cy="38" r="20" fill={C.pine} />
        <path d="M42 38 l7 7 l14 -14" stroke={C.white} strokeWidth="4" fill="none" strokeLinecap="round" />
        <T x={52} y={80} size={12} color={C.pine}>All 12 synced</T>
      </g>
      <g transform="translate(40 280)">
        <rect width="560" height="44" rx="10" fill="#e0f2ee" />
        <T x={280} y={27} size={13} color={C.pine}>Saved in the phone's database (IndexedDB) = kept even when the phone turns off</T>
      </g>
    </Figure>
  );
}

function SharedProblemPicture() {
  return (
    <Figure label="Sita records 120/80 and Gita records 140/90 for the same mother; a simple app keeps only the last one and loses the other."
      caption="Picture 5. Two workers, two different readings, one mother. A simple app keeps the last one to arrive and throws the other away without telling anyone.">
      <rect width="640" height="340" fill={C.white} />
      <Phone x={20} y={30} title="Sita, 10:12" tone={C.sky} lines={[{ text: 'Sabina' }, { text: 'BP 120/80', weight: 700 }, { text: 'offline', color: C.soft }]} scale={0.95} />
      <Phone x={20} y={200} title="Gita, 10:40" tone="#5a4a8a" lines={[{ text: 'Sabina' }, { text: 'BP 140/90', weight: 700 }]} scale={0.75} />
      <Arrow d="M120 110 C200 110 220 160 270 165" color={C.sky} />
      <Arrow d="M100 265 C200 265 220 190 270 180" color="#5a4a8a" />
      <g transform="translate(280 120)">
        <rect width="120" height="90" rx="12" fill={C.ink} />
        <T x={60} y={30} size={13} color={C.white}>Simple app</T>
        <T x={60} y={52} size={11} color="#b8c5d3" weight={500}>"last one wins"</T>
        <T x={60} y={72} size={11} color="#b8c5d3" weight={500}>keeps one value</T>
      </g>
      <Arrow d="M410 165 L460 165" color={C.soft} />
      <g transform="translate(470 70)">
        <rect width="150" height="200" rx="14" fill={C.paper} stroke={C.lali} strokeWidth="2" />
        <T x={75} y={30} size={13}>Sabina's record</T>
        <rect x="15" y="48" width="120" height="36" rx="6" fill={C.white} stroke={C.line} />
        <T x={75} y={72} size={16}>BP 140/90</T>
        <rect x="15" y="98" width="120" height="36" rx="6" fill="#fce8ed" />
        <T x={75} y={122} size={16} color={C.lali}>120/80</T>
        <path d="M30 116 L120 116" stroke={C.lali} strokeWidth="2.5" />
        <T x={75} y={160} size={13} color={C.lali}>Lost, no warning</T>
        <T x={75} y={180} size={11} color={C.soft} weight={500}>nobody knows it existed</T>
      </g>
    </Figure>
  );
}

function SharedSolutionPicture() {
  return (
    <Figure label="Sewika keeps both readings and shows them side by side; a doctor chooses the correct one and every phone gets the decision."
      caption="Picture 6. Sewika notices that neither worker saw the other's reading, keeps both, and lets a doctor decide.">
      <rect width="640" height="340" fill={C.white} />
      <g transform="translate(20 50)">
        <rect width="250" height="210" rx="14" fill="#fce8ed" stroke={C.lali} strokeWidth="2" />
        <T x={125} y={32} size={14} color="#95192d">Conflicting readings, both kept</T>
        {[['120/80', 'Sita, 10:12, phone A'], ['140/90', 'Gita, 10:40, phone B']].map(([v, who], i) => (
          <g key={v} transform={`translate(15 ${50 + i * 74})`}>
            <rect width="220" height="62" rx="8" fill={C.white} stroke={C.line} />
            <T x={110} y={28} size={19}>{v}</T>
            <T x={110} y={48} size={11} color={C.soft} weight={500}>{who}</T>
          </g>
        ))}
      </g>
      <Arrow d="M280 155 L340 155" />
      <g transform="translate(350 85)">
        <circle cx="50" cy="40" r="32" fill="#e5eff9" />
        <circle cx="50" cy="32" r="12" fill={C.sky} />
        <path d="M28 62 a22 18 0 0 1 44 0" fill={C.sky} />
        <T x={50} y={100} size={13}>Doctor checks again</T>
        <T x={50} y={118} size={12} color={C.soft} weight={500}>and picks 140/90</T>
      </g>
      <Arrow d="M460 155 L510 155" />
      <g transform="translate(515 85)">
        <rect width="110" height="140" rx="14" fill="#e0f2ee" stroke={C.pine} strokeWidth="2" />
        <circle cx="55" cy="40" r="20" fill={C.pine} />
        <path d="M45 40 l7 7 l14 -14" stroke={C.white} strokeWidth="4" fill="none" strokeLinecap="round" />
        <T x={55} y={86} size={12} color={C.pine}>Decision sent</T>
        <T x={55} y={104} size={12} color={C.pine}>to every phone</T>
        <T x={55} y={124} size={11} color={C.soft} weight={500}>+ saved in audit log</T>
      </g>
      <T x={320} y={300} size={14} color={C.ink}>Nothing is thrown away. A person, not the computer, decides medical values.</T>
    </Figure>
  );
}

/* ------------------------------------------------------------------ content */

const PROBLEMS = {
  signal: {
    n: 1, icon: WifiOff, color: 'text-sky', title: 'The signal comes and goes',
    summary: 'In hill villages the mobile signal is weak or missing for hours. An app that needs the internet for every tap stops working exactly where health workers need it most.',
    simple: [
      'Most apps you use every day, like social media or online banking, need the internet all the time. When you press "Save", the app sends your data to a server far away and waits for an answer. If there is no signal, you see a spinning circle or an error, and your work is not saved.',
      'Female Community Health Volunteers (FCHVs) in rural Nepal walk from house to house, often in valleys and on hillsides. In many of these places there is only weak 2G, it comes and goes, or there is no signal at all. The signal may be good only near the health post or on top of a hill.',
      'So the problem is simple: the health worker has work to record right now, at the house of the mother, but the internet is not there right now.',
    ],
    day: [
      ['8:00', 'Sita leaves the health post. The signal is good here.'],
      ['9:15', 'First house, in the valley. Signal: none. She checks a pregnant mother\'s blood pressure.'],
      ['10:30', 'Second house. Signal: one bar, then nothing. She registers a new baby.'],
      ['12:00', 'Third house on the hill. Signal: 2G for a few minutes, then gone again.'],
      ['15:00', 'Back at the health post. Signal is good again.'],
    ],
    fail: [
      'The "Save" button does not work without internet, so the worker writes on paper and types it later (double work, and mistakes happen).',
      'Half-sent data: the signal drops in the middle of sending, and the app does not know if the server received it.',
      'The worker cannot see a patient\'s history at the house, because loading it needs the internet.',
      'Slow 2G makes every screen take a long time to open, so people stop using the app.',
    ],
    risks: [
      ['Lost information', 'A danger sign written on paper may never reach the doctor.'],
      ['Late care', 'A high-risk pregnancy is noticed days later instead of today.'],
      ['Wrong totals', 'Reports for the municipality are missing visits that really happened.'],
    ],
    ProblemPic: SignalProblemPicture,
    SolutionPic: SignalSolutionPicture,
    solution: [
      ['Save on the phone first', 'Every screen reads and writes to a small database inside the phone (called IndexedDB). Pressing "Save" is instant, signal or no signal.'],
      ['Keep a waiting list', 'Each change is also written to a waiting list (we call it the "outbox"). It is saved in the same step as the record, so one is never saved without the other.'],
      ['Send by itself when the signal returns', 'The app checks every 20 seconds and whenever the phone gets a connection. It sends waiting changes in small packets and compresses them, so even weak 2G is enough.'],
      ['Only mark "sent" after the server says OK', 'If the signal drops half-way, the change simply stays in the waiting list and is sent again later. The server recognises a repeated change by its unique ID and never saves it twice.'],
      ['The app itself opens offline', 'After the first visit, the app\'s screens are stored on the phone (by a "service worker"), so it opens even with no internet at all.'],
    ],
    tryIt: [
      'Sign in as the health worker Sita (username sita, password fchv123).',
      'Open "Sync status" and set the network simulator to "Offline". A yellow bar appears at the top.',
      'Register a new patient or record a visit. It saves at once and shows "Not synced".',
      'Look at "Waiting to sync" on the Sync status page: your change is in the queue.',
      'Switch the simulator back to "Real network". Within a few seconds the change is sent and the count goes back to 0.',
      'Try "2G" or "Flaky" too: it is slower, but nothing is lost.',
    ],
    words: [
      ['Offline-first', 'The app is built to work without internet first. The internet is used only to share data when it is available.'],
      ['Sync', 'Short for synchronise: making the phone and the server have the same, up-to-date data.'],
      ['Outbox / waiting list', 'The list of changes saved on the phone that the server has not confirmed yet.'],
      ['IndexedDB', 'A database built into every modern phone browser. Data stays there after closing the app.'],
      ['Service worker', 'A small helper program that keeps a copy of the app\'s screens on the phone so the app opens offline.'],
    ],
    remember: 'Save on the phone first, send to the server later. The worker never waits for the internet.',
  },

  power: {
    n: 2, icon: BatteryLow, color: 'text-marigold-deep', title: 'Power cuts that last days',
    summary: 'In many rural areas there is no electricity for long periods. Phones run out of battery and may not reach a server for days. Every record must survive restarts and flat batteries.',
    simple: [
      'In some villages electricity is cut for many hours, and after storms or landslides it can be gone for days. Health workers may charge their phone only once in a while, from a solar panel or at the health post.',
      'This means two things. First, the phone may be switched off or restart many times before it ever reaches a server. Second, the phone may stay without internet for days, so the records have to wait on the phone safely for a long time.',
      'If an app keeps data only in short-term memory, or only "in the cloud", then a flat battery or a restart can wipe out a whole day of work.',
    ],
    day: [
      ['Monday', 'Power cut in the morning. Phone at 90%. Gita records 12 visits.'],
      ['Tuesday', 'Still no power. Phone at 45%. She turns the screen brightness down and continues.'],
      ['Wednesday', 'Battery at 6%. The phone switches itself off in the evening.'],
      ['Thursday', 'Power returns. She charges the phone and opens the app. Are the 12 visits still there?'],
      ['Friday', 'She walks to the health post with signal. Everything should now reach the server.'],
    ],
    fail: [
      'Data kept only in the app\'s short-term memory is erased when the phone switches off.',
      'Some apps clear their saved data if the phone is low on storage, without asking.',
      'Apps that "save to the cloud" show an error and drop the work when there is no connection.',
      'If the person signs out to save battery, many apps need the internet to sign in again.',
    ],
    risks: [
      ['A day of work gone', 'Twelve visits must be done again or are simply forgotten.'],
      ['Trust is broken', 'If the app loses data once, workers go back to paper.'],
      ['Gaps in health history', 'A missing pregnancy check can hide a danger sign at the next visit.'],
    ],
    ProblemPic: PowerProblemPicture,
    SolutionPic: PowerSolutionPicture,
    solution: [
      ['Permanent storage on the phone', 'Records are saved in the phone\'s database (IndexedDB), which keeps data after the app closes, the phone restarts or the battery dies.'],
      ['Ask the phone to protect our data', 'The app asks the browser for "persistent storage", so the phone does not delete our data when space is low.'],
      ['The waiting list survives too', 'Unsent changes are stored in the same database. After a restart the app picks up exactly where it stopped and sends them when it can, even days later.'],
      ['Sign in without internet', 'After one normal sign-in, the phone keeps a safe, scrambled check of the password (not the password itself). The same person can sign in again with no signal.'],
      ['Safe on a shared phone', 'If a different person tries to sign in while there are still unsent changes, the app refuses until they are synced, so one person\'s work is never wiped by another.'],
    ],
    tryIt: [
      'Sign in as Gita (username gita, password fchv123) and set the network simulator to "Offline".',
      'Record two or three visits. Each one shows "Not synced".',
      'Close the browser completely (or restart the phone), then open the app again, still offline.',
      'Your visits and the waiting count are still there. You can even sign out and sign in again offline.',
      'Go back online. The waiting changes are sent by themselves.',
    ],
    words: [
      ['Persistent storage', 'Storage that is kept until the app itself deletes it, even after a restart.'],
      ['Restart-safe', 'The app returns to the same state after the phone switches off and on.'],
      ['Offline sign-in', 'Signing in using a scrambled copy of your password saved on the phone after your first online sign-in.'],
      ['Hash', 'A one-way scramble of a password. It can check a password but cannot be turned back into it.'],
    ],
    remember: 'A flat battery can stop the phone, but it cannot erase the records. They wait safely and sync later.',
  },

  'shared-records': {
    n: 3, icon: Users, color: 'text-lali', title: 'Two workers, one family',
    summary: 'Two health workers can visit the same family and update the same record while both are offline. A simple app keeps only the last update and silently throws the other away.',
    simple: [
      'Families do not belong to just one person. A volunteer may visit a pregnant mother in the morning, and another volunteer or a nurse may see her in the afternoon. Both of them can open the same record and change it.',
      'When both phones are offline, neither phone knows what the other one did. Later, when the phones sync, the server receives two different values for the same thing, for example two different blood pressure readings.',
      'Most simple offline apps use a rule called "last write wins": whichever phone syncs last overwrites the other. The first reading disappears and nobody is told. For medical data this is dangerous, because the lost reading might be the important one.',
    ],
    day: [
      ['10:12', 'Sita visits Sabina, offline. Blood pressure 120/80. Saved on Sita\'s phone.'],
      ['10:40', 'Gita also visits Sabina, offline. Blood pressure 140/90 (high!). Saved on Gita\'s phone.'],
      ['15:00', 'Sita reaches signal first and syncs: the server has 120/80.'],
      ['17:30', 'Gita syncs later. A simple app now replaces 120/80 with 140/90. Or the other way round, if Sita syncs last, the high reading 140/90 is lost.'],
      ['Next day', 'The doctor sees only one number and does not know there was a second, different one.'],
    ],
    fail: [
      '"Last write wins" keeps one value and throws the other away without any warning.',
      'Phone clocks are often wrong, so "last" by time can even pick the older reading.',
      'Merging the whole record at once can also undo changes to other fields, like the phone number.',
      'Nobody can see later who recorded what, on which phone, and when.',
    ],
    risks: [
      ['A danger sign disappears', 'If the high blood pressure reading is the one that is lost, a risk of pre-eclampsia can be missed.'],
      ['Wrong treatment', 'Decisions are made using only one of two different measurements.'],
      ['No accountability', 'Without history, mistakes cannot be found or explained later.'],
    ],
    ProblemPic: SharedProblemPicture,
    SolutionPic: SharedSolutionPicture,
    solution: [
      ['Every change remembers what the writer had seen', 'Each change carries a small "version vector": a note of which changes this phone had already received. The server can then tell if the two workers saw each other\'s work or not.'],
      ['Field by field, not the whole record', 'The server compares each field (blood pressure, phone number, village...) separately. Changing the phone number never undoes someone else\'s blood pressure.'],
      ['Clinical values are never chosen by the computer', 'If two people changed a clinical value (blood pressure, hemoglobin, risk level, allergies and others) without seeing each other\'s change, the server keeps BOTH and marks a "conflict".'],
      ['A doctor decides', 'Doctors see both readings side by side with who, when and on which phone. They keep one or enter a new measurement, with a note. Every phone receives the decision on its next sync.'],
      ['Simple fields settle by themselves', 'For non-medical fields like a phone number, the newest change wins using a special clock (a hybrid logical clock) that stays correct even when phone clocks are wrong.'],
      ['Everything is recorded', 'Each change and each decision is stored in a log, so you can always see the history.'],
    ],
    tryIt: [
      'Open two browser windows: a normal one and a private/incognito one (like two different phones).',
      'Sign in as Sita in one window and Gita in the other. Open the same pregnant mother in both.',
      'In both windows set the network simulator to "Offline".',
      'Sita: update the pregnancy with BP 118/78. Gita: update it with BP 152/98.',
      'Set both back to "Real network". Open "Conflicting readings": both values are shown.',
      'Sign in as the doctor (supervisor / super123), keep one reading, add a note and resolve.',
      'For comparison, an admin can switch "Conflict handling mode" to "Naive overwrite" and repeat: one reading disappears.',
    ],
    words: [
      ['Conflict', 'Two different values for the same field, written by people who had not seen each other\'s change.'],
      ['Last write wins', 'A simple rule that keeps the newest value and deletes the others.'],
      ['Version vector', 'A short list that records which changes a phone had already seen. It shows whether two edits happened "at the same time" (without knowing about each other).'],
      ['Hybrid logical clock', 'A clock that mixes real time with a counter, so the order of events stays correct even if a phone\'s time is wrong.'],
      ['Clinical field', 'A medical value such as blood pressure, hemoglobin, weight, risk level, danger signs or allergies.'],
    ],
    remember: 'When two workers disagree, the app keeps both readings and a doctor decides. Nothing is silently overwritten.',
  },
};
const ORDER = ['signal', 'power', 'shared-records'];
// A real photograph shown at the top of each problem page.
const PHOTO_FOR = { signal: PHOTOS.village, power: PHOTOS.terraces, 'shared-records': PHOTOS.vaccination };

/* ------------------------------------------------------------------ page */

function Section({ icon: Icon, title, children, tone = 'bg-pine-wash text-pine' }) {
  return (
    <section className="mt-12">
      <h2 className="flex items-center gap-3 font-condensed text-[26px] font-semibold tracking-tight md:text-[30px]">
        <span className={cx('grid size-10 flex-none place-items-center rounded-xl', tone)}><Icon size={20} /></span>
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function ProblemDetail() {
  const { slug } = useParams();
  const { session } = useAuth();
  const p = PROBLEMS[slug];
  useEffect(() => { window.scrollTo({ top: 0 }); }, [slug]);
  if (!p) return <Navigate to="/home#problem" replace />;

  const idx = ORDER.indexOf(slug);
  const prev = ORDER[(idx + ORDER.length - 1) % ORDER.length];
  const next = ORDER[(idx + 1) % ORDER.length];
  const { ProblemPic, SolutionPic } = p;

  return (
    <div className="min-h-full bg-white">
      <header className="sticky top-0 z-40 bg-ink/95 shadow-lg backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1000px] items-center gap-3 px-4 text-white md:px-8">
          <Link to="/home#problem" className="inline-flex items-center gap-2 text-sm font-semibold text-white/85 no-underline hover:text-white">
            <ArrowLeft size={17} /> <span className="hidden sm:inline">{t('Back to home')}</span><span className="sm:hidden">{t('Back')}</span>
          </Link>
          <span className="ml-1 hidden truncate font-condensed text-lg font-semibold sm:inline">Sewika</span>
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher tone="dark" />
            <Button as={Link} to={session ? '/' : '/login'} variant="accent" size="sm" className="h-9 px-4">{session ? t('Open the app') : t('Sign in')}</Button>
          </div>
        </div>
      </header>

      <section className="bg-brand text-white">
        <div className="mx-auto max-w-[1000px] px-4 py-12 md:px-8 md:py-16">
          <div className="grid items-center gap-8 md:grid-cols-[1.25fr_1fr]">
          <div>
          <p className="text-sm font-semibold text-mint">{t('Problem {n} of 3', { n: p.n })}</p>
          <h1 className="mt-2 flex items-center gap-3 font-serif text-[32px] leading-tight font-semibold md:text-[44px]">
            <p.icon size={28} className="flex-none text-mint" />
            {t(p.title)}
          </h1>
          <p className="mt-4 max-w-[62ch] text-lg text-white/85">{t(p.summary)}</p>
          </div>
          <Photo photo={PHOTO_FOR[slug]} tone="dark" eager imgClassName="aspect-[4/3] rounded-lg" />
          </div>
          <nav aria-label={t('On this page')} className="mt-6 flex flex-wrap gap-2 text-sm">
            {[['what', 'In simple words'], ['day', 'A day in the field'], ['why', 'Why apps fail'], ['solve', 'How we solve it'], ['try', 'Try it yourself'], ['words', 'Words to know']].map(([id, label]) => (
              <a key={id} href={`#${id}`} className="rounded-full border border-white/20 px-3 py-1.5 text-white/85 no-underline hover:bg-white/10">{t(label)}</a>
            ))}
          </nav>
        </div>
      </section>

      <main className="mx-auto max-w-[1000px] px-4 pb-20 md:px-8">
        <div id="what" className="scroll-mt-20">
          <Section icon={BookOpen} title={t('The problem in simple words')}>
            <div className="space-y-4 text-[17px] leading-relaxed text-ink-2">
              {p.simple.map((txt) => <p key={txt.slice(0, 20)}>{t(txt)}</p>)}
            </div>
            <ProblemPic />
          </Section>
        </div>

        <div id="day" className="scroll-mt-20">
          <Section icon={Clock} title={t('A day in the field')} tone="bg-sky-wash text-sky">
            <ol className="relative ml-3 border-l-2 border-line">
              {p.day.map(([time, text]) => (
                <li key={time} className="relative py-3 pl-7">
                  <span className="absolute top-[18px] -left-[9px] size-4 rounded-full border-2 border-sky bg-white" />
                  <div className="text-sm font-semibold text-sky">{t(time)}</div>
                  <div className="text-[16px] text-ink">{t(text)}</div>
                </li>
              ))}
            </ol>
          </Section>
        </div>

        <div id="why" className="scroll-mt-20">
          <Section icon={XCircle} title={t('Why normal apps fail here')} tone="bg-lali-wash text-lali">
            <ul className="grid gap-3 md:grid-cols-2">
              {p.fail.map((txt) => (
                <li key={txt} className="flex gap-3 rounded-2xl border border-line bg-paper p-4 text-[15px]">
                  <XCircle size={20} className="mt-0.5 flex-none text-lali" /> {t(txt)}
                </li>
              ))}
            </ul>
            <h3 className="mt-8 text-lg font-semibold">{t('What can go wrong for patients')}</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {p.risks.map(([title, text]) => (
                <div key={title} className="rounded-2xl border border-[#f2c4ce] bg-lali-wash p-4">
                  <div className="font-semibold text-lali-deep">{t(title)}</div>
                  <p className="mt-1 text-sm text-ink-2">{t(text)}</p>
                </div>
              ))}
            </div>
          </Section>
        </div>

        <div id="solve" className="scroll-mt-20">
          <Section icon={CheckCircle2} title={t('How Sewika solves it')}>
            <ol className="space-y-4">
              {p.solution.map(([title, text], i) => (
                <li key={title} className="flex gap-4 rounded-2xl border border-line p-4 sm:p-5">
                  <span className="grid size-9 flex-none place-items-center rounded-full bg-pine font-semibold text-white">{i + 1}</span>
                  <div>
                    <div className="text-[17px] font-semibold">{t(title)}</div>
                    <p className="mt-1 text-[15px] leading-relaxed text-ink-2">{t(text)}</p>
                  </div>
                </li>
              ))}
            </ol>
            <SolutionPic />
          </Section>
        </div>

        <div id="try" className="scroll-mt-20">
          <Section icon={PlayCircle} title={t('Try it yourself in the app')} tone="bg-marigold-wash text-marigold-deep">
            <ol className="space-y-2.5">
              {p.tryIt.map((txt, i) => (
                <li key={txt} className="flex gap-3 text-[16px]">
                  <span className="grid size-7 flex-none place-items-center rounded-full bg-marigold text-sm font-bold text-ink">{t('{n}', { n: i + 1 })}</span>
                  <span className="pt-0.5">{t(txt)}</span>
                </li>
              ))}
            </ol>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button as={Link} to={session ? '/sync' : '/login'}><Smartphone size={17} /> {session ? t('Open Sync status') : t('Open the demo')}</Button>
            </div>
          </Section>
        </div>

        <div id="words" className="scroll-mt-20">
          <Section icon={Lightbulb} title={t('Words to know')} tone="bg-sky-wash text-sky">
            <dl className="grid gap-3 md:grid-cols-2">
              {p.words.map(([w, d]) => (
                <div key={w} className="rounded-2xl border border-line p-4">
                  <dt className="font-semibold">{t(w)}</dt>
                  <dd className="mt-1 text-[15px] text-ink-2">{t(d)}</dd>
                </div>
              ))}
            </dl>
          </Section>
        </div>

        <div className="mt-12 rounded-3xl bg-brand px-6 py-7 text-white md:px-8">
          <div className="text-sm font-semibold tracking-wide text-mint uppercase">{t('Remember in one line')}</div>
          <p className="mt-2 font-condensed text-[22px] leading-snug font-semibold md:text-[26px]">{t(p.remember)}</p>
        </div>

        <nav aria-label={t('Other problems')} className="mt-10 grid gap-3 sm:grid-cols-2">
          {[[prev, 'Previous problem', ArrowLeft], [next, 'Next problem', ArrowRight]].map(([s, label, Icon]) => (
            <Link key={label} to={`/problems/${s}`} className="group flex items-center gap-3 rounded-2xl border border-line p-4 text-ink no-underline transition-colors hover:border-pine">
              {label.startsWith('Previous') && <Icon size={18} className="text-pine" />}
              <div className={cx('flex-1', label.startsWith('Next') && 'text-right')}>
                <div className="text-xs text-ink-soft">{t(label)}</div>
                <div className="font-semibold">{t(PROBLEMS[s].title)}</div>
              </div>
              {label.startsWith('Next') && <Icon size={18} className="text-pine transition-transform group-hover:translate-x-1" />}
            </Link>
          ))}
        </nav>
      </main>
    </div>
  );
}
