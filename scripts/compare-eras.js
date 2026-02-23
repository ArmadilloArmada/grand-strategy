const fs = require('fs');
const path = require('path');

const eras = ['wwi-units', 'wwii-units', 'coldwar-units', 'modern-units'];

const allEras = {};
for (const era of eras) {
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/units/' + era + '.json'), 'utf8'));
  // find the array — could be raw array, .unitTypes, .units, or top-level object
  const units = Array.isArray(raw) ? raw
    : Array.isArray(raw.unitTypes) ? raw.unitTypes
    : Array.isArray(raw.units) ? raw.units
    : Object.values(raw);
  allEras[era] = units;
}

// Print side-by-side comparison
const unitIds = [...new Set(Object.values(allEras).flat().map(u => u.id))];

console.log('\nUnit stat comparison across eras (atk/def/mov/cost/hp):');
console.log('='.repeat(90));
const header = 'Unit'.padEnd(16) + eras.map(e => e.replace('-units','').padEnd(22)).join('');
console.log(header);
console.log('-'.repeat(90));

for (const id of unitIds) {
  let row = id.padEnd(16);
  for (const era of eras) {
    const u = allEras[era].find(x => x.id === id);
    if (!u) {
      row += '(not in era)'.padEnd(22);
    } else {
      const hp = u.hitPoints || 1;
      row += ('a'+u.attack+' d'+u.defense+' m'+u.movement+' c'+u.cost+(hp>1?' hp'+hp:'')).padEnd(22);
    }
  }
  console.log(row);
}

// Check for issues: units with identical stats across all eras (no scaling)
console.log('\n\nISSUES — units with NO stat changes across eras:');
let found = 0;
for (const id of unitIds) {
  const present = eras.filter(e => allEras[e].find(u => u.id === id));
  if (present.length < 2) continue;
  const stats = present.map(e => {
    const u = allEras[e].find(x => x.id === id);
    return JSON.stringify({ a: u.attack, d: u.defense, m: u.movement, c: u.cost });
  });
  const allSame = stats.every(s => s === stats[0]);
  if (allSame) {
    console.log('  ' + id + ' — identical in all eras: ' + stats[0]);
    found++;
  }
}
if (!found) console.log('  None — all units scale correctly across eras.');

// Check if era switching code actually loads different units
console.log('\n\nChecking how eras are applied in main.ts...');
const main = fs.readFileSync(path.join(__dirname, '../src/main.ts'), 'utf8');
const eraLines = main.split('\n').map((l, i) => ({l, i})).filter(x => x.l.includes('unit-era') || x.l.includes('unitEra') || x.l.includes('UNIT_ERAS') || x.l.includes('era'));
for (const {l, i} of eraLines.slice(0, 20)) {
  console.log('  main.ts:' + (i+1) + '  ' + l.trim());
}
