/**
 * Comprehensive map fix script:
 * 1. Move portugal from x=375 (wrongly in Americas zone) to x=475 (Atlantic coast of Iberia)
 * 2. Move west_africa from x=375 (wrongly in Americas zone) to x=525 (correct Africa position)
 * 3. Fix all broken/one-way sea zone adjacency chains
 * 4. Make all adjacencies bidirectional
 */

const fs = require('fs');
const path = require('path');

const mapPath = path.join(__dirname, '../assets/maps/grid-world-map.json');
const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));

const get = (id) => map.territories.find(t => t.id === id);

// Helper: add adj to territory (bidirectional by default)
const addAdj = (id, ...ids) => {
  const t = get(id);
  if (!t) { console.warn('WARN: territory not found:', id); return; }
  for (const other of ids) {
    if (!t.adjacentTo.includes(other)) t.adjacentTo.push(other);
  }
};

// Helper: remove adj from territory
const removeAdj = (id, ...ids) => {
  const t = get(id);
  if (!t) { console.warn('WARN: territory not found:', id); return; }
  t.adjacentTo = t.adjacentTo.filter(a => !ids.includes(a));
};

// Helper: link two territories to each other
const link = (a, b) => { addAdj(a, b); addAdj(b, a); };
const unlink = (a, b) => { removeAdj(a, b); removeAdj(b, a); };

// ── 1. Fix portugal (x=375 → x=475, in Atlantic coastal strip) ───────────────
// portugal at x=375 is visually in the Americas zone (west of atlantic_central).
// Move it to x=475 — it will appear as a small coastal territory at the edge of
// atlantic_central (sea drawn first, land drawn on top), which correctly shows
// Portugal on the Atlantic coast of the Iberian Peninsula.
const portugal = get('portugal');
if (portugal) {
  portugal.polygon = [[450, 200], [500, 200], [500, 250], [450, 250]];
  portugal.center = [475, 225];
  // Now adjacent to spain (east), atlantic_central (west/sea), french coast (north via atlantic_central)
  portugal.adjacentTo = ['spain', 'atlantic_central', 'atlantic_south'];
  console.log('✓ Moved portugal to (475, 225)');
}

// spain: was adjacent to mid_atlantic (too far south); now adjacent to atlantic_central
removeAdj('spain', 'mid_atlantic');
addAdj('spain', 'atlantic_central');
console.log('✓ Updated spain adjacencies');

// atlantic_central: make sure portugal is in there
addAdj('atlantic_central', 'portugal');

// mid_atlantic: remove portugal reference (portugal is now north of mid_atlantic)
removeAdj('mid_atlantic', 'portugal');

// ── 2. Fix west_africa (x=375 → x=525, correct Africa position) ─────────────
// west_africa at x=375 is in the Americas zone west of the Atlantic.
// Should be at x=525 between Sahara (525,325) and Congo (525,425).
const westAfrica = get('west_africa');
if (westAfrica) {
  westAfrica.polygon = [[500, 350], [550, 350], [550, 400], [500, 400]];
  westAfrica.center = [525, 375];
  // Adjacent to: sahara (north), central_africa (east), congo (south), atlantic_south (west sea)
  westAfrica.adjacentTo = ['sahara', 'central_africa', 'congo', 'atlantic_south'];
  console.log('✓ Moved west_africa to (525, 375)');
}

// congo: add west_africa (now directly north of it)
addAdj('congo', 'west_africa');

// mid_atlantic: remove west_africa (no longer adjacent after move)
removeAdj('mid_atlantic', 'west_africa');

// atlantic_south: remove portugal (moved north); add west_africa (now on its east coast)
removeAdj('atlantic_south', 'portugal');
addAdj('atlantic_south', 'west_africa');

// ── 3. Fix broken sea zone chains ─────────────────────────────────────────────

// 3a. Black Sea ↔ Mediterranean East (Bosphorus Strait)
link('black_sea', 'med_east');
console.log('✓ Linked black_sea ↔ med_east');

// 3b. Indian Ocean internal connectivity
// arabian_sea ↔ indian_ocean_west (one-way; make bidirectional)
link('arabian_sea', 'indian_ocean_west');
// arabian_sea ↔ bay_of_bengal (both are Indian Ocean, connect them)
link('arabian_sea', 'bay_of_bengal');
// indian_ocean_west ↔ bay_of_bengal
link('indian_ocean_west', 'bay_of_bengal');
console.log('✓ Fixed Indian Ocean internal connectivity');

// 3c. South Atlantic ↔ Indian Ocean (Cape of Good Hope route)
link('south_atlantic', 'mozambique_channel');
link('south_atlantic', 'indian_ocean_west');
console.log('✓ Linked South Atlantic → Indian Ocean (Cape route)');

// 3d. South China Sea: add missing sea-sea adjacencies (one-way in existing data)
link('south_china_sea', 'east_china_sea');
link('south_china_sea', 'java_sea');
link('south_china_sea', 'philippine_sea');
// Also connect andaman_sea to bay_of_bengal (one-way)
link('andaman_sea', 'bay_of_bengal');
console.log('✓ Fixed South China Sea adjacencies');

// 3e. Pacific South ↔ Tasman Sea (Southern Ocean connection)
link('pacific_south', 'tasman_sea');
// Pacific South ↔ Indian Ocean East (southern route)
link('pacific_south', 'indian_ocean_east');
console.log('✓ Linked pacific_south ↔ tasman_sea and indian_ocean_east');

// 3f. Pacific West ↔ Coral Sea (one-way in existing data)
link('pacific_west', 'coral_sea');
// Java Sea ↔ Indian Ocean East (one-way in existing data)
link('java_sea', 'indian_ocean_east');
console.log('✓ Fixed Pacific/Coral Sea adjacencies');

// 3g. North Sea ↔ Norwegian Sea (one-way in existing data)
link('north_sea', 'norwegian_sea');
console.log('✓ Linked north_sea ↔ norwegian_sea');

// 3h. Hudson Bay ↔ North Atlantic
link('hudson_bay', 'north_atlantic');
console.log('✓ Linked hudson_bay ↔ north_atlantic');

// 3i. Baltic Sea ↔ Norwegian Sea (Denmark Strait concept)
link('baltic', 'norwegian_sea');
console.log('✓ Linked baltic ↔ norwegian_sea');

// 3j. Med East ↔ Red Sea / Gulf of Aden (Suez Canal abstraction)
link('med_east', 'red_sea');
link('med_east', 'gulf_of_aden');
console.log('✓ Linked med_east ↔ red_sea / gulf_of_aden (Suez abstraction)');

// 3k. Barents Sea ↔ Norwegian Sea
link('barents_sea', 'norwegian_sea');
console.log('✓ Linked barents_sea ↔ norwegian_sea');

// 3l. Sea of Okhotsk ↔ Pacific North / Bering Sea
link('sea_of_okhotsk', 'pacific_north');
link('sea_of_okhotsk', 'bering_sea');
console.log('✓ Linked sea_of_okhotsk ↔ pacific_north / bering_sea');

// 3m. Yellow Sea ↔ East China Sea ↔ South China Sea chain completeness
link('yellow_sea', 'east_china_sea');
console.log('✓ Linked yellow_sea ↔ east_china_sea');

// 3n. Coral Sea ↔ Tasman Sea
link('coral_sea', 'tasman_sea');
console.log('✓ Linked coral_sea ↔ tasman_sea');

// ── 4. Verify sea zone chain ──────────────────────────────────────────────────
console.log('\n── Sea zone connectivity report ──');
const seaZones = map.territories.filter(t => t.type === 'sea');
for (const s of seaZones) {
  const seaAdj = s.adjacentTo.filter(id => {
    const t = get(id);
    return t && t.type === 'sea';
  });
  if (seaAdj.length === 0) {
    console.log('⚠  ISOLATED:', s.id, '(no sea-sea connections)');
  } else {
    console.log('✓ ', s.id, '→', seaAdj.join(', '));
  }
}

// ── 5. Write out ──────────────────────────────────────────────────────────────
map.version = '3.3.0';
fs.writeFileSync(mapPath, JSON.stringify(map, null, 2));
console.log('\n✓ Map saved as version', map.version);
