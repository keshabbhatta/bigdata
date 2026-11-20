// Analytics for the dashboard.
//
// Separation of operational and analytical workloads: heavy aggregates are
// computed by Spark (batch every night + streaming from Kafka) into an_* tables.
// This service only READS those results, from the read replica. When Spark has
// not run yet (e.g. on a single free cloud server), it falls back to computing
// the same numbers with live SQL, and says so in the "source" field.

import { readQuery } from '../database/pool.js';
import { allowedWards } from '../middleware/auth.js';

const wardFilter = (alias = '') => `($1::text[] IS NULL OR ${alias}ward = ANY($1))`;

export async function getAnalytics(user, wardParam) {
  let wards = allowedWards(user);
  if (wardParam) wards = wards ? wards.filter((w) => w === wardParam) : [wardParam];
  const p = [wards];

  const [totals, sparkRun] = await Promise.all([
    readQuery(
      `SELECT
        count(*) FILTER (WHERE entity = 'patient')                                        AS patients,
        count(*) FILTER (WHERE entity = 'pregnancy' AND data->>'status' = 'active')       AS active_pregnancies,
        count(*) FILTER (WHERE entity = 'pregnancy' AND data->>'status' = 'active'
                          AND data->>'riskLevel' = 'high')                                 AS high_risk,
        count(*) FILTER (WHERE entity = 'visit')                                          AS visits,
        count(*) FILTER (WHERE entity = 'visit' AND data->>'type' IN ('ANC','PNC'))       AS maternal_visits,
        count(*) FILTER (WHERE entity = 'visit' AND data->>'date' >= to_char(date_trunc('month', current_date), 'YYYY-MM-DD')) AS visits_this_month,
        coalesce(sum(open_conflicts), 0)                                                  AS open_conflicts
       FROM records WHERE NOT deleted AND ${wardFilter()}`, p),
    readQuery("SELECT job, finished_at, duration_ms, rows_in, rows_out FROM an_job_runs WHERE job = 'nightly-batch' ORDER BY id DESC LIMIT 1"),
  ]);

  const devices = await readQuery(
    `SELECT coalesce(sum(d.pending_reported), 0) AS pending,
            count(DISTINCT d.user_id) FILTER (WHERE d.last_seen > now() - interval '7 days') AS active_workers
     FROM devices d JOIN users u ON u.id = d.user_id
     WHERE $1::text[] IS NULL OR u.wards && $1`, p,
  );

  const useSpark = sparkRun.rows.length > 0;
  const sections = useSpark ? await fromSpark(p) : await fromLiveSql(p);
  const stream = await readQuery(
    // Streaming runs in "update" mode, so a window can be written several times as
    // late events arrive; keep only the newest count for each window.
    `SELECT date_trunc('minute', window_start) AS minute, topic, sum(events)::int AS events
     FROM (SELECT DISTINCT ON (window_start, topic, ward, op) window_start, topic, ward, op, events
           FROM an_stream_counts WHERE window_start > now() - interval '2 hours' AND ${wardFilter()}
           ORDER BY window_start, topic, ward, op, computed_at DESC) latest
     GROUP BY 1, 2 ORDER BY 1`, p,
  );
  const jobs = await readQuery('SELECT job, started_at, finished_at, duration_ms, rows_in, rows_out FROM an_job_runs ORDER BY id DESC LIMIT 10');

  const t = totals.rows[0];
  return {
    source: useSpark ? 'spark' : 'live-sql',
    computedAt: useSpark ? sparkRun.rows[0].finished_at : new Date().toISOString(),
    totals: {
      patients: t.patients, activePregnancies: t.active_pregnancies, highRisk: t.high_risk, visits: t.visits,
      maternalVisits: t.maternal_visits, visitsThisMonth: t.visits_this_month, openConflicts: t.open_conflicts,
      pendingSync: devices.rows[0].pending, activeWorkers: devices.rows[0].active_workers,
    },
    ...sections,
    stream: stream.rows,
    jobs: jobs.rows,
  };
}

async function fromSpark(p) {
  const [daily, villages, monthly, follow] = await Promise.all([
    readQuery(`SELECT to_char(day, 'YYYY-MM-DD') AS day, visit_type AS type, sum(visits)::int AS count
               FROM an_daily_visits WHERE day >= current_date - 30 AND ${wardFilter()} GROUP BY 1, 2 ORDER BY 1`, p),
    readQuery(`SELECT village, sum(patients)::int AS patients, sum(pregnancies)::int AS pregnancies, sum(high_risk)::int AS high_risk
               FROM an_village_stats WHERE ${wardFilter()} GROUP BY 1 ORDER BY 2 DESC`, p),
    readQuery(`SELECT month, sum(registrations)::int AS count FROM an_monthly_registrations WHERE ${wardFilter()} GROUP BY 1 ORDER BY 1`, p),
    readQuery(`SELECT coalesce(sum(due),0)::int AS due, coalesce(sum(completed),0)::int AS completed FROM an_followup WHERE ${wardFilter()}`, p),
  ]);
  return shape(daily.rows, villages.rows, monthly.rows, follow.rows[0]);
}

async function fromLiveSql(p) {
  const [daily, villages, monthly, follow] = await Promise.all([
    readQuery(`SELECT data->>'date' AS day, data->>'type' AS type, count(*)::int AS count
               FROM records WHERE entity = 'visit' AND NOT deleted AND ${wardFilter()}
                 AND data->>'date' >= to_char(current_date - 30, 'YYYY-MM-DD')
               GROUP BY 1, 2 ORDER BY 1`, p),
    readQuery(`SELECT pt.data->>'village' AS village,
                      count(DISTINCT pt.id)::int AS patients,
                      count(DISTINCT pr.id) FILTER (WHERE pr.data->>'status' = 'active')::int AS pregnancies,
                      count(DISTINCT pr.id) FILTER (WHERE pr.data->>'status' = 'active' AND pr.data->>'riskLevel' = 'high')::int AS high_risk
               FROM records pt
               LEFT JOIN records pr ON pr.entity = 'pregnancy' AND NOT pr.deleted AND pr.data->>'patientId' = pt.id::text
               WHERE pt.entity = 'patient' AND NOT pt.deleted AND ${wardFilter('pt.')}
               GROUP BY 1 ORDER BY 2 DESC`, p),
    readQuery(`SELECT to_char(created_at, 'YYYY-MM') AS month, count(*)::int AS count
               FROM records WHERE entity = 'patient' AND NOT deleted AND ${wardFilter()} GROUP BY 1 ORDER BY 1`, p),
    readQuery(`SELECT count(*)::int AS due,
                      count(*) FILTER (WHERE EXISTS (
                        SELECT 1 FROM records v2 WHERE v2.entity = 'visit' AND NOT v2.deleted
                          AND v2.data->>'patientId' = v.data->>'patientId' AND v2.id <> v.id
                          AND v2.data->>'date' >= v.data->>'followUpDate'))::int AS completed
               FROM records v WHERE v.entity = 'visit' AND NOT v.deleted AND ${wardFilter('v.')}
                 AND coalesce(v.data->>'followUpDate', '') <> ''
                 AND v.data->>'followUpDate' <= to_char(current_date, 'YYYY-MM-DD')`, p),
  ]);
  return shape(daily.rows, villages.rows, monthly.rows, follow.rows[0]);
}

function shape(dailyRows, villages, monthly, follow) {
  const byDay = new Map();
  const types = new Map();
  for (const r of dailyRows) {
    if (!byDay.has(r.day)) byDay.set(r.day, { day: r.day });
    byDay.get(r.day)[r.type] = (byDay.get(r.day)[r.type] || 0) + r.count;
    types.set(r.type, (types.get(r.type) || 0) + r.count);
  }
  const due = follow?.due || 0;
  const completed = follow?.completed || 0;
  return {
    dailyVisits: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)),
    visitTypes: [...types.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    villages: villages.map((v) => ({ village: v.village || 'Unknown', patients: v.patients, pregnancies: v.pregnancies, highRisk: v.high_risk })),
    monthlyRegistrations: monthly.map((m) => ({ month: m.month, count: m.count })),
    followUp: { due, completed, rate: due ? completed / due : null },
  };
}
