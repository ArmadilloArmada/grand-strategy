/**
 * Shifts all Old World territories (Europe, Africa, Russia, Asia, Australia)
 * 400px to the right, opening up Atlantic Ocean space between the Americas and Old World.
 */
const fs = require('fs');
const path = require('path');

const mapPath = path.join(__dirname, '../assets/maps/grid-world-map.json');
const data = JSON.parse(fs.readFileSync(mapPath, 'utf8'));

const SHIFT_X = 400;

// All Old World land + sea territories to shift right by SHIFT_X
const OLD_WORLD_IDS = new Set([
  // Europe
  'uk', 'norway', 'sweden', 'finland', 'denmark', 'france', 'spain', 'portugal',
  'germany', 'poland', 'czech', 'austria', 'switzerland', 'italy', 'hungary',
  'balkans_north', 'balkans_south', 'belarus', 'baltic_states', 'ukraine',
  // Russia / Central Asia
  'russia_north', 'russia_west', 'caucasus', 'kazakhstan', 'siberia_west',
  'siberia_central', 'siberia_east', 'yakutia', 'kamchatka', 'uzbekistan',
  // Africa
  'morocco', 'algeria', 'tunisia', 'libya', 'egypt', 'sahara', 'west_africa',
  'central_africa', 'sudan', 'ethiopia', 'congo', 'east_africa', 'angola', 'south_africa',
  // Middle East
  'turkey', 'syria', 'israel', 'iraq', 'saudi_arabia', 'yemen', 'persia',
  'afghanistan', 'pakistan',
  // South / East Asia
  'india_north', 'india_west', 'india_east', 'india_south', 'nepal', 'tibet',
  'china_west', 'china_central', 'mongolia', 'china_north', 'china_south',
  'manchuria', 'korea', 'japan', 'taiwan', 'burma', 'thailand', 'indochina',
  'malaya', 'philippines', 'indonesia',
  // Australia / Oceania
  'australia_north', 'australia_west', 'australia_east', 'australia_south', 'new_zealand',
  // Old World sea zones
  'arctic_europe', 'arctic_russia', 'bering_sea',
  'pacific_north', 'pacific_japan', 'pacific_west',
  'north_sea', 'baltic', 'english_channel', 'norwegian_sea', 'barents_sea',
  'med_west', 'med_central', 'med_east', 'black_sea', 'red_sea', 'persian_gulf',
  'indian_ocean_west', 'bay_of_bengal', 'indian_ocean_east', 'south_china_sea',
  'yellow_sea', 'sea_of_japan', 'sea_of_okhotsk', 'coral_sea', 'tasman_sea',
  'east_china_sea', 'arabian_sea', 'mozambique_channel', 'gulf_of_aden',
  'philippine_sea', 'java_sea', 'andaman_sea', 'celtic_sea',
]);

// Custom polygon overrides for Atlantic/transitional ocean zones (bridges Americas ↔ Old World)
const CUSTOM_POLYGONS = {
  // Arctic strip between Greenland and Scandinavia
  'arctic_atlantic': {
    polygon: [[250, 0], [850, 0], [850, 50], [250, 50]],
    center: [550, 25],
  },
  // North Atlantic — spans Iceland (x≈350) to UK (x=800 after shift)
  'north_atlantic': {
    polygon: [[350, 50], [800, 50], [800, 200], [350, 200]],
    center: [575, 125],
  },
  // Mid-Atlantic — E.USA coast to W.Europe/W.Africa
  'mid_atlantic': {
    polygon: [[400, 200], [800, 200], [800, 600], [400, 600]],
    center: [600, 400],
  },
  // South Atlantic — S.America coast to S.Africa
  'south_atlantic': {
    polygon: [[350, 550], [850, 550], [850, 750], [350, 750]],
    center: [600, 650],
  },
};

let shifted = 0;
let custom = 0;

for (const t of data.territories) {
  if (CUSTOM_POLYGONS[t.id]) {
    const c = CUSTOM_POLYGONS[t.id];
    t.polygon = c.polygon;
    t.center = c.center;
    custom++;
  } else if (OLD_WORLD_IDS.has(t.id)) {
    t.polygon = t.polygon.map(([x, y]) => [x + SHIFT_X, y]);
    t.center = [t.center[0] + SHIFT_X, t.center[1]];
    shifted++;
  }
}

// Sanity check: no territory should exceed canvas width (1600)
const maxX = Math.max(...data.territories.flatMap(t => t.polygon.map(([x]) => x)));
console.log(`Max x after shift: ${maxX} (canvas: ${data.width})`);
if (maxX > data.width) {
  console.error('WARNING: some territories exceed canvas width!');
}

fs.writeFileSync(mapPath, JSON.stringify(data, null, 2));
console.log(`Done. Shifted ${shifted} territories, custom-resized ${custom} Atlantic zones.`);
