// Small building blocks styled with Tailwind utilities. Pages compose these
// instead of repeating long class lists.
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { t, num } from '../i18n/index.jsx';

export const cx = (...c) => c.filter(Boolean).join(' ');

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Counts from the previous value up to `value` (used for the big figures). */
export function useCountUp(value, duration = 900) {
  const [shown, setShown] = useState(typeof value === 'number' ? 0 : value);
  const from = useRef(0);
  useEffect(() => {
    if (typeof value !== 'number') { setShown(value); return undefined; }
    if (reducedMotion()) { setShown(value); return undefined; }
    const start = performance.now();
    const a = from.current;
    let raf;
    const step = (t) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - (1 - p) ** 3;
      setShown(Math.round(a + (value - a) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return shown;
}

const BTN = {
  primary: 'bg-pine text-white border-transparent shadow-sm shadow-pine/20 hover:bg-pine-deep hover:shadow-md hover:shadow-pine/25',
  ghost: 'bg-white border-line text-ink hover:border-ink-soft hover:shadow-sm',
  danger: 'bg-lali text-white border-transparent hover:bg-lali-deep',
  light: 'bg-white text-ink border-transparent hover:bg-paper',
  glass: 'bg-white/10 text-white border-white/15 backdrop-blur hover:bg-white/20',
  accent: 'bg-marigold text-ink border-transparent shadow-sm shadow-marigold/30 hover:brightness-105 hover:shadow-md',
};

export function Button({ variant = 'primary', size, className, as: As = 'button', ...props }) {
  return (
    <As
      className={cx(
        'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg border font-semibold no-underline transition-all duration-200 active:scale-[.97] disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-10 px-4',
        BTN[variant], className,
      )}
      {...props}
    />
  );
}

/** White panel. Fades up when it appears; pass `i` to stagger several panels. */
export function Panel({ className, children, i = 0 }) {
  return (
    <section className={cx('reveal min-w-0 rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(18,32,58,.04)]', className)} style={{ '--i': i }}>
      {children}
    </section>
  );
}

export function PanelHead({ title, hint, icon: Icon, children }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line-soft px-5 py-4">
      {Icon && <span className="grid size-8 place-items-center rounded-lg bg-pine-wash text-pine"><Icon size={17} /></span>}
      <h2 className="text-base font-semibold">{title}</h2>
      {hint && <span className="ml-auto text-[13px] text-ink-soft">{hint}</span>}
      {children}
    </div>
  );
}

const BADGE = {
  neutral: 'bg-line-soft text-ink-2',
  pine: 'bg-pine-wash text-pine-deep',
  marigold: 'bg-marigold-wash text-marigold-deep',
  lali: 'bg-lali-wash text-lali-deep',
  sky: 'bg-sky-wash text-sky',
};

export function Badge({ tone = 'neutral', children, className }) {
  return (
    <span className={cx('inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-xs font-semibold', BADGE[tone], className)}>
      {children}
    </span>
  );
}

export function PageHead({ title, subtitle, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end gap-4">
      <div className="reveal">
        <h1 className="font-condensed text-[28px] font-semibold tracking-tight md:text-[34px]">{title}</h1>
        {subtitle && <p className="mt-1 max-w-[70ch] text-ink-soft">{subtitle}</p>}
      </div>
      {children && <div className="reveal flex w-full flex-wrap gap-2.5 md:ml-auto md:w-auto" style={{ '--i': 1 }}>{children}</div>}
    </div>
  );
}

const inputBase = 'w-full rounded-lg border border-line bg-white px-3 outline-none transition-shadow focus:border-pine focus:ring-3 focus:ring-pine/15';

export function Field({ label, note, clinical, className, children }) {
  return (
    <label className={cx('flex flex-col gap-1.5', className)}>
      <span className="flex items-center gap-2 text-[13px] font-semibold text-ink-2">
        {label}
        {clinical && <span className="rounded-lg bg-lali-wash px-1.5 text-[11px] text-lali-deep">{t('Clinical')}</span>}
      </span>
      {children}
      {note && <span className="text-xs text-ink-soft">{note}</span>}
    </label>
  );
}

export const Input = ({ className, ...p }) => <input className={cx(inputBase, 'h-[42px]', className)} {...p} />;
export const Select = ({ className, ...p }) => <select className={cx(inputBase, 'h-[42px]', className)} {...p} />;
export const Textarea = ({ className, ...p }) => <textarea className={cx(inputBase, 'min-h-[76px] resize-y py-2.5', className)} {...p} />;

/** Segmented control with a highlight that slides to the chosen option. */
export function Segmented({ options, value, onChange, label }) {
  const refs = useRef({});
  const [pill, setPill] = useState(null);
  useEffect(() => {
    const el = refs.current[value];
    if (el) setPill({ left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight });
  }, [value, options.length]);
  return (
    <div role="group" aria-label={label} className="relative inline-flex flex-wrap gap-0.5 rounded-lg bg-line-soft p-[3px]">
      {pill && <span aria-hidden className="absolute rounded-md bg-white shadow-sm transition-all duration-300 ease-out" style={pill} />}
      {options.map((o) => (
        <button
          key={o.value}
          ref={(el) => { refs.current[o.value] = el; }}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx('relative z-10 cursor-pointer rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors', value === o.value ? 'text-ink' : 'text-ink-soft hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ title, children, action }) {
  return (
    <div className="px-5 py-9 text-center text-ink-soft">
      <strong className="mb-1 block text-base text-ink">{title}</strong>
      {children}
      {action && <div className="mt-3.5">{action}</div>}
    </div>
  );
}

export function SkeletonRows({ rows = 3 }) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3.5">
          <span className="skeleton size-[38px] rounded-full" />
          <div className="flex-1"><div className="skeleton h-3.5 w-2/5 rounded" /><div className="skeleton mt-2 h-3 w-3/5 rounded" /></div>
        </div>
      ))}
    </div>
  );
}

const AVATAR_COLORS = ['#0d7a68', '#2f6fb0', '#a0243f', '#9a5f06', '#1e3150', '#5a4a8a'];
export function Avatar({ name = '?', seed = '', size = 'md' }) {
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
  let h = 0;
  for (const ch of seed || name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      className={cx('grid flex-none place-items-center rounded-full font-semibold text-white ring-2 ring-white', size === 'lg' ? 'size-16 text-[22px]' : 'size-[38px] text-sm')}
      style={{ background: AVATAR_COLORS[h % AVATAR_COLORS.length] }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

const FIG_TONE = {
  warn: { num: 'text-marigold-deep', chip: 'bg-marigold-wash text-marigold-deep' },
  alert: { num: 'text-lali', chip: 'bg-lali-wash text-lali' },
  good: { num: 'text-pine', chip: 'bg-pine-wash text-pine' },
  plain: { num: 'text-ink', chip: 'bg-sky-wash text-sky' },
};

function Figure({ f, i }) {
  const n = useCountUp(f.value ?? null);
  const tone = FIG_TONE[f.tone || 'plain'];
  return (
    <div className={cx('reveal border-line-soft px-5 py-[18px]', i % 2 === 1 && 'border-l', i >= 2 && 'border-t lg:border-t-0', i === 2 && 'lg:border-l')} style={{ '--i': i + 1 }}>
      <div className="flex items-start justify-between gap-3">
        <div className={cx('font-condensed text-[32px] leading-none font-semibold tracking-tight lg:text-[40px]', tone.num)}>{n === null || n === undefined ? '–' : num(n)}</div>
        {f.icon && <span className={cx('grid size-9 place-items-center rounded-xl', tone.chip)}><f.icon size={18} /></span>}
      </div>
      <div className="mt-2 text-[13px] text-ink-soft">{f.label}</div>
    </div>
  );
}

/** One bar of key numbers separated by dividers; numbers count up. */
export function Figures({ items, className }) {
  return (
    <div className={cx('mb-5 grid grid-cols-2 overflow-hidden rounded-2xl border border-line bg-white shadow-[0_12px_32px_-18px_rgba(18,32,58,.35)] lg:grid-cols-4', className)}>
      {items.map((f, i) => <Figure key={f.label} f={f} i={i} />)}
    </div>
  );
}

/** Side drawer used for every form; slides in when the user opens it. */
export function Drawer({ title, onClose, children, footer }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div className="fixed inset-0 z-50 bg-ink/45 backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title}
        className="fixed inset-y-0 right-0 z-[51] flex w-full max-w-[560px] animate-slide-in flex-col bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <h2 className="font-condensed text-xl font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label={t('Close')}
            className="ml-auto grid size-9 cursor-pointer place-items-center rounded-lg border border-line bg-white transition-colors hover:border-ink-soft">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2.5 border-t border-line bg-[#f7f9fb] px-5 py-3.5">{footer}</div>}
      </div>
    </>
  );
}

export function Table({ head, children }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h.label || h} className={cx('border-b border-line bg-[#f7f9fb] px-4 py-2.5 text-left text-[13px] font-semibold text-ink-soft', h.hideSm && 'hidden md:table-cell')}>
                {h.label || h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_td]:border-b [&_td]:border-line-soft [&_td]:px-4 [&_td]:py-3 [&_td]:transition-colors [&_tr:last-child_td]:border-b-0">{children}</tbody>
      </table>
    </div>
  );
}

/** Pregnancy progress on a 40-week track with trimester marks. */
export function WeeksBar({ weeks }) {
  const pct = Math.min(100, Math.max(0, ((weeks ?? 0) / 40) * 100));
  return (
    <div className="flex min-w-[150px] items-center gap-2.5">
      <b className="min-w-[34px] font-condensed text-[15px]">{weeks === null || weeks === undefined ? '–' : t('{n}w', { n: weeks })}</b>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-line-soft">
        <span className="grow-x absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-pine to-mint" style={{ width: `${pct}%` }} />
        <span className="absolute inset-y-0 left-[32.5%] w-0.5 bg-white" />
        <span className="absolute inset-y-0 left-[67.5%] w-0.5 bg-white" />
      </div>
    </div>
  );
}
