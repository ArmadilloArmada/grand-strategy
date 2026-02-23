const fs = require('fs');
const map = JSON.parse(fs.readFileSync('assets/maps/grid-world-map.json', 'utf8'));
const get = id => map.territories.find(t => t.id === id);

const link = (a, b) => {
  const ta = get(a), tb = get(b);
  if (!ta || !tb) { console.warn('missing:', a, b); return; }
  if (!ta.adjacentTo.includes(b)) ta.adjacentTo.push(b);
  if (!tb.adjacentTo.includes(a)) tb.adjacentTo.push(a);
};
const unlink = (a, b) => {
  const ta = get(a), tb = get(b);
  if (ta) ta.adjacentTo = ta.adjacentTo.filter(x => x !== b);
  if (tb) tb.adjacentTo = tb.adjacentTo.filter(x => x !== a);
};

// 1. Remove Portugal from all current neighbours
const p = get('portugal');
for (const adjId of [...p.adjacentTo]) unlink('portugal', adjId);
console.log('Cleared old Portugal adjacencies.');

// 2. Move Portugal to (575, 225) — one tile west of Spain, in the atl_east column
p.center  = [575, 225];
p.polygon = [[550,200],[600,200],[600,250],[550,250]];
console.log('Moved Portugal to (575, 225).');

// 3. Wire new adjacencies
link('portugal', 'spain');      // 50px east — direct border
link('portugal', 'france');     // 71px NE
link('portugal', 'morocco');    // 71px SE — Strait of Gibraltar
link('portugal', 'atl_east_u'); // 50px north — Atlantic access
link('portugal', 'atl_east_l'); // 100px south
link('portugal', 'atl_mid_u');  // mid-Atlantic westward connection
console.log('New Portugal adjacencies set:', get('portugal').adjacentTo);

// 4. Validate
const ids = new Set(map.territories.map(t => t.id));
let errs = 0;
for (const t of map.territories) {
  for (const adj of t.adjacentTo) {
    if (!ids.has(adj)) { console.log('MISSING REF:', t.id, '->', adj); errs++; }
    const other = get(adj);
    if (other && !other.adjacentTo.includes(t.id)) { console.log('ONE-WAY:', t.id, '->', adj); errs++; }
  }
}
if (errs) { console.log(errs + ' errors'); process.exit(1); }

// 5. Hop check
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
console.log('new_england -> portugal:', hops('new_england','portugal'), 'hops (want 4+)');
console.log('portugal    -> spain:   ', hops('portugal','spain'), 'hops (want 1)');
console.log('portugal    -> france:  ', hops('portugal','france'), 'hops (want 1)');
console.log('portugal    -> morocco: ', hops('portugal','morocco'), 'hops (want 1)');

map.version = '3.5.2';
fs.writeFileSync('assets/maps/grid-world-map.json', JSON.stringify(map, null, 2));
console.log('Saved v3.5.2');
