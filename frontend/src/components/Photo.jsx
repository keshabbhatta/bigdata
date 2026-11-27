// Real photographs with their caption and credit (the licences require the credit),
// and the slideshow at the top of the home page.
import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { t, num } from '../i18n/index.jsx';
import { webpSet, jpg } from '../content/photos.js';
import { cx } from './ui.jsx';

export function Credit({ photo, className }) {
  const link = 'underline decoration-dotted underline-offset-2 hover:decoration-solid';
  return (
    <span className={className}>
      {t('Photo')}: <a href={photo.page} target="_blank" rel="noreferrer" className={link}>{photo.credit}</a>
      {', '}{photo.licenseUrl ? <a href={photo.licenseUrl} target="_blank" rel="noreferrer" className={link}>{photo.license}</a> : t(photo.license)}
    </span>
  );
}

/** <picture> with a small WebP for phones, a large one for computers and a JPEG fallback. */
export function Picture({ photo, className, sizes = '(min-width: 1024px) 50vw, 100vw', eager = false, ...rest }) {
  return (
    <picture className="contents">
      <source type="image/webp" srcSet={webpSet(photo)} sizes={sizes} />
      <img src={jpg(photo)} alt={t(photo.alt)} width="1400" height="933" loading={eager ? 'eager' : 'lazy'} decoding="async"
        fetchpriority={eager ? 'high' : undefined} className={cx('block w-full object-cover', className)} {...rest} />
    </picture>
  );
}

function Caption({ photo, tone }) {
  return (
    <figcaption className={cx('mt-2.5 text-[13px] leading-snug', tone === 'dark' ? 'text-white/65' : 'text-ink-soft')}>
      {t(photo.caption)} <Credit photo={photo} className={tone === 'dark' ? 'text-white/45' : 'text-ink-soft/80'} />
    </figcaption>
  );
}

/** tone="dark" for captions on a dark background. */
export function Photo({ photo, className, imgClassName, tone = 'light', caption = true, eager = false, sizes }) {
  return (
    <figure className={cx('m-0', className)}>
      <Picture photo={photo} eager={eager} sizes={sizes} className={cx('aspect-[3/2]', imgClassName)} />
      {caption && <Caption photo={photo} tone={tone} />}
    </figure>
  );
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Photos that take turns every `interval` ms with a soft cross-fade.
 * Pauses while the pointer is over it, while it has keyboard focus, when the tab is hidden,
 * and does not move at all for people who ask their phone for reduced motion.
 * A photo is only downloaded just before it is shown.
 */
export function Slideshow({ photos, interval = 5000, className, imgClassName }) {
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(() => new Set([0, 1]));
  const [paused, setPaused] = useState(reducedMotion);
  const [hover, setHover] = useState(false);
  const [hidden, setHidden] = useState(false);
  const running = !paused && !hover && !hidden;
  const key = useRef(0); // restarts the progress bar animation

  useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
    if (!running) return undefined;
    const timer = setTimeout(() => setIndex((i) => (i + 1) % photos.length), interval);
    return () => clearTimeout(timer);
  }, [running, index, interval, photos.length]);

  // Download the next photo while the current one is showing.
  useEffect(() => {
    setLoaded((s) => (s.has((index + 1) % photos.length) ? s : new Set([...s, (index + 1) % photos.length])));
    key.current += 1;
  }, [index, photos.length]);

  const go = (i) => setIndex((i + photos.length) % photos.length);
  const photo = photos[index];

  return (
    <figure className={cx('m-0', className)} aria-roledescription="carousel" aria-label={t('Photos of health work in Nepal')}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)} onBlur={() => setHover(false)}>
      <div className={cx('relative aspect-[3/2] overflow-hidden bg-line-soft', imgClassName)}>
        {photos.map((p, i) => loaded.has(i) && (
          <div key={p.name} aria-hidden={i !== index}
            className={cx('absolute inset-0 transition-opacity duration-[1200ms] ease-in-out', i === index ? 'opacity-100' : 'opacity-0')}>
            <Picture photo={p} eager={i === 0} className={cx('h-full', !paused && i === index && 'animate-slow-zoom', !paused && i === (index - 1 + photos.length) % photos.length && 'scale-[1.06]')} />
          </div>
        ))}
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/55 to-transparent px-3 pt-8 pb-2.5">
          <button type="button" onClick={() => setPaused((v) => !v)}
            aria-label={paused ? t('Play the photos') : t('Pause the photos')}
            className="grid size-8 cursor-pointer place-items-center rounded-full bg-black/35 text-white hover:bg-black/55">
            {paused ? <Play size={14} /> : <Pause size={14} />}
          </button>
          <div className="flex flex-1 gap-1.5" role="group" aria-label={t('Choose a photo')}>
            {photos.map((p, i) => (
              <button key={p.name} type="button" onClick={() => go(i)} aria-label={t('Photo {n} of {total}', { n: i + 1, total: photos.length })}
                aria-current={i === index} className="group h-6 flex-1 cursor-pointer py-2.5">
                <span className="block h-1 overflow-hidden rounded-full bg-white/35 group-hover:bg-white/55">
                  <span key={i === index ? key.current : 'x'}
                    className={cx('block h-full rounded-full bg-white', i < index && 'w-full', i > index && 'w-0',
                      i === index && (running ? 'animate-progress' : 'w-full'))}
                    style={i === index ? { animationDuration: `${interval}ms` } : undefined} />
                </span>
              </button>
            ))}
          </div>
          <span className="min-w-[3ch] text-right text-xs font-semibold text-white/85 tabular-nums">{num(String(index + 1))}/{num(String(photos.length))}</span>
        </div>
      </div>
      <figcaption aria-live="polite" className="mt-2.5 min-h-[2.6em] text-[13px] leading-snug text-ink-soft">
        {t(photo.caption)} <Credit photo={photo} className="text-ink-soft/80" />
      </figcaption>
    </figure>
  );
}
