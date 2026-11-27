// Cascading picker for Nepal's areas: Province -> District -> Municipality / Rural
// municipality -> Ward. Covers all 7 provinces, 77 districts, 753 local levels
// and 6,743 wards (shared/nepal-data.js), with names in English or Nepali.
//
//   level="ward"  the value is only set once a ward is chosen (records, health workers, patients)
//   level="any"   the value is the deepest level chosen (doctor areas, admin scopes, analytics filters)
//   within        optional list of scopes; only areas inside them can be chosen
import { useState } from 'react';
import {
  NATION, provinces, districtsOf, localLevelsOf, wardsOf, parseArea, inScope, wardCode, nameIn, fullNameIn, toNepaliDigits,
} from '../../../shared/areas.js';
import { Field, Select, cx } from './ui.jsx';
import { t, getLang } from '../i18n/index.jsx';

// Is this area inside the allowed scopes, or on the way down to one of them?
const reachable = (code, within) => !within || inScope(code, within) || within.some((s) => s.startsWith(`${code}-`));
const wardText = (n) => (getLang() === 'ne' ? `वडा नं. ${toNepaliDigits(n)}` : `Ward ${n}`);

function fromCode(code) {
  const a = parseArea(code);
  return { p: a?.province?.id ?? '', d: a?.district?.id ?? '', l: a?.local?.id ?? '', w: a?.ward ?? '' };
}

/** Start from the value, else from a single allowed scope, else empty. */
function initial(value, within) {
  if (parseArea(value)) return fromCode(value);
  if (within?.length === 1 && within[0] !== NATION) return fromCode(within[0]);
  return { p: '', d: '', l: '', w: '' };
}

export function AreaPicker({ value, onChange, level = 'ward', within = null, allowNation = false, className, compact = false }) {
  const lang = getLang();
  const scopes = within && !within.includes(NATION) ? within : null;
  const [sel, setSel] = useState(() => initial(value, scopes));

  const provinceList = provinces.filter((p) => reachable(p.code, scopes));
  const districtList = sel.p ? districtsOf(sel.p, lang).filter((d) => reachable(d.code, scopes)) : [];
  const localList = sel.d ? localLevelsOf(sel.d, lang).filter((l) => reachable(l.code, scopes)) : [];
  const local = localList.find((l) => l.id === Number(sel.l));
  const wardList = local ? wardsOf(local.id).filter((w) => reachable(wardCode(local.provinceId, local.districtId, local.id, w), scopes)) : [];

  const codeOf = (s) => {
    if (s.w) {
      const l = localLevelsOf(s.d).find((x) => x.id === Number(s.l));
      return l ? wardCode(l.provinceId, l.districtId, l.id, Number(s.w)) : '';
    }
    if (level === 'ward') return '';
    if (s.l) return localLevelsOf(s.d).find((x) => x.id === Number(s.l))?.code || '';
    if (s.d) return districtsOf(s.p).find((x) => x.id === Number(s.d))?.code || '';
    if (s.p) return provinces.find((x) => x.id === Number(s.p))?.code || '';
    return allowNation ? NATION : '';
  };

  const pick = (key, v) => {
    const next = { ...sel, [key]: v };
    if (key === 'p') Object.assign(next, { d: '', l: '', w: '' });
    if (key === 'd') Object.assign(next, { l: '', w: '' });
    if (key === 'l') next.w = '';
    setSel(next);
    const code = codeOf(next);
    onChange(code && (!scopes || inScope(code, scopes)) ? code : '');
  };

  const any = level === 'any';
  const lists = [
    { key: 'p', label: t('Province'), list: provinceList.map((p) => [p.id, nameIn(p, lang)]),
      empty: any ? (allowNation ? t('All of Nepal') : t('Choose…')) : t('Choose province…'), show: true },
    { key: 'd', label: t('District'), list: districtList.map((d) => [d.id, nameIn(d, lang)]),
      empty: any ? t('Whole province') : t('Choose district…'), show: Boolean(sel.p) },
    { key: 'l', label: t('Municipality / Rural municipality'), list: localList.map((l) => [l.id, fullNameIn(l, lang)]),
      empty: any ? t('Whole district') : t('Choose municipality…'), show: Boolean(sel.d) },
    { key: 'w', label: t('Ward'), list: wardList.map((w) => [w, wardText(w)]),
      empty: any ? t('Whole municipality') : t('Choose ward…'), show: Boolean(sel.l) },
  ];

  return (
    <div className={cx('grid grid-cols-1 gap-3', !compact && 'sm:grid-cols-2', className)}>
      {lists.filter((x) => x.show).map((x) => (
        <Field key={x.key} label={x.label}>
          <Select value={sel[x.key]} onChange={(e) => pick(x.key, e.target.value)} aria-label={x.label}>
            <option value="">{x.empty}</option>
            {x.list.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </Select>
        </Field>
      ))}
      {local && level === 'ward' && (
        <p className="text-xs text-ink-soft sm:col-span-2">{t('{name} has {n} wards.', { name: fullNameIn(local, lang), n: local.wards })}</p>
      )}
    </div>
  );
}

/** Edit a list of area scopes (for an account): chips + picker + Add. */
export function ScopeEditor({ value, onChange, label, note }) {
  const [draft, setDraft] = useState('');
  const [pickerKey, setPickerKey] = useState(0);
  const add = () => {
    if (!draft) return;
    const next = draft === NATION ? [NATION] : [...value.filter((s) => s !== NATION && !inScope(s, [draft])), draft];
    onChange([...new Set(next)]);
    setDraft('');
    setPickerKey((k) => k + 1);
  };
  return (
    <Field label={label || t('Areas')} note={note}>
      <div className="flex flex-wrap gap-1.5">
        {value.length === 0 && <span className="text-sm text-ink-soft">{t('No area yet.')}</span>}
        {value.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5 rounded-full bg-pine-wash px-2.5 py-1 text-[13px] text-pine-deep">
            <AreaText code={s} />
            <button type="button" className="cursor-pointer font-bold" aria-label={t('Remove {name}', { name: s })} onClick={() => onChange(value.filter((x) => x !== s))}>×</button>
          </span>
        ))}
      </div>
      <div className="mt-2 rounded-lg border border-line-soft p-3">
        <AreaPicker key={pickerKey} value={draft} onChange={setDraft} level="any" allowNation compact />
        <button type="button" onClick={add} disabled={!draft}
          className="mt-3 inline-flex h-8 cursor-pointer items-center rounded-md border border-line px-3 text-[13px] font-semibold hover:border-ink-soft disabled:cursor-not-allowed disabled:opacity-50">
          {t('Add this area')}
        </button>
      </div>
    </Field>
  );
}

export function AreaText({ code }) {
  const lang = getLang();
  const a = parseArea(code);
  if (!a) return <span>{code}</span>;
  if (a.level === 'nation') return <span>{t('All of Nepal')}</span>;
  const district = a.district && (lang === 'ne' ? `${a.district.nameNe} जिल्ला` : `${a.district.name} District`);
  const parts = [a.ward && wardText(a.ward), a.local && fullNameIn(a.local, lang), district, nameIn(a.province, lang)].filter(Boolean);
  return <span title={parts.join(', ')}>{parts.slice(0, 2).join(', ')}</span>;
}
