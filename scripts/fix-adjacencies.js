/**
 * Fix missing bidirectional adjacencies between grid-neighboring territories.
 * Only adds geographically valid connections (skips cross-ocean / physically
 * impossible pairings like US Midwest ↔ Europe).
 */

const fs = require('fs');
const path = require('path');

const mapPath = path.join(__dirname, '../assets/maps/grid-world-map.json');
const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
const get = id => map.territories.find(t => t.id === id);

let added = 0;
const link = (a, b) => {
  const ta = get(a), tb = get(b);
  if (!ta) { console.warn('MISSING:', a); return; }
  if (!tb) { console.warn('MISSING:', b); return; }
  let changed = false;
  if (!ta.adjacentTo.includes(b)) { ta.adjacentTo.push(b); changed = true; }
  if (!tb.adjacentTo.includes(a)) { tb.adjacentTo.push(a); changed = true; }
  if (changed) { console.log('+ linked', a, '<->', b); added++; }
};

// ── Americas ──────────────────────────────────────────────────────────────────
link('alaska', 'pacific_canada');       // Alaska borders Pacific Canada waters
link('yukon', 'pacific_alaska');        // Yukon adjacent to Pacific Alaska waters
link('nunavut', 'saskatchewan');        // Grid neighbours in simplified map
link('alberta', 'idaho');               // Canada–US border
link('saskatchewan', 'montana');        // Canada–US border
link('manitoba', 'north_dakota');       // Canada–US border
link('ontario', 'baffin');             // Northern Ontario → Baffin Bay area
link('ontario', 'minnesota');          // Ontario borders Minnesota
link('ontario', 'great_lakes');        // Ontario is on the Great Lakes
link('quebec', 'michigan');            // Quebec–Michigan via Great Lakes
link('baffin', 'hudson_bay');          // Baffin Island adjacent to Hudson Bay
link('california', 'utah');            // California borders Utah
link('minnesota', 'michigan');         // Share Lake Superior border
link('michigan', 'new_york');          // Share Great Lakes / Lake Erie border
link('texas', 'mexico_south');         // Texas borders southern Mexico
link('wisconsin', 'indiana');          // Wisconsin borders Indiana (Lake Michigan tip)
link('guatemala', 'ecuador');          // Pacific coast – Central to South America
link('brazil_north', 'brazil');        // Both Brazilian territories

// ── Europe ────────────────────────────────────────────────────────────────────
link('uk', 'denmark');                 // UK and Denmark via North Sea
link('uk', 'norwegian_sea');           // UK is on the Norwegian Sea
link('norway', 'denmark');             // Norway borders Denmark
link('norway', 'norwegian_sea');       // Norway is on the Norwegian Sea
link('sweden', 'north_sea');           // Sweden borders the North Sea (Skagerrak)
link('finland', 'baltic_states');      // Finland borders Estonia
link('france', 'switzerland');         // France borders Switzerland
link('czech', 'balkans_north');        // Central Europe → Balkans
link('baltic_states', 'russia_west');  // Baltic states border Russia

// ── Africa ────────────────────────────────────────────────────────────────────
link('libya', 'central_africa');       // Libya borders Chad/Niger (central Africa)
link('libya', 'sudan');               // Libya borders Sudan

// ── Middle East / Central Asia ────────────────────────────────────────────────
link('syria', 'saudi_arabia');         // Syria → Jordan → Saudi Arabia (simplified)
link('saudi_arabia', 'gulf_of_aden'); // Saudi Arabia borders Gulf of Aden coast
link('india_west', 'persian_gulf');   // Western India adjacent to Persian Gulf
link('caucasus', 'uzbekistan');        // Caucasus → Central Asia
link('yakutia', 'mongolia');          // Siberia → Mongolia (simplified map)

// ── South / Southeast Asia ────────────────────────────────────────────────────
link('nepal', 'china_central');        // Nepal borders China
link('burma', 'andaman_sea');         // Burma borders the Andaman Sea
link('china_south', 'yellow_sea');    // Southern China coast near Yellow Sea

// ── Oceania ───────────────────────────────────────────────────────────────────
link('australia_north', 'australia_south'); // Both parts of Australia

console.log(`\nDone — ${added} adjacency links added/fixed.`);

// ── Sanity check: report any remaining isolated territories ───────────────────
const isolated = map.territories.filter(t => t.adjacentTo.length === 0);
if (isolated.length) console.log('Isolated (no adjacencies at all):', isolated.map(t => t.id).join(', '));

map.version = '3.4.0';
fs.writeFileSync(mapPath, JSON.stringify(map, null, 2));
console.log('Map saved as version', map.version);
