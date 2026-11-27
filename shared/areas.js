// Nepal's administrative areas, shared by the phone app and the server.
//
// Every area has a code that contains its parents, so "is this ward inside that
// area?" is a simple prefix check:
//
//   NP                     all of Nepal
//   P3                     Bagmati Province
//   P3-D35                 Sindhupalchok District
//   P3-D35-L386            Indrawati Rural Municipality
//   P3-D35-L386-W05        Ward 5 of Indrawati Rural Municipality
//
// Records always belong to one WARD. Users have a list of SCOPES (any area
// codes above) that decide which wards they may see and change.
import { PROVINCES, DISTRICTS, LOCAL_LEVELS } from './nepal-data.js';

export const NATION = 'NP';

export const LOCAL_TYPES = {
  1: { name: 'Metropolitan City', short: 'MC', nameNe: 'महानगरपालिका', shortNe: 'महानगरपालिका' },
  2: { name: 'Sub-Metropolitan City', short: 'SMC', nameNe: 'उपमहानगरपालिका', shortNe: 'उपमहानगरपालिका' },
  3: { name: 'Municipality', short: 'M', nameNe: 'नगरपालिका', shortNe: 'नगरपालिका' },
  4: { name: 'Rural Municipality', short: 'RM', nameNe: 'गाउँपालिका', shortNe: 'गाउँपालिका' },
};

const DEVANAGARI = '०१२३४५६७८९';
/** 12 -> "१२" (Nepali digits for ward numbers in Nepali labels). */
export const toNepaliDigits = (n) => String(n).replace(/[0-9]/g, (d) => DEVANAGARI[d]);

const pad = (n, w) => String(n).padStart(w, '0');
export const provinceCode = (p) => `P${p}`;
export const districtCode = (p, d) => `P${p}-D${pad(d, 2)}`;
export const localCode = (p, d, l) => `${districtCode(p, d)}-L${pad(l, 3)}`;
export const wardCode = (p, d, l, w) => `${localCode(p, d, l)}-W${pad(w, 2)}`;

const byName = (a, b) => a.name.localeCompare(b.name);

export const provinces = PROVINCES.map(([id, name, nameNe]) => ({ id, name, nameNe, code: provinceCode(id) }));
const provinceById = new Map(provinces.map((p) => [p.id, p]));

export const districts = DISTRICTS.map(([id, provinceId, name, nameNe]) => ({ id, provinceId, name, nameNe, code: districtCode(provinceId, id) }));
const districtById = new Map(districts.map((d) => [d.id, d]));

export const localLevels = LOCAL_LEVELS.map(([id, districtId, type, name, wards, nameNe]) => {
  const provinceId = districtById.get(districtId).provinceId;
  return {
    id, districtId, provinceId, name, nameNe, wards, type: LOCAL_TYPES[type],
    fullName: `${name} ${LOCAL_TYPES[type].name}`, fullNameNe: `${nameNe} ${LOCAL_TYPES[type].nameNe}`,
    code: localCode(provinceId, districtId, id),
  };
});

/** Name of a province / district / local level in the chosen language. */
export const nameIn = (item, lang) => (lang === 'ne' && item?.nameNe ? item.nameNe : item?.name);
export const fullNameIn = (local, lang) => (lang === 'ne' ? local.fullNameNe : local.fullName);
const localById = new Map(localLevels.map((l) => [l.id, l]));

export const TOTALS = {
  provinces: provinces.length,
  districts: districts.length,
  localLevels: localLevels.length,
  wards: localLevels.reduce((n, l) => n + l.wards, 0),
};

const byNameIn = (lang) => (a, b) => nameIn(a, lang).localeCompare(nameIn(b, lang), lang === 'ne' ? 'ne' : 'en');
export const districtsOf = (provinceId, lang = 'en') => districts.filter((d) => d.provinceId === Number(provinceId)).sort(lang === 'ne' ? byNameIn('ne') : byName);
export const localLevelsOf = (districtId, lang = 'en') => localLevels.filter((l) => l.districtId === Number(districtId)).sort(lang === 'ne' ? byNameIn('ne') : byName);
export const wardsOf = (localId) => {
  const l = localById.get(Number(localId));
  return l ? Array.from({ length: l.wards }, (_, i) => i + 1) : [];
};
export const getLocalLevel = (id) => localById.get(Number(id)) || null;

const CODE_RE = /^P(\d)(?:-D(\d{2})(?:-L(\d{3})(?:-W(\d{2}))?)?)?$/;

/** Parse any area code. Returns null for anything that is not a real area of Nepal. */
export function parseArea(code) {
  if (code === NATION) return { level: 'nation', code };
  const m = CODE_RE.exec(String(code ?? ''));
  if (!m) return null;
  const province = provinceById.get(Number(m[1]));
  if (!province) return null;
  if (!m[2]) return { level: 'province', code, province };
  const district = districtById.get(Number(m[2]));
  if (!district || district.provinceId !== province.id) return null;
  if (!m[3]) return { level: 'district', code, province, district };
  const local = localById.get(Number(m[3]));
  if (!local || local.districtId !== district.id) return null;
  if (!m[4]) return { level: 'local', code, province, district, local };
  const ward = Number(m[4]);
  if (ward < 1 || ward > local.wards) return null;
  return { level: 'ward', code, province, district, local, ward };
}

export const isValidArea = (code) => parseArea(code) !== null;
export const isValidWard = (code) => parseArea(code)?.level === 'ward';

/** Is this ward (or area) inside one of the scopes? null scopes = everything. */
export function inScope(code, scopes) {
  if (!scopes) return true;
  const c = String(code);
  return scopes.some((s) => s === NATION || c === s || c.startsWith(`${s}-`));
}

/** SQL LIKE patterns for a list of scopes (null = no limit). Used with `ward LIKE ANY($n)`. */
export function scopePatterns(scopes) {
  if (!scopes || scopes.includes(NATION)) return null;
  return scopes.flatMap((s) => [s, `${s}-%`]);
}

/**
 * Human readable name. short: "Ward 5, Indrawati RM"; long adds district and province.
 * lang 'ne': "वडा नं. ५, इन्द्रावती गाउँपालिका" / "..., सिन्धुपाल्चोक जिल्ला, बागमती प्रदेश".
 */
export function areaLabel(code, { short = false, lang = 'en' } = {}) {
  const a = parseArea(code);
  if (!a) return String(code ?? '');
  if (lang === 'ne') {
    switch (a.level) {
      case 'nation': return 'सम्पूर्ण नेपाल';
      case 'province': return a.province.nameNe;
      case 'district': return short ? `${a.district.nameNe} जिल्ला` : `${a.district.nameNe} जिल्ला, ${a.province.nameNe}`;
      case 'local': return short ? a.local.fullNameNe : `${a.local.fullNameNe}, ${a.district.nameNe} जिल्ला, ${a.province.nameNe}`;
      default: return short
        ? `वडा नं. ${toNepaliDigits(a.ward)}, ${a.local.fullNameNe}`
        : `वडा नं. ${toNepaliDigits(a.ward)}, ${a.local.fullNameNe}, ${a.district.nameNe} जिल्ला, ${a.province.nameNe}`;
    }
  }
  switch (a.level) {
    case 'nation': return 'All of Nepal';
    case 'province': return a.province.name;
    case 'district': return short ? `${a.district.name} District` : `${a.district.name} District, ${a.province.name}`;
    case 'local': return short ? a.local.fullName : `${a.local.fullName}, ${a.district.name}, ${a.province.name}`;
    default: return short
      ? `Ward ${a.ward}, ${a.local.name} ${a.local.type.short}`
      : `Ward ${a.ward}, ${a.local.fullName}, ${a.district.name} District, ${a.province.name}`;
  }
}

// ---- Demo data and older versions ---------------------------------------------
// The demo uses wards 1-3 of Indrawati Rural Municipality, Sindhupalchok (Bagmati Province).
// Earlier versions of the app used the codes "ward-1", "ward-2", "ward-3"; they map to these.
export const DEMO_WARDS = [1, 2, 3].map((w) => wardCode(3, 35, 386, w));
export const LEGACY_WARDS = { 'ward-1': DEMO_WARDS[0], 'ward-2': DEMO_WARDS[1], 'ward-3': DEMO_WARDS[2] };
export const upgradeWard = (code) => LEGACY_WARDS[code] || code;
