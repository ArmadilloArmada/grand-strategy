/**
 * Adds an Atlantic Ocean between the Americas and Europe
 * in grid-world-map.json by shifting all territories with
 * center_x >= 400 rightward by 100px (2 grid cells) and
 * inserting Atlantic sea zone territories in the freed columns.
 */

const fs = require('fs');
const path = require('path');

const mapPath = path.join(__dirname, '../assets/maps/grid-world-map.json');
const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));

const SHIFT = 100; // 2 grid cells
const BOUNDARY = 400; // territories with center_x >= this get shifted

// ── 1. Shift all European/Asian/Pacific territories ──────────────────────────
for (const t of map.territories) {
  if (t.center[0] >= BOUNDARY) {
    t.polygon = t.polygon.map(([x, y]) => [x + SHIFT, y]);
    t.center = [t.center[0] + SHIFT, t.center[1]];
  }
}

// ── 2. Extend north_atlantic eastward to bridge the gap ─────────────────────
// north_atlantic was 300-400, y=50-100  →  extend to 300-500
const northAtlantic = map.territories.find(t => t.id === 'north_atlantic');
if (northAtlantic) {
  northAtlantic.polygon = [[300,50],[500,50],[500,100],[300,100]];
  northAtlantic.center = [400, 75];
}

// mid_atlantic was 300-350, y=400-500  →  after shift neighbours moved east,
// extend it to 300-450 so it still visually connects
const midAtlantic = map.territories.find(t => t.id === 'mid_atlantic');
if (midAtlantic) {
  // mid_atlantic center was [325,450] (< 400, not shifted); widen it
  midAtlantic.polygon = [[300,400],[450,400],[450,500],[300,500]];
  midAtlantic.center = [375, 450];
}

// ── 3. Add dedicated Atlantic Ocean sea zone tiles in the freed gap ──────────
// Gap is x=400-500, y=100-400 (between Americas east coast and shifted Europe)
const atlanticZones = [
  {
    id: 'atlantic_central',
    name: 'Atlantic Ocean',
    type: 'sea',
    production: 0,
    adjacentTo: [
      'new_england', 'new_york', 'pennsylvania', 'virginia', 'carolinas',
      'uk', 'france', 'celtic_sea', 'north_atlantic', 'mid_atlantic',
      'atlantic_south'
    ],
    polygon: [[400,100],[500,100],[500,300],[400,300]],
    center: [450, 200],
    owner: null,
    originalOwner: null,
    hasFactory: false,
    isCapital: false
  },
  {
    id: 'atlantic_south',
    name: 'South Atlantic Approach',
    type: 'sea',
    production: 0,
    adjacentTo: [
      'virginia', 'carolinas', 'georgia', 'florida',
      'france', 'spain', 'portugal', 'morocco',
      'atlantic_central', 'mid_atlantic', 'south_atlantic'
    ],
    polygon: [[400,300],[500,300],[500,450],[400,450]],
    center: [450, 375],
    owner: null,
    originalOwner: null,
    hasFactory: false,
    isCapital: false
  }
];

map.territories.push(...atlanticZones);

// ── 4. Wire up adjacencies on existing territories to the new ocean zones ────
const addAdj = (id, ...newAdjs) => {
  const t = map.territories.find(x => x.id === id);
  if (!t) return;
  for (const adj of newAdjs) {
    if (!t.adjacentTo.includes(adj)) t.adjacentTo.push(adj);
  }
};
const removeAdj = (id, ...removeIds) => {
  const t = map.territories.find(x => x.id === id);
  if (!t) return;
  t.adjacentTo = t.adjacentTo.filter(a => !removeIds.includes(a));
};

// American east coast: add atlantic_central / atlantic_south instead of direct
// Europe connections (those are now across the ocean, reachable via sea zones)
addAdj('new_england',  'atlantic_central');
addAdj('new_york',     'atlantic_central');
addAdj('pennsylvania', 'atlantic_central');
addAdj('virginia',     'atlantic_central', 'atlantic_south');
addAdj('carolinas',    'atlantic_south');
addAdj('georgia',      'atlantic_south');
addAdj('florida',      'atlantic_south');

// European side: UK and France now border the atlantic zones
addAdj('uk',       'atlantic_central');
addAdj('france',   'atlantic_central', 'atlantic_south');
addAdj('spain',    'atlantic_south');
addAdj('portugal', 'atlantic_south');
addAdj('morocco',  'atlantic_south');

// Keep north_atlantic bridge working
addAdj('north_atlantic', 'atlantic_central');

// mid_atlantic bridge
addAdj('mid_atlantic', 'atlantic_central', 'atlantic_south');

// celtic_sea: should be adjacent to atlantic_central (it's between UK and the ocean)
addAdj('celtic_sea', 'atlantic_central');

// ── 5. Update map width ───────────────────────────────────────────────────────
map.width = 1700;
map.version = '3.2.0';

// ── 6. Write out ──────────────────────────────────────────────────────────────
fs.writeFileSync(mapPath, JSON.stringify(map, null, 2));
console.log('Done! Shifted', map.territories.filter(t => t.center[0] >= BOUNDARY + SHIFT).length, 'territories by', SHIFT, 'px');
console.log('Added 2 Atlantic Ocean sea zones');
console.log('Map width updated to', map.width);
