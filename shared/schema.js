// Shared data model for Sewika.
// Used by BOTH the React app and the Node backend so the two sides always agree
// on what a record looks like (DDIA Ch.3 — data models; Ch.5 — encoding & evolution).
//
// Records are stored as JSON documents (document model). Each entity lists its
// fields, and which of those fields are *clinical*. Clinical fields are never
// silently overwritten when two workers edit them concurrently — both values are
// kept and the record is flagged for review.

import { DEMO_WARDS, areaLabel } from './areas.js';

export const SCHEMA_VERSION = 2;

// Wards are real wards of Nepal (7 provinces, 77 districts, 753 local levels,
// 6,743 wards). See shared/areas.js. WARDS lists only the demo wards.
export const WARDS = DEMO_WARDS.map((id) => ({ id, name: areaLabel(id, { short: true }) }));

export const ENTITIES = {
  patient: {
    label: 'Patient',
    appendOnly: false,
    topic: 'patient-events',
    fields: {
      name: { type: 'string', required: true, label: 'Full name' },
      age: { type: 'number', min: 0, max: 120, label: 'Age (years)' },
      sex: { type: 'enum', values: ['female', 'male', 'other'], label: 'Sex' },
      phone: { type: 'string', label: 'Phone' },
      village: { type: 'string', required: true, label: 'Village / tole' },
      household: { type: 'string', label: 'Household no.' },
      bloodGroup: { type: 'enum', values: ['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'], label: 'Blood group' },
      allergies: { type: 'string', label: 'Allergies' },
      chronicConditions: { type: 'string', label: 'Chronic conditions' },
      notes: { type: 'string', label: 'Notes' },
    },
    clinical: ['bloodGroup', 'allergies', 'chronicConditions'],
  },

  pregnancy: {
    label: 'Pregnancy',
    appendOnly: false,
    topic: 'maternal-health-events',
    fields: {
      patientId: { type: 'string', required: true, label: 'Patient' },
      lmp: { type: 'date', label: 'Last menstrual period' },
      edd: { type: 'date', label: 'Expected delivery date' },
      gravida: { type: 'number', min: 1, max: 20, label: 'Gravida' },
      parity: { type: 'number', min: 0, max: 20, label: 'Parity' },
      riskLevel: { type: 'enum', values: ['low', 'moderate', 'high'], label: 'Risk level' },
      bpSystolic: { type: 'number', min: 50, max: 260, label: 'BP systolic' },
      bpDiastolic: { type: 'number', min: 30, max: 160, label: 'BP diastolic' },
      hemoglobin: { type: 'number', min: 2, max: 20, label: 'Hemoglobin (g/dL)' },
      weightKg: { type: 'number', min: 20, max: 200, label: 'Weight (kg)' },
      dangerSigns: { type: 'string', label: 'Danger signs' },
      status: { type: 'enum', values: ['active', 'delivered', 'closed'], label: 'Status' },
      nextVisitDate: { type: 'date', label: 'Next ANC visit' },
      deliveryDate: { type: 'date', label: 'Delivery date' },
      outcome: { type: 'string', label: 'Outcome' },
    },
    clinical: ['lmp', 'edd', 'riskLevel', 'bpSystolic', 'bpDiastolic', 'hemoglobin', 'weightKg', 'dangerSigns'],
  },

  // Visits are append-only (an immutable event log of what happened).
  // A wrong visit is never edited; a new visit that corrects it is recorded instead.
  visit: {
    label: 'Visit',
    appendOnly: true,
    topic: 'clinic-visit-events',
    fields: {
      patientId: { type: 'string', required: true, label: 'Patient' },
      pregnancyId: { type: 'string', label: 'Pregnancy' },
      type: { type: 'enum', values: ['ANC', 'PNC', 'general', 'immunization', 'referral'], label: 'Visit type' },
      date: { type: 'date', required: true, label: 'Visit date' },
      bpSystolic: { type: 'number', min: 50, max: 260, label: 'BP systolic' },
      bpDiastolic: { type: 'number', min: 30, max: 160, label: 'BP diastolic' },
      weightKg: { type: 'number', min: 1, max: 200, label: 'Weight (kg)' },
      temperatureC: { type: 'number', min: 30, max: 45, label: 'Temperature (°C)' },
      hemoglobin: { type: 'number', min: 2, max: 20, label: 'Hemoglobin (g/dL)' },
      findings: { type: 'string', label: 'Findings' },
      referredTo: { type: 'string', label: 'Referred to' },
      followUpDate: { type: 'date', label: 'Follow-up date' },
      correctsVisitId: { type: 'string', label: 'Corrects visit' },
    },
    clinical: [],
  },
};

export const OPS = ['CREATE', 'UPDATE', 'DELETE'];

export function isClinical(entity, field) {
  return Boolean(ENTITIES[entity]?.clinical.includes(field));
}

// Validate a set of field changes. Returns a list of human readable problems.
export function validateChanges(entity, changes, { requireAll = false } = {}) {
  const def = ENTITIES[entity];
  if (!def) return [`Unknown entity "${entity}"`];
  const problems = [];
  for (const [field, value] of Object.entries(changes || {})) {
    const spec = def.fields[field];
    if (!spec) { problems.push(`Unknown field "${field}"`); continue; }
    if (value === null || value === '' || value === undefined) continue;
    if (spec.type === 'number') {
      if (typeof value !== 'number' || Number.isNaN(value)) problems.push(`${spec.label} must be a number`);
      else if ((spec.min !== undefined && value < spec.min) || (spec.max !== undefined && value > spec.max))
        problems.push(`${spec.label} must be between ${spec.min} and ${spec.max}`);
    } else if (spec.type === 'enum') {
      if (!spec.values.includes(value)) problems.push(`${spec.label} must be one of: ${spec.values.filter(Boolean).join(', ')}`);
    } else if (spec.type === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) problems.push(`${spec.label} must be a date (YYYY-MM-DD)`);
    } else if (typeof value !== 'string') {
      problems.push(`${spec.label} must be text`);
    } else if (value.length > 2000) {
      problems.push(`${spec.label} is too long`);
    }
  }
  if (requireAll) {
    for (const [field, spec] of Object.entries(def.fields)) {
      if (spec.required && (changes?.[field] === undefined || changes[field] === '')) problems.push(`${spec.label} is required`);
    }
  }
  return problems;
}

// ---- Schema evolution (DDIA Ch.5) -------------------------------------------
// Phones in the field cannot all be updated at once, so the server must accept
// events written by older app versions. "Upcasters" translate old events into
// the current shape. Version 1 of the app stored blood pressure as one string
// ("120/80") and weight as "weight"; version 2 splits them.
export function upcastEvent(event) {
  let e = { ...event, changes: { ...(event.changes || {}) } };
  const v = e.schemaVersion || 1;
  if (v < 2) {
    const c = e.changes;
    if (typeof c.bp === 'string' && c.bp.includes('/')) {
      const [s, d] = c.bp.split('/').map((x) => Number(x.trim()));
      if (!Number.isNaN(s)) c.bpSystolic = s;
      if (!Number.isNaN(d)) c.bpDiastolic = d;
    }
    delete c.bp;
    if (c.weight !== undefined) { c.weightKg = Number(c.weight); delete c.weight; }
    e.schemaVersion = 2;
    e.upcastedFrom = v;
  }
  return e;
}

// Gestational age in weeks from LMP (used by the maternal health screens).
export function gestationalWeeks(lmp, today = new Date()) {
  if (!lmp) return null;
  const days = Math.floor((today - new Date(lmp + 'T00:00:00')) / 86400000);
  if (days < 0) return null;
  return Math.floor(days / 7);
}

export function eddFromLmp(lmp) {
  if (!lmp) return '';
  const d = new Date(lmp + 'T00:00:00');
  d.setDate(d.getDate() + 280);
  return d.toISOString().slice(0, 10);
}

// Simple rule-based danger flags (shown as "needs attention" in the app).
export function riskFlags(p = {}) {
  const flags = [];
  if (p.bpSystolic >= 140 || p.bpDiastolic >= 90) flags.push('High blood pressure');
  if (p.hemoglobin && p.hemoglobin < 10) flags.push('Low hemoglobin');
  if (p.dangerSigns && p.dangerSigns.trim()) flags.push('Danger signs reported');
  if (p.riskLevel === 'high') flags.push('Marked high risk');
  return flags;
}
