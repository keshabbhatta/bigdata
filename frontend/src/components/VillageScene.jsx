// The login animation tells the whole idea of the app in one 12-second loop:
// a health volunteer (the yellow dot) walks between households with no signal,
// each visit is saved on her phone (windows light up, the counter goes up), and
// when she reaches the health post the saved records travel up to the signal
// tower and sync. Everything runs on one SVG (SMIL) timeline so it stays in step.
import { useEffect, useRef } from 'react';
import { t } from '../i18n/index.jsx';

const T = 12; // seconds per loop
const TRAIL = 'M40 512 L95 500 L150 494 L190 486 L240 476 L300 470 L345 480 L395 494 L450 502 L495 494 L545 480 L610 468';
const HOUSES = [{ x: 150, y: 494, at: 0.12 }, { x: 300, y: 470, at: 0.30 }, { x: 450, y: 502, at: 0.48 }];
const PHASES = [
  { text: 'Offline. Walking to the first household', from: 0, to: 0.12, tone: 'off' },
  { text: 'Offline. 1 visit saved on the phone', from: 0.12, to: 0.30, tone: 'off' },
  { text: 'Offline. 2 visits saved on the phone', from: 0.30, to: 0.48, tone: 'off' },
  { text: 'Offline. 3 visits saved on the phone', from: 0.48, to: 0.68, tone: 'off' },
  { text: 'Signal at the health post. Syncing…', from: 0.68, to: 0.86, tone: 'sync' },
  { text: 'Synced. Nothing was lost.', from: 0.86, to: 1, tone: 'done' },
];
// Deterministic "random" stars.
const STARS = Array.from({ length: 34 }, (_, i) => ({
  x: (i * 137.5) % 800, y: 20 + ((i * 89.3) % 250), r: i % 5 === 0 ? 1.6 : 1, d: 3 + (i % 5),
}));

const discrete = (values, keyTimes) => ({ values: values.join(';'), keyTimes: keyTimes.join(';'), calcMode: 'discrete' });

export function VillageScene() {
  const ref = useRef(null);
  useEffect(() => {
    const svg = ref.current;
    if (svg && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      svg.setCurrentTime(T * 0.95); // show the calm "synced" state
      svg.pauseAnimations();
    }
  }, []);

  return (
    <svg ref={ref} className="absolute inset-x-0 bottom-0 h-[58%] w-full md:h-[64%]" viewBox="0 0 800 600"
      preserveAspectRatio="xMinYMax slice" role="img"
      aria-label={t('A health volunteer visits three households offline, then her records sync at the health post.')}>
      <defs>
        <radialGradient id="glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#E9A23B" stopOpacity=".55" />
          <stop offset="100%" stopColor="#E9A23B" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="near" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#11796a" />
          <stop offset="100%" stopColor="#0a5247" />
        </linearGradient>
      </defs>

      {/* stars */}
      {STARS.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#EEF2F5" opacity=".5">
          <animate attributeName="opacity" values=".15;.8;.15" dur={`${s.d}s`} begin={`${(i % 7) * 0.4}s`} repeatCount="indefinite" />
        </circle>
      ))}

      {/* drifting clouds */}
      {[{ y: 150, d: 70, s: 1 }, { y: 225, d: 95, s: 0.7 }].map((c, i) => (
        <g key={i} opacity=".07" fill="#fff">
          <animateTransform attributeName="transform" type="translate" from={`${-260 - i * 300} 0`} to="900 0" dur={`${c.d}s`} repeatCount="indefinite" />
          <ellipse cx="0" cy={c.y} rx={90 * c.s} ry={18 * c.s} />
          <ellipse cx={50 * c.s} cy={c.y - 12 * c.s} rx={60 * c.s} ry={20 * c.s} />
          <ellipse cx={-55 * c.s} cy={c.y - 6 * c.s} rx={45 * c.s} ry={14 * c.s} />
        </g>
      ))}

      {/* far mountains with snow */}
      <path d="M0 350 L80 300 L150 330 L250 230 L330 300 L400 262 L480 320 L580 210 L650 282 L720 250 L800 296 L800 600 L0 600Z" fill="#24364f" />
      <path d="M236 248 L250 230 L266 252 L256 246 L250 254 L243 245Z" fill="#EEF2F5" opacity=".9" />
      <path d="M563 232 L580 210 L598 236 L587 230 L580 240 L572 229Z" fill="#EEF2F5" opacity=".9" />
      {/* middle hills */}
      <path d="M0 420 L110 372 L200 396 L320 342 L430 386 L540 352 L690 318 L800 360 L800 600 L0 600Z" fill="#1d4a4a" />

      {/* signal tower on the ridge */}
      <g>
        <path d="M680 320 L690 272 L700 320 M684 302 L696 302 M682 312 L698 312" fill="none" strokeWidth="2.5" strokeLinecap="round" stroke="#5b6b7f">
          <animate attributeName="stroke" {...discrete(['#5b6b7f', '#3ccfa9'], [0, 0.68])} dur={`${T}s`} repeatCount="indefinite" />
        </path>
        <circle cx="690" cy="270" r="3.5" fill="#5b6b7f">
          <animate attributeName="fill" {...discrete(['#5b6b7f', '#3ccfa9'], [0, 0.68])} dur={`${T}s`} repeatCount="indefinite" />
        </circle>
        {[0, 0.03].map((offset) => (
          <circle key={offset} cx="690" cy="270" r="4" fill="none" stroke="#3ccfa9" strokeWidth="2" opacity="0">
            <animate attributeName="r" dur={`${T}s`} repeatCount="indefinite"
              values="4;4;4;46;4;46;4;46;4" keyTimes={[0, 0.68 + offset, 0.68 + offset, 0.74 + offset, 0.74 + offset, 0.8 + offset, 0.8 + offset, 0.86 + offset, 1].join(';')} />
            <animate attributeName="opacity" dur={`${T}s`} repeatCount="indefinite"
              values="0;0;.9;0;.9;0;.9;0;0" keyTimes={[0, 0.68 + offset, 0.68 + offset, 0.74 + offset, 0.74 + offset, 0.8 + offset, 0.8 + offset, 0.86 + offset, 1].join(';')} />
          </circle>
        ))}
      </g>

      {/* near hill with the village trail */}
      <path d="M0 468 C120 452 210 440 300 450 S470 500 560 466 S720 430 800 448 L800 600 L0 600Z" fill="url(#near)" />
      <path d={TRAIL} fill="none" stroke="#EEF2F5" strokeWidth="2" strokeDasharray="3 7" strokeLinecap="round" opacity=".45" />

      {/* households: windows light up when the volunteer has visited */}
      {HOUSES.map((h, i) => (
        <g key={i} transform={`translate(${h.x - 21} ${h.y - 36}) scale(1.4)`}>
          <rect x="2" y="9" width="26" height="17" rx="1.5" fill="#e8dcc6" />
          <path d="M-1 10 L15 0 L31 10Z" fill="#9b1c36" />
          <rect x="11" y="15" width="7" height="11" fill="#5b4636" />
          <rect x="4.5" y="13" width="5" height="5" rx=".8" fill="#2b3d55">
            <animate attributeName="fill" {...discrete(['#2b3d55', '#E9A23B'], [0, h.at])} dur={`${T}s`} repeatCount="indefinite" />
          </rect>
          <rect x="20.5" y="13" width="5" height="5" rx=".8" fill="#2b3d55">
            <animate attributeName="fill" {...discrete(['#2b3d55', '#E9A23B'], [0, h.at])} dur={`${T}s`} repeatCount="indefinite" />
          </rect>
        </g>
      ))}

      {/* health post */}
      <g transform="translate(582 419) scale(1.3)">
        <rect x="0" y="12" width="46" height="26" rx="2" fill="#EEF2F5" />
        <path d="M-3 13 L23 0 L49 13Z" fill="#24364f" />
        <rect x="19" y="24" width="9" height="14" fill="#0e6b5c" />
        <path d="M8 19 h6 M11 16 v6" stroke="#c42847" strokeWidth="2.5" strokeLinecap="round" />
      </g>

      {/* records travelling from the health post to the tower */}
      {[0, 0.025, 0.05].map((o) => (
        <rect key={o} x="-4" y="-4" width="8" height="8" rx="1.5" fill="#E9A23B" opacity="0">
          <animateMotion dur={`${T}s`} repeatCount="indefinite" path="M612 420 Q650 355 690 276"
            keyPoints="0;0;1;1" keyTimes={[0, 0.69 + o, 0.8 + o, 1].join(';')} calcMode="linear" />
          <animate attributeName="opacity" {...discrete([0, 1, 0], [0, 0.69 + o, 0.8 + o])} dur={`${T}s`} repeatCount="indefinite" />
        </rect>
      ))}

      {/* the health volunteer */}
      <g>
        <animateMotion dur={`${T}s`} repeatCount="indefinite" path={TRAIL} calcMode="linear"
          keyPoints="0;0.1921;0.1921;0.4539;0.4539;0.7182;0.7182;1;1" keyTimes="0;0.12;0.18;0.30;0.36;0.48;0.54;0.66;1" />
        <circle r="20" fill="url(#glow)" />
        <circle r="7.5" fill="#E9A23B" stroke="#16243a" strokeWidth="2.5" />
      </g>

      {/* status pill — what the phone would say */}
      <g transform="translate(40 548)">
        <rect width="330" height="34" rx="17" fill="#16243a" opacity=".85" />
        <circle cx="20" cy="17" r="5" fill="#E9A23B">
          <animate attributeName="fill" {...discrete(['#E9A23B', '#3ccfa9'], [0, 0.68])} dur={`${T}s`} repeatCount="indefinite" />
        </circle>
        {PHASES.map((p) => (
          <text key={p.text} x="36" y="22" fill="#EEF2F5" fontSize="14" fontFamily="IBM Plex Sans, IBM Plex Sans Devanagari, system-ui, sans-serif" fontWeight="500" opacity={p.from === 0 ? 1 : 0}>
            {t(p.text)}
            <animate attributeName="opacity" dur={`${T}s`} repeatCount="indefinite"
              {...(p.from === 0 ? discrete([1, 0], [0, p.to]) : p.to === 1 ? discrete([0, 1], [0, p.from]) : discrete([0, 1, 0], [0, p.from, p.to]))} />
          </text>
        ))}
      </g>
    </svg>
  );
}
