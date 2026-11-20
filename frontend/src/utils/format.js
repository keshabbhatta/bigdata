export function relativeTime(ts) {
  if (!ts) return 'never';
  const t = typeof ts === 'number' ? ts : new Date(ts).getTime();
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s} seconds ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

export function formatDate(d) {
  if (!d) return '–';
  const date = typeof d === 'string' && d.length === 10 ? new Date(`${d}T00:00:00`) : new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(d) {
  if (!d) return '–';
  return new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
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

export const WARD_NAMES = { 'ward-1': 'Ward 1', 'ward-2': 'Ward 2', 'ward-3': 'Ward 3' };
export const wardName = (w) => WARD_NAMES[w] || w;

export const FIELD_LABELS = {
  bpSystolic: 'Blood pressure (systolic)', bpDiastolic: 'Blood pressure (diastolic)', hemoglobin: 'Hemoglobin',
  weightKg: 'Weight', riskLevel: 'Risk level', dangerSigns: 'Danger signs', lmp: 'Last menstrual period',
  edd: 'Expected delivery date', bloodGroup: 'Blood group', allergies: 'Allergies', chronicConditions: 'Chronic conditions',
};

export const UNITS = { bpSystolic: 'mmHg', bpDiastolic: 'mmHg', hemoglobin: 'g/dL', weightKg: 'kg', temperatureC: '°C' };
