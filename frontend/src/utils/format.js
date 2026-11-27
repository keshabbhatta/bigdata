import { areaLabel, upgradeWard, toNepaliDigits } from '../../../shared/areas.js';
import { t, getLang } from '../i18n/index.jsx';

const locale = () => (getLang() === 'ne' ? 'ne-NP' : undefined);

export function relativeTime(ts) {
  if (!ts) return t('never');
  const time = typeof ts === 'number' ? ts : new Date(ts).getTime();
  const s = Math.round((Date.now() - time) / 1000);
  if (s < 10) return t('just now');
  if (s < 60) return t('{n} seconds ago', { n: s });
  const m = Math.round(s / 60);
  if (m < 60) return m === 1 ? t('1 minute ago') : t('{n} minutes ago', { n: m });
  const h = Math.round(m / 60);
  if (h < 24) return h === 1 ? t('1 hour ago') : t('{n} hours ago', { n: h });
  const d = Math.round(h / 24);
  return d === 1 ? t('1 day ago') : t('{n} days ago', { n: d });
}

// Nepali month and weekday names are written out here instead of relying on the
// browser, because not every phone browser has Nepali date support.
const NE_MONTHS = ['जनवरी', 'फेब्रुअरी', 'मार्च', 'अप्रिल', 'मे', 'जुन', 'जुलाई', 'अगस्ट', 'सेप्टेम्बर', 'अक्टोबर', 'नोभेम्बर', 'डिसेम्बर'];
const NE_DAYS = ['आइतबार', 'सोमबार', 'मङ्गलबार', 'बुधबार', 'बिहीबार', 'शुक्रबार', 'शनिबार'];
const ne = () => getLang() === 'ne';
const two = (n) => String(n).padStart(2, '0');

export function formatDate(d) {
  if (!d) return '–';
  const date = typeof d === 'string' && d.length === 10 ? new Date(`${d}T00:00:00`) : new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  if (ne()) return `${toNepaliDigits(date.getDate())} ${NE_MONTHS[date.getMonth()]} ${toNepaliDigits(date.getFullYear())}`;
  return date.toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(d) {
  if (!d) return '–';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return String(d);
  if (ne()) return `${toNepaliDigits(date.getDate())} ${NE_MONTHS[date.getMonth()]}, ${toNepaliDigits(`${two(date.getHours())}:${two(date.getMinutes())}`)}`;
  return date.toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** "Thursday, 26 November" / "बिहीबार, २६ नोभेम्बर" */
export function formatToday(date = new Date()) {
  if (ne()) return `${NE_DAYS[date.getDay()]}, ${toNepaliDigits(date.getDate())} ${NE_MONTHS[date.getMonth()]}`;
  return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

/** "14:05" / "१४:०५" */
export function formatTime(d) {
  const date = new Date(d);
  const s = `${two(date.getHours())}:${two(date.getMinutes())}`;
  return ne() ? toNepaliDigits(s) : s;
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function daysFromToday(dateStr) {
  if (!dateStr) return null;
  const a = new Date(`${dateStr}T00:00:00`);
  const b = new Date(`${today()}T00:00:00`);
  return Math.round((a - b) / 86400000);
}

export function bytes(n) {
  if (!n) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

// Short label of any area code: "Ward 5, Indrawati RM" / "वडा नं. ५, इन्द्रावती गाउँपालिका".
export const wardName = (w) => areaLabel(upgradeWard(w), { short: true, lang: getLang() });
// Full label with district and province.
export const wardFullName = (w) => areaLabel(upgradeWard(w), { lang: getLang() });
/** One area's name, or "3 areas" for several. */
export const scopesLabel = (scopes = []) => (scopes.length === 1 ? wardName(scopes[0]) : t('{n} areas', { n: scopes.length }));

// English labels; show them with t(FIELD_LABELS[field]).
export const FIELD_LABELS = {
  bpSystolic: 'Blood pressure (systolic)', bpDiastolic: 'Blood pressure (diastolic)', hemoglobin: 'Hemoglobin',
  weightKg: 'Weight', riskLevel: 'Risk level', dangerSigns: 'Danger signs', lmp: 'Last menstrual period',
  edd: 'Expected delivery date', bloodGroup: 'Blood group', allergies: 'Allergies', chronicConditions: 'Chronic conditions',
};

export const UNITS = { bpSystolic: 'mmHg', bpDiastolic: 'mmHg', hemoglobin: 'g/dL', weightKg: 'kg', temperatureC: '°C' };

// "Dr. Anita Sharma" -> greeting "Dr. Anita", short "Anita", initials "AS".
const TITLE = /^(dr|mr|mrs|ms|prof)\.?$/i;
export function nameParts(full = '') {
  const parts = full.split(' ').filter(Boolean);
  const title = parts.length > 1 && TITLE.test(parts[0]) ? parts[0] : '';
  const rest = title ? parts.slice(1) : parts;
  return {
    short: rest[0] || full,
    greeting: title ? `${title} ${rest[0]}` : rest[0] || full,
    initials: rest.slice(0, 2).map((p) => (p[0] || '').toUpperCase()).join(''),
  };
}
