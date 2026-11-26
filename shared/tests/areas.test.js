import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TOTALS, provinces, localLevels, parseArea, isValidWard, inScope, scopePatterns, areaLabel, wardCode,
  districtsOf, localLevelsOf, wardsOf, DEMO_WARDS, upgradeWard, NATION,
} from '../areas.js';

test('Nepal has 7 provinces, 77 districts, 753 local levels and 6,743 wards', () => {
  assert.deepEqual(TOTALS, { provinces: 7, districts: 77, localLevels: 753, wards: 6743 });
  const types = {};
  for (const l of localLevels) types[l.type.short] = (types[l.type.short] || 0) + 1;
  assert.deepEqual(types, { MC: 6, SMC: 11, M: 276, RM: 460 });
  assert.equal(provinces.reduce((n, p) => n + districtsOf(p.id).length, 0), 77);
});

test('every single ward has a valid, unique code', () => {
  const codes = new Set();
  for (const l of localLevels) for (const w of wardsOf(l.id)) codes.add(wardCode(l.provinceId, l.districtId, l.id, w));
  assert.equal(codes.size, 6743);
  for (const c of codes) assert.ok(isValidWard(c), c);
});

test('codes are checked against the real structure', () => {
  const kathmandu = localLevels.find((l) => l.name === 'Kathmandu' && l.type.short === 'MC');
  assert.equal(kathmandu.wards, 32);
  assert.ok(isValidWard(wardCode(3, kathmandu.districtId, kathmandu.id, 32)));
  assert.equal(isValidWard(wardCode(3, kathmandu.districtId, kathmandu.id, 33)), false); // no ward 33
  assert.equal(parseArea(wardCode(1, kathmandu.districtId, kathmandu.id, 1)), null);    // wrong province
  assert.equal(parseArea('ward-1'), null);
  assert.equal(parseArea(NATION).level, 'nation');
});

test('scopes: a ward is inside its local level, district, province and Nepal', () => {
  const w = DEMO_WARDS[0];
  const a = parseArea(w);
  assert.ok(inScope(w, [a.local.code]) && inScope(w, [a.district.code]) && inScope(w, ['P3']) && inScope(w, [NATION]));
  assert.equal(inScope(w, [DEMO_WARDS[1]]), false);
  assert.equal(inScope('P3-D35-L386-W01', ['P3-D35-L38']), false); // prefix must end at a code boundary
  assert.equal(scopePatterns([NATION]), null);
  assert.deepEqual(scopePatterns(['P3']), ['P3', 'P3-%']);
});

test('labels and legacy demo codes', () => {
  assert.equal(areaLabel(DEMO_WARDS[0], { short: true }), 'Ward 1, Indrawati RM');
  assert.equal(areaLabel(DEMO_WARDS[0]), 'Ward 1, Indrawati Rural Municipality, Sindhupalchok District, Bagmati Province');
  assert.equal(upgradeWard('ward-2'), DEMO_WARDS[1]);
  assert.ok(localLevelsOf(35).some((l) => l.name === 'Indrawati'));
});
