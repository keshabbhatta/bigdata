// Demo users + SYNTHETIC patient data (no real people). Data is inserted through
// the real sync pipeline, so it also lands in the outbox -> Kafka -> Spark.
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import { query } from './pool.js';
import { processEvent } from '../services/syncService.js';
import { HybridLogicalClock } from '../../../shared/hlc.js';
import { eddFromLmp } from '../../../shared/schema.js';
import { DEMO_WARDS, NATION } from '../../../shared/areas.js';

// Demo area: wards 1-3 of Indrawati Rural Municipality, Sindhupalchok, Bagmati Province.
const [W1, W2, W3] = DEMO_WARDS;

export const DEMO_USERS = [
  { username: 'admin', password: 'admin123', fullName: 'System Admin', role: 'admin', wards: [NATION] },
  { username: 'supervisor', password: 'super123', fullName: 'Dr. Anita Sharma', role: 'supervisor', wards: [NATION] },
  { username: 'sita', password: 'fchv123', fullName: 'Sita Tamang', role: 'worker', wards: [W1] },
  { username: 'gita', password: 'fchv123', fullName: 'Gita Gurung', role: 'worker', wards: [W1] },
  { username: 'maya', password: 'fchv123', fullName: 'Maya Rai', role: 'worker', wards: [W2] },
  { username: 'kamala', password: 'fchv123', fullName: 'Kamala Thapa', role: 'worker', wards: [W3] },
];

const VILLAGES = { [W1]: ['Simle', 'Dhuseni'], [W2]: ['Chisapani', 'Kalimati'], [W3]: ['Bhanjyang', 'Thulogaun'] };
const FEMALE = ['Sabina', 'Anjali', 'Kamala', 'Laxmi', 'Sarita', 'Puja', 'Asmita', 'Rekha', 'Bimala', 'Sunita', 'Radha',
  'Parbati', 'Durga', 'Kabita', 'Manisha', 'Srijana', 'Nirmala', 'Sushila', 'Januka', 'Mina', 'Rita', 'Samjhana'];
const MALE = ['Ram', 'Hari', 'Bikash', 'Suman', 'Rajesh', 'Dipak', 'Krishna', 'Prakash', 'Nabin', 'Bishnu'];
const FAMILY = ['Tamang', 'Gurung', 'Thapa', 'Magar', 'Rai', 'Shrestha', 'Karki', 'Bhattarai', 'Adhikari', 'Khadka', 'Lama', 'Sunar', 'Basnet', 'Pandey'];

// Small deterministic random generator so every fresh install gets the same data.
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

const day = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

export async function seedUsers() {
  for (const u of DEMO_USERS) {
    const hash = await bcrypt.hash(u.password, 10);
    await query(
      `INSERT INTO users (username, password_hash, full_name, role, wards) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (username) DO NOTHING`,
      [u.username, hash, u.fullName, u.role, u.wards],
    );
  }
}

// Demo patient account: linked to the first active high-risk pregnancy in Ward 1.
export async function seedPatientUser() {
  const exists = await query("SELECT 1 FROM users WHERE username = 'mother'");
  if (exists.rowCount) return;
  const { rows } = await query(
    `SELECT pt.id, pt.data->>'name' AS name FROM records pr
     JOIN records pt ON pt.id::text = pr.data->>'patientId'
     WHERE pr.entity = 'pregnancy' AND pr.ward = $1 AND pr.data->>'status' = 'active' AND NOT pr.deleted
     ORDER BY (pr.data->>'riskLevel' = 'high') DESC, pr.created_at LIMIT 1`, [W1],
  );
  if (!rows[0]) return;
  await query(
    `INSERT INTO users (username, password_hash, full_name, role, wards, patient_id)
     VALUES ('mother', $1, $2, 'patient', $4, $3) ON CONFLICT (username) DO NOTHING`,
    [await bcrypt.hash('patient123', 10), rows[0].name, rows[0].id, [W1]],
  );
}

export async function seedDemoData({ force = false } = {}) {
  await seedUsers();
  const existing = (await query('SELECT count(*)::int AS n FROM records')).rows[0].n;
  if (existing > 0 && !force) { await seedPatientUser(); return { skipped: true }; }

  const admin = (await query("SELECT id, username, full_name AS name, role, wards FROM users WHERE username = 'admin'")).rows[0];
  const rand = rng(20261120);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const int = (a, b) => a + Math.floor(rand() * (b - a + 1));
  const today = new Date();
  let counter = 0;
  let clockNow = Date.now();
  const clock = new HybridLogicalClock('seed-device', { now: () => clockNow });
  let count = 0;

  const emit = async (entity, ward, changes, at) => {
    clockNow = at.getTime();
    counter += 1;
    const recordId = crypto.randomUUID();
    const r = await processEvent({
      eventId: crypto.randomUUID(), recordId, entity, ward, op: 'CREATE', changes,
      seenVV: {}, dot: { d: 'seed-device', c: counter }, hlc: clock.now(), schemaVersion: 2, createdAt: at.toISOString(),
    }, admin, 'seed-device');
    if (r.status === 'rejected') throw new Error(`Seed event rejected: ${r.reason}`);
    count += 1;
    return recordId;
  };

  let pregnancyCount = 0;
  for (const ward of Object.keys(VILLAGES)) {
    for (let i = 0; i < 30; i += 1) {
      const female = rand() < 0.72;
      const registered = addDays(today, -int(5, 180));
      const age = female ? int(17, 44) : int(20, 70);
      const village = pick(VILLAGES[ward]);
      const patientId = await emit('patient', ward, {
        name: `${female ? pick(FEMALE) : pick(MALE)} ${pick(FAMILY)}`,
        age, sex: female ? 'female' : 'male',
        phone: rand() < 0.7 ? `98${int(10000000, 99999999)}` : '',
        village, household: `H-${int(1, 140)}`,
        bloodGroup: pick(['', 'A+', 'B+', 'O+', 'AB+', 'O-']),
        allergies: rand() < 0.1 ? 'Penicillin' : '',
        chronicConditions: rand() < 0.08 ? 'Hypertension' : '',
        notes: '',
      }, registered);

      // General / immunization visits
      for (let v = 0; v < int(1, 3); v += 1) {
        const vd = addDays(today, -int(0, 60));
        await emit('visit', ward, {
          patientId, type: pick(['general', 'general', 'immunization']), date: day(vd),
          temperatureC: Number((36 + rand() * 2.2).toFixed(1)), findings: pick(['Fever and cough', 'Routine check', 'Vaccination given', 'Diarrhoea, ORS given', 'Headache']),
          followUpDate: rand() < 0.4 ? day(addDays(vd, 7)) : '',
        }, vd);
      }

      // Pregnancies for some women of reproductive age
      if (female && age >= 18 && age <= 40 && rand() < 0.6) {
        const weeks = int(8, 38);
        const lmp = addDays(today, -weeks * 7);
        pregnancyCount += 1;
        const risk = pregnancyCount % 4 === 1 ? 'high' : rand() < 0.35 ? 'moderate' : 'low';
        const sys = risk === 'high' ? int(138, 156) : int(104, 128);
        const dia = risk === 'high' ? int(88, 100) : int(64, 84);
        const pregId = await emit('pregnancy', ward, {
          patientId, lmp: day(lmp), edd: eddFromLmp(day(lmp)), gravida: int(1, 4), parity: int(0, 3),
          riskLevel: risk, bpSystolic: sys, bpDiastolic: dia, hemoglobin: Number((risk === 'high' ? 8.8 + rand() * 1.5 : 10.5 + rand() * 2).toFixed(1)),
          weightKg: int(45, 68), dangerSigns: risk === 'high' && rand() < 0.5 ? 'Swelling of face and hands' : '',
          status: 'active', nextVisitDate: day(addDays(today, int(-3, 12))),
        }, addDays(lmp, 49));
        // ANC visits roughly every 4 weeks after week 8
        for (let w = 8; w <= weeks; w += int(4, 6)) {
          const vd = addDays(lmp, w * 7);
          if (vd > today) break;
          await emit('visit', ward, {
            patientId, pregnancyId: pregId, type: 'ANC', date: day(vd),
            bpSystolic: sys + int(-6, 6), bpDiastolic: dia + int(-5, 5), weightKg: int(45, 70),
            hemoglobin: Number((9 + rand() * 3).toFixed(1)), findings: pick(['Normal ANC check', 'Iron and folic acid given', 'TT vaccine given', 'Advised rest']),
            followUpDate: day(addDays(vd, 28)),
          }, vd);
        }
      }
    }
  }
  console.log(`[seed] inserted ${count} synthetic records`);
  await seedPatientUser();
  return { inserted: count };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { migrate } = await import('./migrate.js');
  await migrate();
  const r = await seedDemoData({ force: process.argv.includes('--force') });
  console.log(r);
  process.exit(0);
}
