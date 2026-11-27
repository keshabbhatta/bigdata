// A real photograph with its caption and, where needed, credit and licence.
import { t } from '../i18n/index.jsx';
import { cx } from './ui.jsx';

export function Credit({ photo, className }) {
  if (!photo.credit && !photo.license && !photo.page && !photo.licenseUrl) return null;

  return (
    <span className={className}>
      {t('Photo')}: <a href={photo.page} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2 hover:decoration-solid">{photo.credit}</a>
      {', '}{photo.licenseUrl ? <a href={photo.licenseUrl} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2 hover:decoration-solid">{photo.license}</a> : t(photo.license)}
    </span>
  );
}

/** tone="dark" for captions on a dark background. */
export function Photo({ photo, className, imgClassName, tone = 'light', caption = true, eager = false }) {
  return (
    <figure className={cx('m-0', className)}>
      <img src={photo.src} alt={t(photo.alt)} loading={eager ? 'eager' : 'lazy'} decoding="async"
        className={cx('photo-float block w-full object-cover', imgClassName)} />
      {caption && (
        <figcaption className={cx('mt-2.5 text-[13px] leading-snug', tone === 'dark' ? 'text-white/65' : 'text-ink-soft')}>
          {t(photo.caption)} <Credit photo={photo} className={tone === 'dark' ? 'text-white/45' : 'text-ink-soft/80'} />
        </figcaption>
      )}
    </figure>
  );
}
