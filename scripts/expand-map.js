/**
 * Map expansion — widens Atlantic and Indian Ocean so ocean crossings
 * require 2+ turns instead of 1.
 *
 * Steps:
 *  1. Shift all territories x≥500 east by +100px  (widens Atlantic)
 *  2. Shift all territories x≥1200 east by +100px  (widens Pacific)
 *  3. Remove any adjacency links whose centres are now >120px apart
 *     (these are stale cross-ocean direct links that the shift broke)
 *  4. Insert new Atlantic sea-zone tiles to bridge the new gap
 *  5. Insert one extra Indian Ocean tile
 *  6. Make ALL adjacencies bidirectional
 *  7. Validate & save
 */

const fs   = require('fs');
const path = require('path');

const mapPath = path.join(__dirname, '../assets/maps/grid-world-map.json');
const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
const get = id => map.territories.find(t => t.id === id);

function dist(a, b) {
  return Math.sqrt(Math.pow(a.center[0]-b.center[0],2) + Math.pow(a.center[1]-b.center[1],2));
}
const link = (a, b) => {
  const ta = get(a), tb = get(b);
  if (!ta || !tb) { console.warn('  WARN link: missing', a, b); return; }
  if (!ta.adjacentTo.includes(b)) ta.adjacentTo.push(b);
  if (!tb.adjacentTo.includes(a)) tb.adjacentTo.push(a);
};
const unlink = (a, b) => {
  const ta = get(a), tb = get(b);
  if (ta) ta.adjacentTo = ta.adjacentTo.filter(x => x !== b);
  if (tb) tb.adjacentTo = tb.adjacentTo.filter(x => x !== a);
};

// ── 1. Shift ──────────────────────────────────────────────────────────────────
let s1 = 0, s2 = 0;
for (const t of map.territories) {
  if (t.center[0] >= 500) {
    t.center  = [t.center[0] + 100, t.center[1]];
    t.polygon = t.polygon.map(([x,y]) => [x + 100, y]);
    s1++;
  }
}
for (const t of map.territories) {
  if (t.center[0] >= 1200) {
    t.center  = [t.center[0] + 100, t.center[1]];
    t.polygon = t.polygon.map(([x,y]) => [x + 100, y]);
    s2++;
  }
}
console.log(`Shift 1: ${s1} territories moved +100px`);
console.log(`Shift 2: ${s2} territories moved +100px more (Pacific)`);

// ── 2. Remove stale links (centres now >120px apart) ─────────────────────────
// After the shift, some previously-adjacent territories are now far apart.
// Sea zones that span big areas legitimately can still link distant territories,
// so we only break links where BOTH endpoints are land/coastal territories or
// where the distance is >200px (clearly wrong).
let broken = 0;
for (const t of map.territories) {
  const toRemove = [];
  for (const adjId of t.adjacentTo) {
    const other = get(adjId);
    if (!other) { toRemove.push(adjId); continue; }
    const d = dist(t, other);
    // Break if both are non-sea and now far apart, OR if distance is absurd
    const bothLand = t.type !== 'sea' && other.type !== 'sea';
    if ((bothLand && d > 120) || d > 250) {
      toRemove.push(adjId);
    }
  }
  for (const id of toRemove) {
    t.adjacentTo = t.adjacentTo.filter(x => x !== id);
    const other = get(id);
    if (other) other.adjacentTo = other.adjacentTo.filter(x => x !== t.id);
    broken++;
  }
}
console.log(`Removed ${broken/2|0} stale cross-ocean adjacency pairs`);

// ── 3. Insert Atlantic sea zones (x = 500–600) ───────────────────────────────
// After shift, the gap x=500–625 (uk's new west edge) needs filling.
// We add two columns of sea zones: x=500–550 and x=550–600.
function sz(id, name, cx, cy, w, h) {
  return {
    id, name, type: 'sea', production: 0, adjacentTo: [],
    polygon: [[cx-w/2,cy-h/2],[cx+w/2,cy-h/2],[cx+w/2,cy+h/2],[cx-w/2,cy+h/2]],
    center: [cx, cy],
    owner: undefined, originalOwner: undefined, hasFactory: false, isCapital: false,
  };
}

const newZones = [
  sz('atl_mid_n',  'Mid-Atlantic (N)',   525,  75, 50, 50),   // y=50–100
  sz('atl_mid_u',  'Mid-Atlantic (U)',   525, 175, 50,150),   // y=100–250
  sz('atl_mid_l',  'Mid-Atlantic (L)',   525, 325, 50,150),   // y=250–400
  sz('atl_mid_s',  'Mid-Atlantic (S)',   525, 475, 50,100),   // y=400–550 → south
  sz('atl_east_n', 'East Atlantic (N)',  575,  75, 50, 50),
  sz('atl_east_u', 'East Atlantic (U)',  575, 175, 50,150),
  sz('atl_east_l', 'East Atlantic (L)',  575, 325, 50,150),
  sz('atl_east_s', 'East Atlantic (S)',  575, 475, 50,100),
];
map.territories.push(...newZones);
console.log(`Added ${newZones.length} Atlantic sea zones`);

// Wire east-west chain for each row
// north_atlantic eastern edge: x=500 → atl_mid_n (500–550) → atl_east_n (550–600) → uk/iceland (600+)
link('north_atlantic',  'atl_mid_n');
link('atl_mid_n',       'atl_east_n');
link('atl_east_n',      'uk');
link('atl_east_n',      'iceland');   // iceland didn't shift (x=375), but uk now at 625
// Actually iceland is at x=375 — that's west of the Atlantic. Route: iceland→north_atlantic→atl_mid_n→atl_east_n→uk
// So we don't link iceland directly to atl_east_n — leave iceland→north_atlantic→(chain)→uk
unlink('atl_east_n', 'iceland');  // iceland is on the OTHER side — remove this

// Main (upper) lane
link('atlantic_central', 'atl_mid_u');
link('atl_mid_u',        'atl_east_u');
link('atl_east_u',       'uk');
link('atl_east_u',       'france');
link('atl_east_u',       'portugal');

// Lower/southern lane
link('atlantic_central', 'atl_mid_l');
link('atl_mid_l',        'atl_east_l');
link('atl_east_l',       'spain');
link('atl_east_l',       'france');
link('atl_east_l',       'portugal');
link('atl_east_l',       'morocco');

// South lane (connects to south_atlantic / atlantic_south)
link('atlantic_south',   'atl_mid_s');
link('mid_atlantic',     'atl_mid_s');
link('atl_mid_s',        'atl_east_s');
link('atl_east_s',       'spain');
link('atl_east_s',       'portugal');
link('atl_east_s',       'morocco');

// Vertical connections in each column
link('atl_mid_n',  'atl_mid_u');
link('atl_mid_u',  'atl_mid_l');
link('atl_mid_l',  'atl_mid_s');
link('atl_east_n', 'atl_east_u');
link('atl_east_u', 'atl_east_l');
link('atl_east_l', 'atl_east_s');
// Cross column vertical
link('atl_mid_u',  'atl_east_u');
link('atl_mid_l',  'atl_east_l');

// celtic_sea (x=375) → english_channel → northern France route
// celtic_sea should now go through atl_mid / atl_east chain to reach UK
link('celtic_sea', 'atl_mid_n');
link('celtic_sea', 'atl_mid_u');

// norwegian_sea (x=525+100=625? No — norwegian_sea is at 525 original, x>=500, so now at 625)
// Wait: norwegian_sea center was (525,75). After shift: (625,75). It's now adjacent to uk (625,125)?
// Let me check. uk is at (525+100=625, 125). norwegian_sea is at (625, 75). They're 50px apart in y — adjacent!
// So the northern route: iceland→north_atlantic→atl_mid_n→atl_east_n→norwegian_sea→uk  works fine.
// But atl_east_n is at (575,75) and norwegian_sea is at (625,75) — they share the x=600 boundary! Auto-adjacent.
// Re-add the link:
link('atl_east_n', 'norwegian_sea');

console.log('Atlantic sea chain wired.');

// ── 4. Extra Indian Ocean tile ────────────────────────────────────────────────
// east_africa is at (725,475) after shift. indian_ocean_west is at (950,450).
// Route was: east_africa → indian_ocean_west = 1 hop (wrong, 225px apart but manually linked).
// The stale-link purge at step 2 should have removed this (both non-sea, d>120).
// Add a bridge tile:
const indBridge = sz('indian_ocean_sw', 'SW Indian Ocean', 825, 475, 50, 100);
map.territories.push(indBridge);
link('east_africa',        'indian_ocean_sw');
link('mozambique_channel', 'indian_ocean_sw');
link('south_africa',       'indian_ocean_sw');
link('indian_ocean_sw',    'indian_ocean_west');
link('indian_ocean_sw',    'arabian_sea');
console.log('Indian Ocean bridge tile added.');

// ── 5. Make all adjacencies bidirectional ─────────────────────────────────────
let fixed = 0;
for (const t of map.territories) {
  for (const adjId of [...t.adjacentTo]) {
    const other = get(adjId);
    if (other && !other.adjacentTo.includes(t.id)) {
      other.adjacentTo.push(t.id);
      fixed++;
    }
  }
}
console.log(`Fixed ${fixed} one-way adjacencies → now fully bidirectional.`);

// ── 6. Update map dimensions ──────────────────────────────────────────────────
map.width   = 1900;
map.version = '3.5.0';

// ── 7. Validate ───────────────────────────────────────────────────────────────
const ids = new Set(map.territories.map(t => t.id));
let errs = 0;
for (const t of map.territories) {
  for (const adj of t.adjacentTo) {
    if (!ids.has(adj)) { console.log('  MISSING REF:', t.id, '->', adj); errs++; }
    const other = get(adj);
    if (other && !other.adjacentTo.includes(t.id)) { console.log('  ONE-WAY:', t.id, '->', adj); errs++; }
  }
}

function hops(startId, endId) {
  const visited = new Set([startId]);
  const q = [[startId, 0]];
  while (q.length) {
    const [cur, d] = q.shift();
    const t = get(cur);
    if (!t) continue;
    for (const adj of t.adjacentTo) {
      if (adj === endId) return d + 1;
      if (!visited.has(adj)) { visited.add(adj); q.push([adj, d+1]); }
    }
  }
  return -1;
}

console.log('\nHop counts after expansion:');
const routes = [
  ['new_england', 'uk',          'US East Coast → UK'],
  ['new_york',    'france',      'New York → France'],
  ['carolinas',   'morocco',     'Carolinas → Morocco'],
  ['india_south', 'east_africa', 'India → East Africa'],
  ['california',  'japan',       'California → Japan'],
  ['alaska',      'kamchatka',   'Alaska → Kamchatka'],
  ['florida',     'brazil',      'Florida → Brazil'],
  ['illinois',    'russia_west', 'Chicago → Moscow (overland)'],
  ['uk',          'germany',     'UK → Germany (overland)'],
];
for (const [a, b, label] of routes) {
  const h = hops(a, b);
  const flag = h <= 2 ? ' *** STILL FAST' : h === 3 ? ' (ok)' : ' (good)';
  console.log('  ' + label.padEnd(36) + h + ' hops' + flag);
}

if (errs) { console.log(`\n${errs} errors — NOT saving.`); process.exit(1); }

fs.writeFileSync(mapPath, JSON.stringify(map, null, 2));
console.log(`\n✓ Saved v${map.version} | ${map.width}x${map.height} | ${map.territories.length} territories`);
