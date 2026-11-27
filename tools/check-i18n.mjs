// Checks the Nepali translation (frontend/src/i18n/ne.js) against the app's source.
//
//   node tools/check-i18n.mjs          report missing / unused Nepali texts, exit 1 if anything is missing
//   node tools/check-i18n.mjs --list   print every English text the app can show (JSON)
//
// Texts are found in two ways:
//   1. direct calls: t('...'), t("..."), t(`...`) in frontend/src
//   2. texts kept in lists and translated later with t(variable): the CONTENT sources below
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'frontend', 'src');

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return files(p);
    return /\.(jsx?|mjs)$/.test(e.name) && !p.includes(`${path.sep}i18n${path.sep}`) ? [p] : [];
  });
}

const unescape = (s, q) => s.replace(/\\(.)/g, (m, c) => (c === 'n' ? '\n' : c === q || c === '\\' || c === "'" || c === '"' ? c : m));
const keys = new Map(); // text -> where
const add = (text, where) => { if (text && /[A-Za-z]/.test(text) && !keys.has(text)) keys.set(text, where); };

// 1. direct t('...') calls
const CALL = /(?<![\w.])t\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\$]|\\.)*)`)/g;
// 2. strings in content lists that are shown with t(variable)
const LIST_STRINGS = /(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;
const CONTENT = [
  // [file, start marker, end marker] - every quoted string between the markers is UI text
  ['pages/Home.jsx', 'const PHONE_STATES', 'function PhoneMockup'],
  ['pages/Home.jsx', 'const PROBLEMS = [', 'const STACK = ['],
  ['pages/Home.jsx', "{[['#problem'", '.map(([href, l])'],
  ['pages/Home.jsx', "{['Works fully offline'", '.map((txt)'],
  ['pages/Home.jsx', "{['Version vectors", '.map((txt)'],
  ['pages/Home.jsx', "{[['30', 'Patients']", '.map(([n, l])'],
  ['pages/ProblemDetail.jsx', 'const PROBLEMS = {', 'const ORDER ='],
  ['pages/ProblemDetail.jsx', 'function SignalProblemPicture', 'const PROBLEMS = {'],
  ['pages/Home.jsx', '{node(10, 150', '{flow('],
  ['pages/ProblemDetail.jsx', "{[['what', 'In simple words']", '.map(([id, label])'],
  ['pages/ProblemDetail.jsx', "{[[prev, 'Previous problem'", '.map(([s, label, Icon])'],
  ['components/VillageScene.jsx', 'const PHASES = [', '];'],
  ['pages/MyHealth.jsx', 'const DANGER_SIGNS = [', '];'],
  ['pages/Login.jsx', 'const TABS = [', 'function GoogleIcon'],
  ['components/RecordForm.jsx', 'const ENUM_LABELS = {', '};'],
  ['components/Layout.jsx', "? [{ to: '/', label: 'My health'", 'useEffect('],
  ['pages/Dashboard.jsx', 'const VISIT_LABEL = {', '};'],
  ['pages/VisitHistory.jsx', 'const TYPE_LABEL = {', '};'],
  ['pages/Analytics.jsx', 'const TYPE_NAMES = {', '};'],
  ['pages/Admin.jsx', 'const AUDIT = {', '};'],
  ['pages/PatientDetail.jsx', "const SEX = {", 'function Vital'],
  ['pages/PatientDetail.jsx', "{[['Phone', d.phone]", '.map(([k, v])'],
  ['pages/Patients.jsx', 'const SEX = {', '};'],
  ['pages/MaternalHealth.jsx', 'const RISK = {', '};'],
  ['context/AuthContext.jsx', 'export const ROLE_TABS = {', 'function checkTab'],
  ['offline/networkSim.js', 'export const PROFILES = {', '};'],
  ['utils/format.js', 'export const FIELD_LABELS = {', '};'],
];
const IGNORE_IN_LISTS = new Set(['worker', 'doctor', 'patient', 'supervisor', 'admin', 'real', 'offline', 'flaky', 'off', 'sync', 'done',
  'what', 'day', 'why', 'solve', 'try', 'words', 'pine', 'lali', 'marigold', 'sky', 'neutral', 'ok', 'female', 'male', 'other']);

for (const file of files(src)) {
  const rel = path.relative(src, file).split(path.sep).join('/');
  const text = fs.readFileSync(file, 'utf8');
  // t({ a: 'Text', b: 'Other text' }[choice]) - every quoted value inside the object is shown.
  for (const m of text.matchAll(/(?<![\w.])t\(\s*\{([^{}]*)\}\s*\[/g)) {
    for (const v of m[1].matchAll(/:\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g)) add(v[1] !== undefined ? unescape(v[1], "'") : unescape(v[2], '"'), rel);
    for (const v of m[1].matchAll(/\?\s*'((?:[^'\\]|\\.)*)'\s*:\s*'((?:[^'\\]|\\.)*)'/g)) { add(unescape(v[1], "'"), rel); add(unescape(v[2], "'"), rel); }
  }
  for (const m of text.matchAll(CALL)) {
    const s = m[1] !== undefined ? unescape(m[1], "'") : m[2] !== undefined ? unescape(m[2], '"') : unescape(m[3], '`');
    add(s, rel);
  }
  // Text inside <T>...</T> in the drawings of ProblemDetail (translated by T itself).
  if (rel === 'pages/ProblemDetail.jsx') for (const m of text.matchAll(/<T\b[^>]*>([^<>{}]*[A-Za-z][^<>{}]*)<\/T>/g)) add(m[1].trim(), rel);
  for (const [f, start, end] of CONTENT) {
    if (f !== rel) continue;
    const a = text.indexOf(start);
    if (a < 0) { console.error(`marker not found in ${f}: ${start}`); process.exitCode = 2; continue; }
    const b = text.indexOf(end, a + start.length);
    // Drawing text like <T>phone's</T> is handled above; remove it so its apostrophes cannot confuse the quote scan.
    const block = text.slice(a, b < 0 ? undefined : b).replace(/<T\b[^>]*>[^<]*<\/T>/g, '');
    for (const m of block.matchAll(LIST_STRINGS)) {
      const s = m[1] !== undefined ? unescape(m[1], "'") : unescape(m[2], '"');
      if (IGNORE_IN_LISTS.has(s) || /^(#|\/|[a-z]+-[a-z]|bg-|text-|[a-z]+$|[A-Z]+$|\d)/.test(s) && !/\s/.test(s)) continue;
      if (/^(bg|text|border)-/.test(s)) continue;
      if (/^[a-z0-9_.]+$/.test(s)) continue; // codes, usernames, demo passwords (never shown with t)
      if (/^(M\s?-?\d|translate|scale|rotate|url\(|#|\d)/.test(s) || /^(middle|start|end|round|none)$/.test(s)) continue; // SVG drawing values
      if (/[\n{}<>]/.test(s) || /^[\s,]/.test(s)) continue; // pieces of code caught between two quotes
      add(s, rel);
    }
  }
}

// Texts that come from shared code (form field labels, risk flags, password rules, Visit/Patient labels).
const shared = (f) => pathToFileURL(path.join(root, 'shared', f)).href;
const { ENTITIES, riskFlags } = await import(shared('schema.js'));
const { passwordChecks } = await import(shared('accounts.js'));
for (const def of Object.values(ENTITIES)) {
  add(def.label, 'shared/schema.js');
  for (const spec of Object.values(def.fields)) add(spec.label, 'shared/schema.js');
}
for (const f of riskFlags({ bpSystolic: 150, hemoglobin: 8, dangerSigns: 'x', riskLevel: 'high' })) add(f, 'shared/schema.js');
for (const c of passwordChecks('')) add(c.label, 'shared/accounts.js');
for (const op of ['New', 'Edit', 'Delete']) for (const e of ['patient', 'pregnancy', 'visit']) add(`${op} ${e}`, 'pages/SyncStatus.jsx');

const all = [...keys.keys()].sort();
if (process.argv.includes('--list')) {
  console.log(JSON.stringify(all, null, 1));
  process.exit(0);
}

const NE = (await import(pathToFileURL(path.join(src, 'i18n', 'ne.js')).href)).default;
const missing = all.filter((k) => NE[k] === undefined);
const empty = all.filter((k) => NE[k] !== undefined && !String(NE[k]).trim());
const latinOnly = all.filter((k) => NE[k] && !/[ऀ-ॿ]/.test(NE[k]) && !/^[{}\w\s.,:%#+/()×→-]*$/.test(NE[k]));
const badVars = all.filter((k) => NE[k] && JSON.stringify((k.match(/\{\w+\}/g) || []).sort()) !== JSON.stringify((String(NE[k]).match(/\{\w+\}/g) || []).sort()));
const unused = Object.keys(NE).filter((k) => !keys.has(k));

console.log(`English texts found in the app: ${all.length}`);
console.log(`Nepali translations: ${Object.keys(NE).length}`);
const report = (title, list) => { if (list.length) console.log(`\n${title} (${list.length}):\n  ${list.slice(0, 80).map((k) => `${JSON.stringify(k)}  [${keys.get(k) || ''}]`).join('\n  ')}`); };
report('MISSING Nepali translation', missing);
report('EMPTY Nepali translation', empty);
report('PLACEHOLDERS like {n} do not match', badVars);
report('Nepali text has no Devanagari letters (check)', latinOnly);
if (process.argv.includes('--unused')) report('Not used anywhere (can be removed)', unused);
const failed = missing.length || empty.length || badVars.length;
console.log(failed ? '\nFAILED' : '\nOK: every English text has a Nepali translation with matching placeholders.');
process.exit(failed ? 1 : process.exitCode || 0);
