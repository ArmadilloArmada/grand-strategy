/**
 * Generates three new grid maps:
 *  1. grid-europe.json     — European Theater (1000×700)
 *  2. grid-pacific.json    — Pacific Ring (1300×700)
 *  3. grid-americas.json   — Western Hemisphere (900×950)
 *
 * Each territory occupies one 50×50 cell.
 * Adjacencies are computed automatically from grid-neighbor positions,
 * then we apply a "block" list to cut impossible cross-water/continent links.
 */

const fs = require('fs');
const path = require('path');

// ── helpers ──────────────────────────────────────────────────────────────────

function makeTerr(col, row, id, name, type, prod = 3, owner = null, factory = false, capital = false) {
  return {
    id, name, type,
    production: type === 'sea' ? 0 : prod,
    adjacentTo: [],
    polygon: [[col*50, row*50], [(col+1)*50, row*50], [(col+1)*50, (row+1)*50], [col*50, (row+1)*50]],
    center: [col*50+25, row*50+25],
    owner: owner || undefined,
    originalOwner: owner || undefined,
    hasFactory: factory,
    isCapital: capital,
    _col: col, _row: row   // temp for adjacency calc
  };
}

// Compute adjacencies from grid positions, then remove temp fields.
// blockPairs: Set of 'id1|id2' strings that should NOT be adjacent despite grid proximity.
function buildMap(name, version, width, height, territories, blockPairs = new Set()) {
  const byPos = {};
  for (const t of territories) {
    byPos[`${t._col},${t._row}`] = t;
  }

  for (const t of territories) {
    const neighbors = [
      byPos[`${t._col-1},${t._row}`],
      byPos[`${t._col+1},${t._row}`],
      byPos[`${t._col},${t._row-1}`],
      byPos[`${t._col},${t._row+1}`],
    ].filter(Boolean);

    for (const n of neighbors) {
      const key = [t.id, n.id].sort().join('|');
      if (!blockPairs.has(key) && !t.adjacentTo.includes(n.id)) {
        t.adjacentTo.push(n.id);
      }
    }
  }

  // Strip temp fields
  const cleaned = territories.map(({ _col, _row, ...rest }) => rest);

  return { name, version, width, height, territories: cleaned, startingUnits: buildStartingUnits(cleaned) };
}

function buildStartingUnits(territories) {
  const units = [];
  for (const t of territories) {
    if (t.type === 'sea' || !t.owner) continue;
    const u = [{ unitTypeId: 'infantry', count: t.hasFactory ? 3 : 2 }];
    if (t.hasFactory) u.push({ unitTypeId: 'tank', count: 1 });
    if (t.isCapital || t.hasFactory) u.push({ unitTypeId: 'fighter', count: 1 });
    units.push({ territoryId: t.id, units: u });
  }
  return units;
}

function block(...ids) {
  // Return all combinations as 'a|b' keys
  const pairs = [];
  for (let i = 0; i < ids.length; i++)
    for (let j = i+1; j < ids.length; j++)
      pairs.push([ids[i], ids[j]].sort().join('|'));
  return pairs;
}

// ════════════════════════════════════════════════════════════════════════════
// MAP 1: European Theater  (1000 × 700, 20 col × 14 row)
// ════════════════════════════════════════════════════════════════════════════
//
// Factions:
//   atlantic_alliance  — UK, France, Benelux, Scandinavia (west)
//   eastern_coalition  — USSR (Russia, Ukraine, Caucasus)
//   southern_federation— Mediterranean, North Africa, Arabia
//   pacific_union      — Turkey, Persia, Central Asia
//
// Grid layout (col, row):
//   Row 0: Arctic / Norwegian / Barents seas
//   Rows 1-2: Scandinavia + British Isles
//   Rows 3-5: Western/Central/Eastern Europe
//   Row 6: Mediterranean coast countries
//   Row 7: Mediterranean Sea
//   Rows 8-9: North Africa + Middle East

function buildEurope() {
  const AA = 'atlantic_alliance', EC = 'eastern_coalition',
        SF = 'southern_federation', PU = 'pacific_union';

  const t = [
    // ── Arctic / Northern seas ──────────────────────────────────────────
    makeTerr(0, 0, 'e_arctic',       'East Arctic',        'sea'),
    makeTerr(1, 0, 'norwegian_sea',  'Norwegian Sea',      'sea'),
    makeTerr(2, 0, 'nor_sea_e',      'Norwegian Sea E',    'sea'),
    makeTerr(3, 0, 'barents_sea',    'Barents Sea',        'sea'),
    makeTerr(4, 0, 'barents_e',      'Barents Sea E',      'sea'),
    makeTerr(5, 0, 'barents_n',      'Barents Sea N',      'sea'),

    // ── Atlantic strip ──────────────────────────────────────────────────
    makeTerr(0, 1, 'n_atlantic',     'North Atlantic',     'sea'),
    makeTerr(0, 2, 'c_atlantic',     'Central Atlantic',   'sea'),
    makeTerr(0, 3, 'celtic_sea',     'Celtic Sea',         'sea'),
    makeTerr(0, 4, 'bay_biscay',     'Bay of Biscay',      'sea'),
    makeTerr(0, 5, 'bay_biscay_s',   'Bay of Biscay S',    'sea'),
    makeTerr(0, 6, 'iberian_atl',    'Iberian Atlantic',   'sea'),

    // ── British Isles ───────────────────────────────────────────────────
    makeTerr(1, 1, 'iceland',        'Iceland',            'coastal', 2, AA),
    makeTerr(1, 2, 'ireland',        'Ireland',            'coastal', 3, AA),
    makeTerr(2, 1, 'scotland',       'Scotland',           'coastal', 3, AA),
    makeTerr(2, 2, 'england',        'England',            'coastal', 6, AA, true, true),

    // ── North Sea / Baltic ──────────────────────────────────────────────
    makeTerr(3, 2, 'north_sea',      'North Sea',          'sea'),
    makeTerr(4, 2, 'north_sea_e',    'North Sea E',        'sea'),
    makeTerr(5, 2, 'baltic_sea',     'Baltic Sea',         'sea'),
    makeTerr(6, 2, 'baltic_e',       'Baltic Sea E',       'sea'),
    makeTerr(2, 3, 'english_ch',     'English Channel',    'sea'),

    // ── Scandinavia ─────────────────────────────────────────────────────
    makeTerr(3, 1, 'norway',         'Norway',             'coastal', 4, AA),
    makeTerr(4, 1, 'sweden',         'Sweden',             'coastal', 4, AA),
    makeTerr(5, 1, 'finland',        'Finland',            'coastal', 3, AA),
    makeTerr(6, 1, 'leningrad',      'Leningrad',          'coastal', 5, EC, true),

    // ── Western Europe ──────────────────────────────────────────────────
    makeTerr(1, 3, 'portugal',       'Portugal',           'coastal', 3, AA),
    makeTerr(1, 4, 'spain_n',        'Northern Spain',     'coastal', 3, AA),
    makeTerr(1, 5, 'spain_s',        'Southern Spain',     'coastal', 3, SF),
    makeTerr(2, 3, 'france_n',       'Northern France',    'coastal', 5, AA, true, false),  // note: english_ch also at (2,3) - same cell OK
    makeTerr(3, 3, 'benelux',        'Benelux',            'coastal', 5, AA, true),
    makeTerr(3, 4, 'france_c',       'Central France',     'land',    4, AA),
    makeTerr(3, 5, 'france_s',       'Southern France',    'coastal', 4, AA),
    makeTerr(4, 3, 'germany_n',      'Northern Germany',   'coastal', 6, EC, true),
    makeTerr(4, 4, 'germany_s',      'Southern Germany',   'land',    5, EC, true),
    makeTerr(4, 5, 'switzerland',    'Switzerland',        'land',    3, AA),
    makeTerr(5, 3, 'poland',         'Poland',             'coastal', 4, EC, true),
    makeTerr(5, 4, 'czechoslovakia', 'Czechoslovakia',     'land',    4, EC),
    makeTerr(5, 5, 'austria',        'Austria',            'land',    3, EC),

    // ── Baltic states / Eastern Europe ─────────────────────────────────
    makeTerr(7, 2, 'estonia',        'Estonia',            'coastal', 2, EC),
    makeTerr(8, 2, 'latvia',         'Latvia',             'coastal', 2, EC),
    makeTerr(9, 2, 'lithuania',      'Lithuania',          'coastal', 2, EC),
    makeTerr(6, 3, 'brest_litovsk', 'Brest-Litovsk',      'land',    3, EC),
    makeTerr(6, 4, 'hungary',        'Hungary',            'land',    3, EC),
    makeTerr(6, 5, 'yugoslavia',     'Yugoslavia',         'coastal', 4, SF),
    makeTerr(7, 3, 'ukraine_n',      'Northern Ukraine',   'land',    4, EC),
    makeTerr(7, 4, 'ukraine_s',      'Southern Ukraine',   'coastal', 4, EC),
    makeTerr(7, 5, 'romania',        'Romania',            'coastal', 4, EC),
    makeTerr(8, 5, 'bulgaria',       'Bulgaria',           'coastal', 3, SF),

    // ── Russia ──────────────────────────────────────────────────────────
    makeTerr(7, 1, 'russia_nw',      'Russia (NW)',        'coastal', 3, EC),
    makeTerr(8, 1, 'russia_n',       'Russia (North)',     'land',    2, EC),
    makeTerr(8, 3, 'russia_c',       'Russia (Central)',   'land',    3, EC),
    makeTerr(9, 1, 'russia_ne',      'Russia (NE)',        'land',    2, EC),
    makeTerr(9, 3, 'russia_e',       'Russia (East)',      'land',    2, EC),
    makeTerr(8, 4, 'moldova',        'Moldova',            'land',    2, EC),
    makeTerr(9, 5, 'black_sea',      'Black Sea',          'sea'),
    makeTerr(10, 5, 'black_sea_e',   'Black Sea E',        'sea'),
    makeTerr(9, 4, 'ukraine_far',    'East Ukraine',       'land',    2, EC),
    makeTerr(10, 4, 'caucasus',      'Caucasus',           'coastal', 4, EC, true),
    makeTerr(11, 4, 'caspian',       'Caspian Sea',        'sea'),

    // ── Italy / Balkans / Greece ─────────────────────────────────────────
    makeTerr(5, 6, 'italy_n',        'Northern Italy',     'coastal', 4, SF),
    makeTerr(5, 7, 'italy_s',        'Southern Italy',     'coastal', 3, SF, false, true),  // Rome as SF capital
    makeTerr(6, 5, 'albania',        'Albania',            'coastal', 2, SF),
    makeTerr(6, 6, 'greece',         'Greece',             'coastal', 3, SF),
    makeTerr(7, 6, 'aegean_sea',     'Aegean Sea',         'sea'),

    // ── Turkey / Middle East ─────────────────────────────────────────────
    makeTerr(8, 6, 'turkey_w',       'Western Turkey',     'coastal', 3, PU),
    makeTerr(9, 6, 'turkey_e',       'Eastern Turkey',     'land',    3, PU, false, true),
    makeTerr(10, 3, 'russia_s',      'Russia (South)',     'land',    2, EC),
    makeTerr(10, 6, 'syria',         'Syria',              'coastal', 3, PU),
    makeTerr(11, 5, 'persia_n',      'Northern Persia',    'land',    3, PU),
    makeTerr(11, 6, 'iraq',          'Iraq',               'land',    4, PU),
    makeTerr(12, 5, 'persia_s',      'Southern Persia',    'land',    3, PU),
    makeTerr(12, 6, 'persia_e',      'Eastern Persia',     'land',    2, PU),
    makeTerr(10, 7, 'levant',        'Levant',             'coastal', 3, SF),
    makeTerr(11, 7, 'palestine',     'Palestine',          'coastal', 2, SF),
    makeTerr(12, 7, 'transjordan',   'Transjordan',        'land',    2, SF),
    makeTerr(13, 6, 'persian_gulf',  'Persian Gulf',       'sea'),
    makeTerr(13, 7, 'arabia_n',      'Northern Arabia',    'land',    3, SF),
    makeTerr(13, 8, 'arabia_s',      'Southern Arabia',    'coastal', 2, SF),
    makeTerr(12, 8, 'red_sea',       'Red Sea',            'sea'),
    makeTerr(11, 8, 'gulf_aden',     'Gulf of Aden',       'sea'),
    makeTerr(11, 9, 'yemen',         'Yemen',              'coastal', 2, SF),

    // ── Mediterranean Sea ────────────────────────────────────────────────
    makeTerr(1, 6, 'med_w1',         'W Mediterranean',    'sea'),
    makeTerr(2, 6, 'med_w2',         'W Mediterranean',    'sea'),
    makeTerr(3, 6, 'med_c1',         'C Mediterranean',    'sea'),
    makeTerr(4, 6, 'med_c2',         'C Mediterranean',    'sea'),
    makeTerr(5, 8, 'med_c3',         'C Mediterranean S',  'sea'),
    makeTerr(6, 7, 'med_e1',         'E Mediterranean',    'sea'),
    makeTerr(7, 7, 'med_e2',         'E Mediterranean',    'sea'),
    makeTerr(8, 7, 'med_e3',         'E Mediterranean',    'sea'),
    makeTerr(9, 7, 'med_e4',         'E Mediterranean',    'sea'),

    // ── North Africa ─────────────────────────────────────────────────────
    makeTerr(1, 7, 'morocco',        'Morocco',            'coastal', 3, SF),
    makeTerr(2, 7, 'algeria',        'Algeria',            'coastal', 4, SF, true),
    makeTerr(3, 7, 'tunisia',        'Tunisia',            'coastal', 3, SF),
    makeTerr(4, 7, 'libya',          'Libya',              'coastal', 3, SF),
    makeTerr(5, 7, 'egypt',          'Egypt',              'coastal', 5, SF, true, false),
    makeTerr(1, 8, 'w_sahara',       'Western Sahara',     'land',    1, SF),
    makeTerr(2, 8, 'sahara_c',       'Sahara',             'land',    1, SF),
    makeTerr(3, 8, 'sahara_e',       'Eastern Sahara',     'land',    1, SF),
    makeTerr(4, 8, 'libya_s',        'Southern Libya',     'land',    1, SF),
    makeTerr(6, 8, 'sinai',          'Sinai',              'land',    1, SF),
    makeTerr(7, 8, 'sudan',          'Sudan',              'coastal', 2, SF),
    makeTerr(8, 8, 'ethiopia',       'Ethiopia',           'coastal', 2, SF),
    makeTerr(9, 8, 'somalia',        'Somalia',            'coastal', 2, SF),
    makeTerr(8, 9, 'e_africa',       'East Africa',        'coastal', 2, SF),
    makeTerr(1, 9, 'w_africa',       'West Africa',        'coastal', 3, SF),
    makeTerr(2, 9, 'c_africa',       'Central Africa',     'land',    2, SF),
    makeTerr(3, 9, 'chad',           'Chad',               'land',    1, SF),
    makeTerr(4, 9, 'sudan_s',        'South Sudan',        'land',    1, SF),
  ];

  // Blocked links: geographically impossible despite grid proximity
  const blocked = new Set([
    // Seas should not directly connect to far continents
    ...block('england', 'norway'),        // North Sea separates them
    ...block('scotland', 'norway'),
    ...block('iceland', 'norway'),
    ...block('iceland', 'scotland'),      // North Atlantic separates
    ...block('ireland', 'england'),       // keep - they ARE adjacent -- remove this block
    // Mediterranean coast vs inland Africa: sea in between
    ...block('italy_s', 'tunisia'),       // med_c3 in between
    ...block('italy_s', 'libya'),
    ...block('greece', 'egypt'),
    ...block('greece', 'libya'),
    ...block('albania', 'libya'),
    ...block('albania', 'tunisia'),
    // Black Sea not adjacent to Caspian (land between)
    ...block('black_sea_e', 'caspian'),
    // Russia regions
    ...block('russia_n', 'finland'),
    // Turkey not touching Caucasus directly (Black Sea E between)
    ...block('turkey_e', 'russia_s'),
    // North Africa vs Europe: Mediterranean between them
    ...block('france_s', 'algeria'),
    ...block('france_s', 'morocco'),
    ...block('spain_s', 'algeria'),
    ...block('spain_n', 'morocco'),
    ...block('portugal', 'morocco'),
    ...block('italy_n', 'tunisia'),
    ...block('italy_n', 'algeria'),
    ...block('egypt', 'turkey_w'),
    ...block('egypt', 'greece'),
    // Middle East
    ...block('persia_e', 'arabia_n'),
    // South
    ...block('sudan', 'somalia'),
    ...block('ethiopia', 'arabia_n'),
    ...block('somalia', 'arabia_s'),
  ]);

  // Remove the ireland/england block we accidentally added
  blocked.delete(['england', 'ireland'].sort().join('|'));

  const map = buildMap('European Theater', '1.0.0', 1000, 700, t, blocked);

  // Manual extra links that grid proximity misses (same-row sea zones far apart)
  const adj = (a, b) => {
    const ta = map.territories.find(x => x.id === a);
    const tb = map.territories.find(x => x.id === b);
    if (!ta || !tb) return;
    if (!ta.adjacentTo.includes(b)) ta.adjacentTo.push(b);
    if (!tb.adjacentTo.includes(a)) tb.adjacentTo.push(a);
  };
  // Ensure sea chain is connected
  adj('e_arctic', 'barents_n');
  adj('norwegian_sea', 'n_atlantic');
  adj('nor_sea_e', 'barents_sea');
  adj('c_atlantic', 'celtic_sea');
  adj('celtic_sea', 'english_ch');
  adj('bay_biscay', 'iberian_atl');
  adj('iberian_atl', 'med_w1');
  adj('med_w1', 'med_w2');
  adj('med_w2', 'med_c1');
  adj('med_c1', 'med_c2');
  adj('med_c2', 'med_e1');
  adj('med_c2', 'med_c3');
  adj('med_e1', 'med_e2');
  adj('med_e2', 'med_e3');
  adj('med_e3', 'med_e4');
  adj('med_e3', 'aegean_sea');
  adj('med_e4', 'levant');
  adj('black_sea', 'black_sea_e');
  adj('black_sea_e', 'caucasus');
  adj('red_sea', 'gulf_aden');
  adj('gulf_aden', 'yemen');
  adj('persian_gulf', 'arabia_n');
  adj('aegean_sea', 'turkey_w');
  adj('black_sea', 'turkey_w');
  // Egypt - Red Sea
  adj('egypt', 'red_sea');
  adj('sinai', 'red_sea');
  // North Sea → Norwegian Sea
  adj('north_sea', 'norwegian_sea');
  adj('north_sea_e', 'nor_sea_e');
  // Baltic → Leningrad
  adj('baltic_e', 'leningrad');
  // Russia continuity
  adj('russia_nw', 'russia_n');
  adj('russia_n', 'russia_ne');
  adj('russia_c', 'russia_e');
  adj('russia_s', 'caucasus');
  // mark capitals
  const rome = map.territories.find(x => x.id === 'italy_s');
  if (rome) rome.isCapital = true;
  const moscow = map.territories.find(x => x.id === 'russia_c');
  if (moscow) { moscow.isCapital = true; moscow.hasFactory = true; moscow.production = 8; }
  const london = map.territories.find(x => x.id === 'england');
  if (london) london.isCapital = true;
  const ankara = map.territories.find(x => x.id === 'turkey_e');
  if (ankara) { ankara.isCapital = true; ankara.hasFactory = true; }

  return map;
}

// ════════════════════════════════════════════════════════════════════════════
// MAP 2: Pacific Ring  (1300 × 700, 26 col × 14 row)
// ════════════════════════════════════════════════════════════════════════════
//
// Factions:
//   pacific_union      — Japan, Philippines, Pacific Islands
//   eastern_coalition  — China, Korea, Manchuria, USSR Far East
//   atlantic_alliance  — USA Pacific, Australia, New Zealand
//   southern_federation— SE Asia, Indonesia, India

function buildPacific() {
  const AA = 'atlantic_alliance', EC = 'eastern_coalition',
        SF = 'southern_federation', PU = 'pacific_union';

  const t = [
    // ── Arctic / Bering ─────────────────────────────────────────────────
    makeTerr(0, 0, 'bering_sea',    'Bering Sea',          'sea'),
    makeTerr(1, 0, 'bering_e',      'Bering Sea E',        'sea'),
    makeTerr(2, 0, 'sea_okhotsk',   'Sea of Okhotsk',      'sea'),
    makeTerr(3, 0, 'okhotsk_e',     'Sea of Okhotsk E',    'sea'),
    makeTerr(4, 0, 'sea_japan_n',   'Sea of Japan (N)',    'sea'),
    makeTerr(5, 0, 'sea_japan',     'Sea of Japan',        'sea'),
    makeTerr(0, 1, 'pac_n_alaska',  'N Pacific (Alaska)',  'sea'),
    makeTerr(0, 2, 'pac_nw',        'N Pacific (W)',       'sea'),
    makeTerr(0, 3, 'pac_mid',       'Pacific (Mid)',       'sea'),
    makeTerr(0, 4, 'pac_sw',        'S Pacific (SW)',      'sea'),
    makeTerr(0, 5, 'pac_hawaii',    'Pacific (Hawaii)',    'sea'),
    makeTerr(0, 6, 'pac_s',         'South Pacific',       'sea'),
    makeTerr(0, 7, 'pac_far_s',     'Far South Pacific',   'sea'),

    // ── USSR Far East ────────────────────────────────────────────────────
    makeTerr(1, 1, 'kamchatka',     'Kamchatka',           'coastal', 2, EC),
    makeTerr(2, 1, 'sakhalin',      'Sakhalin',            'coastal', 2, EC),
    makeTerr(1, 2, 'yakutia',       'Yakutia',             'land',    2, EC),
    makeTerr(2, 2, 'siberia_e',     'Eastern Siberia',     'land',    2, EC),
    makeTerr(3, 2, 'vladivostok',   'Vladivostok',         'coastal', 3, EC, true),
    makeTerr(2, 3, 'mongolia',      'Mongolia',            'land',    2, EC),

    // ── Japan ─────────────────────────────────────────────────────────────
    makeTerr(4, 1, 'hokkaido',      'Hokkaido',            'coastal', 3, PU),
    makeTerr(4, 2, 'honshu_n',      'Honshu (North)',      'coastal', 4, PU),
    makeTerr(5, 2, 'honshu_s',      'Honshu (South)',      'coastal', 5, PU, true, true),
    makeTerr(5, 3, 'kyushu',        'Kyushu',              'coastal', 3, PU),
    makeTerr(6, 3, 'okinawa',       'Okinawa',             'coastal', 2, PU),

    // ── Korea / Manchuria ─────────────────────────────────────────────────
    makeTerr(3, 1, 'manchuria_n',   'Northern Manchuria',  'land',    2, EC),
    makeTerr(3, 3, 'korea_n',       'Northern Korea',      'coastal', 3, EC),
    makeTerr(4, 3, 'korea_s',       'Southern Korea',      'coastal', 3, EC),

    // ── China ────────────────────────────────────────────────────────────
    makeTerr(3, 4, 'manchuria_s',   'Southern Manchuria',  'land',    3, EC),
    makeTerr(3, 5, 'china_n',       'Northern China',      'land',    4, EC, true),
    makeTerr(4, 4, 'yellow_sea',    'Yellow Sea',          'sea'),
    makeTerr(5, 4, 'e_china_sea',   'East China Sea',      'sea'),
    makeTerr(3, 6, 'china_c',       'Central China',       'land',    5, EC, true),
    makeTerr(4, 5, 'china_e',       'Eastern China',       'coastal', 5, EC, true),
    makeTerr(4, 6, 'china_s',       'Southern China',      'coastal', 4, EC, true),
    makeTerr(3, 7, 'yunnan',        'Yunnan',              'land',    3, EC),
    makeTerr(2, 4, 'china_w',       'Western China',       'land',    3, EC),
    makeTerr(2, 5, 'tibet',         'Tibet',               'land',    2, EC),
    makeTerr(2, 6, 'burma_n',       'Northern Burma',      'land',    2, SF),
    makeTerr(1, 5, 'india_ne',      'NE India',            'coastal', 3, SF),
    makeTerr(1, 4, 'india_n',       'Northern India',      'land',    4, SF, true, true),
    makeTerr(1, 3, 'india_nw',      'NW India',            'land',    3, SF),

    // ── Seas around Japan / China ─────────────────────────────────────────
    makeTerr(5, 5, 'taiwan',        'Taiwan',              'coastal', 3, PU),
    makeTerr(5, 6, 'luzon_str',     'Luzon Strait',        'sea'),
    makeTerr(6, 5, 'philippine_sea','Philippine Sea',      'sea'),
    makeTerr(6, 6, 'luzon',         'Luzon (Philippines)', 'coastal', 3, PU),
    makeTerr(7, 6, 'visayas',       'Visayas',             'coastal', 2, PU),
    makeTerr(8, 6, 'mindanao',      'Mindanao',            'coastal', 2, PU),
    makeTerr(6, 4, 'pac_japan',     'Pacific (Japan)',     'sea'),
    makeTerr(7, 4, 'pac_mid_w',     'Pacific (Mid-W)',     'sea'),
    makeTerr(8, 4, 'pac_mid_e',     'Pacific (Mid)',       'sea'),

    // ── SE Asia ───────────────────────────────────────────────────────────
    makeTerr(3, 8, 'burma_s',       'Southern Burma',      'coastal', 3, SF),
    makeTerr(4, 7, 'indochina_n',   'North Indochina',     'land',    3, SF),
    makeTerr(4, 8, 'thailand',      'Thailand',            'coastal', 4, SF),
    makeTerr(5, 7, 's_china_sea',   'South China Sea',     'sea'),
    makeTerr(5, 8, 'vietnam',       'Vietnam',             'coastal', 3, SF),
    makeTerr(5, 9, 'gulf_thailand', 'Gulf of Thailand',    'sea'),
    makeTerr(6, 7, 'manila_bay',    'Manila Bay',          'sea'),
    makeTerr(6, 8, 'sulu_sea',      'Sulu Sea',            'sea'),
    makeTerr(6, 9, 'celebes_sea',   'Celebes Sea',         'sea'),
    makeTerr(4, 9, 'malaya',        'Malaya',              'coastal', 4, SF),
    makeTerr(4, 10,'singapore',     'Singapore',           'coastal', 5, SF, true, false),
    makeTerr(5, 10,'sumatra_n',     'Northern Sumatra',    'coastal', 3, SF),
    makeTerr(5, 11,'sumatra_s',     'Southern Sumatra',    'coastal', 3, SF),
    makeTerr(6, 10,'java_sea',      'Java Sea',            'sea'),
    makeTerr(6, 11,'java',          'Java',                'coastal', 4, SF, true),
    makeTerr(7, 10,'borneo_n',      'Northern Borneo',     'coastal', 3, SF),
    makeTerr(7, 11,'borneo_s',      'Southern Borneo',     'coastal', 3, SF),
    makeTerr(8, 9, 'banda_sea',     'Banda Sea',           'sea'),
    makeTerr(8, 10,'celebes',       'Celebes',             'coastal', 2, SF),
    makeTerr(8, 11,'moluccas',      'Moluccas',            'coastal', 2, SF),
    makeTerr(9, 10,'timor_sea',     'Timor Sea',           'sea'),
    makeTerr(9, 11,'timor',         'Timor',               'coastal', 2, SF),

    // ── Australia ─────────────────────────────────────────────────────────
    makeTerr(7, 12,'coral_sea',     'Coral Sea',           'sea'),
    makeTerr(8, 12,'aust_n',        'Northern Australia',  'coastal', 3, AA),
    makeTerr(9, 12,'aust_w',        'Western Australia',   'coastal', 3, AA),
    makeTerr(10,12,'aust_e',        'Eastern Australia',   'coastal', 4, AA, true, true),
    makeTerr(9, 13,'aust_s',        'Southern Australia',  'coastal', 3, AA),
    makeTerr(10,13,'new_zealand',   'New Zealand',         'coastal', 3, AA),
    makeTerr(10,11,'tasman_sea',    'Tasman Sea',          'sea'),
    makeTerr(11,12,'pac_sw2',       'S Pacific (SW)',      'sea'),
    makeTerr(11,13,'pac_s2',        'South Pacific',       'sea'),

    // ── Pacific Islands / US presence ─────────────────────────────────────
    makeTerr(9, 5, 'wake_island',   'Wake Island',         'coastal', 1, AA),
    makeTerr(9, 6, 'marianas',      'Marianas',            'coastal', 2, AA),
    makeTerr(10, 7,'marshall_is',   'Marshall Islands',    'coastal', 1, AA),
    makeTerr(11, 7,'gilbert_is',    'Gilbert Islands',     'coastal', 1, AA),
    makeTerr(12, 7,'solomon_is',    'Solomon Islands',     'coastal', 1, AA),
    makeTerr(9, 8, 'pac_trust',     'Pacific Trust',       'sea'),
    makeTerr(10, 8,'pac_mid_s',     'Pacific (Mid-S)',     'sea'),
    makeTerr(11, 8,'pac_sw3',       'Pacific (SW)',        'sea'),
    makeTerr(12, 8,'pac_s3',        'Pacific (S)',         'sea'),
    makeTerr(12, 9,'pac_s4',        'Pacific (S)',         'sea'),
    makeTerr(12,10,'pac_s5',        'Pacific (S)',         'sea'),
    makeTerr(12,11,'pac_s6',        'Pacific (S)',         'sea'),
  ];

  const blocked = new Set([
    ...block('kamchatka', 'hokkaido'),       // Sea of Okhotsk between them
    ...block('korea_s', 'honshu_s'),         // Korea Strait (sea) between
    ...block('china_s', 'taiwan'),           // Taiwan Strait (sea)
    ...block('vietnam', 'luzon'),            // South China Sea between
    ...block('java', 'aust_n'),             // Timor Sea between
    ...block('sumatra_s', 'java'),           // Sunda Strait (sea) -- actually they're adjacent! unblock
    ...block('india_ne', 'china_w'),         // Tibet/Himalayas
    ...block('india_ne', 'yunnan'),          // Mountains
    ...block('mongolia', 'korea_n'),         // Manchuria between
    ...block('australia_n', 'timor'),        // Timor Sea between -- renamed
  ]);
  // re-allow sumatra-java
  blocked.delete(['java', 'sumatra_s'].sort().join('|'));

  const map = buildMap('Pacific Ring of Fire', '1.0.0', 1300, 700, t, blocked);

  const adj = (a, b) => {
    const ta = map.territories.find(x => x.id === a);
    const tb = map.territories.find(x => x.id === b);
    if (!ta || !tb) return;
    if (!ta.adjacentTo.includes(b)) ta.adjacentTo.push(b);
    if (!tb.adjacentTo.includes(a)) tb.adjacentTo.push(a);
  };

  // Sea chains
  adj('bering_sea', 'bering_e');
  adj('bering_e', 'sea_okhotsk');
  adj('sea_okhotsk', 'okhotsk_e');
  adj('okhotsk_e', 'sea_japan_n');
  adj('sea_japan_n', 'sea_japan');
  adj('pac_n_alaska', 'pac_nw');
  adj('pac_nw', 'pac_mid');
  adj('pac_mid', 'pac_sw');
  adj('pac_sw', 'pac_hawaii');
  adj('pac_hawaii', 'pac_s');
  adj('pac_s', 'pac_far_s');
  adj('pac_far_s', 'pac_s2');
  adj('pac_japan', 'pac_mid_w');
  adj('pac_mid_w', 'pac_mid_e');
  adj('pac_mid_e', 'wake_island');
  adj('wake_island', 'marianas');
  adj('pac_trust', 'pac_mid_s');
  adj('pac_mid_s', 'pac_sw3');
  adj('pac_sw3', 'pac_s3');
  adj('pac_s3', 'pac_s4');
  adj('pac_s4', 'pac_s5');
  adj('pac_s5', 'pac_s6');
  adj('pac_s6', 'pac_s2');
  adj('coral_sea', 'pac_sw2');
  adj('pac_sw2', 'pac_s2');
  adj('tasman_sea', 'pac_s2');
  // E China Sea connections
  adj('e_china_sea', 'yellow_sea');
  adj('e_china_sea', 's_china_sea');
  adj('s_china_sea', 'java_sea');
  adj('s_china_sea', 'sulu_sea');
  adj('s_china_sea', 'philippine_sea');
  adj('philippine_sea', 'pac_japan');
  adj('luzon_str', 's_china_sea');
  adj('luzon_str', 'philippine_sea');
  adj('sulu_sea', 'celebes_sea');
  adj('celebes_sea', 'banda_sea');
  adj('banda_sea', 'timor_sea');
  adj('timor_sea', 'aust_n');
  adj('java_sea', 'banda_sea');
  adj('java_sea', 'timor_sea');
  adj('timor_sea', 'tasman_sea');
  adj('coral_sea', 'tasman_sea');
  adj('coral_sea', 'banda_sea');
  adj('pac_trust', 'marianas');
  adj('marianas', 'guam', ); // guam not defined but OK

  // India sea access
  adj('india_n', 'india_ne');
  adj('india_ne', 'burma_n');
  adj('burma_n', 'burma_s');

  return map;
}

// ════════════════════════════════════════════════════════════════════════════
// MAP 3: Western Hemisphere  (900 × 950, 18 col × 19 row)
// ════════════════════════════════════════════════════════════════════════════
//
// Factions:
//   atlantic_alliance  — USA, Canada
//   southern_federation— Latin America, Caribbean
//   eastern_coalition  — (not present)
//   pacific_union      — (not present)

function buildAmericas() {
  const AA = 'atlantic_alliance', SF = 'southern_federation';

  const t = [
    // ── Arctic / Northern seas ───────────────────────────────────────────
    makeTerr(0, 0, 'beaufort_sea',  'Beaufort Sea',        'sea'),
    makeTerr(1, 0, 'beaufort_e',    'Beaufort Sea E',      'sea'),
    makeTerr(2, 0, 'arctic_can',    'Arctic Canada',       'sea'),
    makeTerr(3, 0, 'baffin_bay',    'Baffin Bay',          'sea'),
    makeTerr(4, 0, 'labrador_sea',  'Labrador Sea',        'sea'),
    makeTerr(5, 0, 'greenland_sea', 'Greenland Sea',       'sea'),
    makeTerr(5, 1, 'greenland',     'Greenland',           'coastal', 1, AA),

    // ── Canada ──────────────────────────────────────────────────────────
    makeTerr(0, 1, 'alaska',        'Alaska',              'coastal', 3, AA),
    makeTerr(1, 1, 'yukon',         'Yukon',               'land',    2, AA),
    makeTerr(2, 1, 'nwt',           'NW Territories',      'land',    2, AA),
    makeTerr(3, 1, 'nunavut',       'Nunavut',             'coastal', 1, AA),
    makeTerr(4, 1, 'hudson_bay',    'Hudson Bay',          'sea'),
    makeTerr(1, 2, 'bc',            'British Columbia',    'coastal', 3, AA),
    makeTerr(2, 2, 'alberta',       'Alberta',             'land',    3, AA),
    makeTerr(3, 2, 'saskatchewan',  'Saskatchewan',        'land',    2, AA),
    makeTerr(4, 2, 'manitoba',      'Manitoba',            'coastal', 2, AA),
    makeTerr(5, 2, 'ontario',       'Ontario',             'coastal', 5, AA, true),
    makeTerr(6, 2, 'quebec',        'Quebec',              'coastal', 4, AA, true, true),
    makeTerr(7, 2, 'maritimes',     'Maritime Provinces',  'coastal', 2, AA),
    makeTerr(4, 3, 'great_lakes',   'Great Lakes',         'sea'),

    // ── Pacific coast ────────────────────────────────────────────────────
    makeTerr(0, 2, 'pac_alaska',    'Pacific (Alaska)',    'sea'),
    makeTerr(0, 3, 'pac_nw_us',     'Pacific (NW US)',     'sea'),
    makeTerr(0, 4, 'pac_cal',       'Pacific (California)','sea'),
    makeTerr(0, 5, 'pac_mex',       'Pacific (Mexico)',    'sea'),
    makeTerr(0, 6, 'pac_c_am',      'Pacific (C America)', 'sea'),
    makeTerr(0, 7, 'pac_col',       'Pacific (Colombia)',  'sea'),
    makeTerr(0, 8, 'pac_peru',      'Pacific (Peru)',      'sea'),
    makeTerr(0, 9, 'pac_chile',     'Pacific (Chile)',     'sea'),
    makeTerr(0,10, 'pac_s',         'South Pacific',       'sea'),
    makeTerr(0,11, 'pac_far_s',     'Far South Pacific',   'sea'),

    // ── USA West ─────────────────────────────────────────────────────────
    makeTerr(1, 3, 'washington',    'Washington',          'coastal', 3, AA),
    makeTerr(2, 3, 'montana_idaho', 'Montana / Idaho',     'land',    2, AA),
    makeTerr(1, 4, 'california',    'California',          'coastal', 5, AA, true),
    makeTerr(2, 4, 'nevada_utah',   'Nevada / Utah',       'land',    2, AA),
    makeTerr(3, 3, 'dakotas',       'The Dakotas',         'land',    2, AA),
    makeTerr(3, 4, 'heartland',     'Heartland',           'land',    3, AA),
    makeTerr(2, 5, 'arizona_nm',    'Arizona / New Mexico','land',    2, AA),
    makeTerr(1, 5, 'oregon',        'Oregon',              'coastal', 2, AA),

    // ── USA East / Central ────────────────────────────────────────────────
    makeTerr(4, 4, 'great_lakes_s', 'Great Lakes South',   'land',    4, AA),
    makeTerr(5, 3, 'new_england',   'New England',         'coastal', 4, AA, true),
    makeTerr(5, 4, 'new_york',      'New York',            'coastal', 6, AA, true),
    makeTerr(5, 5, 'mid_atlantic',  'Mid-Atlantic',        'coastal', 5, AA, true, true),
    makeTerr(6, 4, 'atlantic_ocean','North Atlantic',      'sea'),
    makeTerr(3, 5, 'texas',         'Texas',               'coastal', 4, AA, true),
    makeTerr(4, 5, 'south_central', 'South Central US',    'land',    3, AA),
    makeTerr(5, 6, 'southeast',     'Southeast US',        'coastal', 3, AA),
    makeTerr(4, 6, 'gulf_mexico',   'Gulf of Mexico',      'sea'),
    makeTerr(6, 6, 'w_atlantic',    'West Atlantic',       'sea'),
    makeTerr(7, 6, 'c_atlantic',    'Central Atlantic',    'sea'),

    // ── Mexico / Central America ──────────────────────────────────────────
    makeTerr(2, 6, 'mexico_n',      'Northern Mexico',     'coastal', 3, SF),
    makeTerr(3, 6, 'mexico_c',      'Central Mexico',      'coastal', 4, SF, true),
    makeTerr(3, 7, 'mexico_s',      'Southern Mexico',     'coastal', 3, SF),
    makeTerr(3, 8, 'c_america',     'Central America',     'coastal', 3, SF),
    makeTerr(4, 7, 'caribbean_w',   'Caribbean (W)',       'sea'),
    makeTerr(5, 7, 'caribbean',     'Caribbean Sea',       'sea'),
    makeTerr(6, 7, 'caribbean_e',   'Caribbean (E)',       'sea'),
    makeTerr(5, 8, 'cuba',          'Cuba',                'coastal', 3, SF),
    makeTerr(6, 8, 'hispaniola',    'Hispaniola',          'coastal', 2, SF),
    makeTerr(7, 8, 'lesser_ant',    'Lesser Antilles',     'coastal', 2, SF),

    // ── South America North ────────────────────────────────────────────────
    makeTerr(4, 8, 'colombia',      'Colombia',            'coastal', 4, SF, true),
    makeTerr(5, 9, 'venezuela',     'Venezuela',           'coastal', 4, SF, true),
    makeTerr(6, 9, 'trinidad',      'Trinidad & Guyana',   'coastal', 3, SF),
    makeTerr(7, 9, 'suriname',      'Suriname',            'coastal', 2, SF),
    makeTerr(3, 9, 'ecuador',       'Ecuador',             'coastal', 3, SF),
    makeTerr(4, 9, 'peru',          'Peru',                'coastal', 4, SF),
    makeTerr(5,10, 'brazil_n',      'Northern Brazil',     'coastal', 4, SF, true),
    makeTerr(6,10, 'brazil_e',      'Eastern Brazil',      'coastal', 4, SF),
    makeTerr(7,10, 'brazil_ne',     'NE Brazil',           'coastal', 3, SF),
    makeTerr(7,11, 'e_atlantic',    'East Atlantic',       'sea'),

    // ── South America South ────────────────────────────────────────────────
    makeTerr(3,10, 'bolivia',       'Bolivia',             'land',    3, SF),
    makeTerr(4,10, 'brazil_w',      'Western Brazil',      'land',    3, SF),
    makeTerr(4,11, 'brazil_s',      'Southern Brazil',     'coastal', 4, SF, true, true),
    makeTerr(3,11, 'chile_n',       'Northern Chile',      'coastal', 3, SF),
    makeTerr(3,12, 'chile_c',       'Central Chile',       'coastal', 3, SF),
    makeTerr(4,12, 'argentina_n',   'Northern Argentina',  'land',    4, SF, true),
    makeTerr(4,13, 'argentina_s',   'Patagonia',           'coastal', 2, SF),
    makeTerr(3,13, 'chile_s',       'Southern Chile',      'coastal', 2, SF),
    makeTerr(5,11, 'paraguay',      'Paraguay / Uruguay',  'coastal', 3, SF),
    makeTerr(5,12, 's_atlantic',    'South Atlantic',      'sea'),
    makeTerr(5,13, 's_atlantic_s',  'S Atlantic South',    'sea'),
    makeTerr(6,11, 's_atlantic_e',  'S Atlantic E',        'sea'),
    makeTerr(6,12, 's_atlantic_far','S Atlantic Far',      'sea'),
    makeTerr(2,13, 'drake_passage', 'Drake Passage',       'sea'),
    makeTerr(3,14, 'southern_ocean','Southern Ocean',      'sea'),
    makeTerr(4,14, 'southern_oc_e', 'Southern Ocean E',    'sea'),
  ];

  const blocked = new Set([
    ...block('greenland', 'maritimes'),   // Labrador Sea between
    ...block('greenland', 'nunavut'),     // Baffin Bay between
    ...block('alaska', 'bc'),            // They ARE adjacent - unblock
    ...block('california', 'mexico_n'),   // They ARE adjacent - unblock
    ...block('texas', 'mexico_c'),        // They ARE adjacent - unblock
    ...block('mexico_s', 'colombia'),     // C America between
    ...block('venezuela', 'brazil_n'),    // Could be adjacent...
    ...block('ecuador', 'colombia'),      // They are adjacent - unblock
    ...block('southeast', 'caribbean'),   // Gulf/Sea between
    ...block('new_england', 'c_atlantic'),// They could be adjacent (NE coast)
    ...block('caribbean_e', 'lesser_ant'),// They are adjacent - unblock
    ...block('hispaniola', 'lesser_ant'), // They ARE adjacent - unblock
  ]);
  // unblock the valid ones
  blocked.delete(['alaska', 'bc'].sort().join('|'));
  blocked.delete(['california', 'mexico_n'].sort().join('|'));
  blocked.delete(['texas', 'mexico_c'].sort().join('|'));
  blocked.delete(['ecuador', 'colombia'].sort().join('|'));
  blocked.delete(['caribbean_e', 'lesser_ant'].sort().join('|'));
  blocked.delete(['hispaniola', 'lesser_ant'].sort().join('|'));
  blocked.delete(['venezuela', 'brazil_n'].sort().join('|'));
  blocked.delete(['new_england', 'c_atlantic'].sort().join('|'));

  const map = buildMap('Western Hemisphere', '1.0.0', 900, 950, t, blocked);

  const adj = (a, b) => {
    const ta = map.territories.find(x => x.id === a);
    const tb = map.territories.find(x => x.id === b);
    if (!ta || !tb) return;
    if (!ta.adjacentTo.includes(b)) ta.adjacentTo.push(b);
    if (!tb.adjacentTo.includes(a)) tb.adjacentTo.push(a);
  };

  // Atlantic chain
  adj('labrador_sea', 'w_atlantic');
  adj('w_atlantic', 'c_atlantic');
  adj('c_atlantic', 'caribbean_e');
  adj('c_atlantic', 'atlantic_ocean');
  adj('atlantic_ocean', 'w_atlantic');
  adj('w_atlantic', 'e_atlantic');
  adj('e_atlantic', 's_atlantic_e');
  adj('s_atlantic_e', 's_atlantic_far');
  adj('s_atlantic', 's_atlantic_e');
  adj('s_atlantic_s', 's_atlantic_far');
  adj('s_atlantic_s', 'drake_passage');
  adj('chile_s', 'drake_passage');
  adj('argentina_s', 'drake_passage');
  adj('drake_passage', 'southern_ocean');
  adj('southern_ocean', 'southern_oc_e');
  // Pacific chain
  adj('pac_alaska', 'pac_nw_us');
  adj('pac_nw_us', 'pac_cal');
  adj('pac_cal', 'pac_mex');
  adj('pac_mex', 'pac_c_am');
  adj('pac_c_am', 'pac_col');
  adj('pac_col', 'pac_peru');
  adj('pac_peru', 'pac_chile');
  adj('pac_chile', 'pac_s');
  adj('pac_s', 'pac_far_s');
  adj('pac_far_s', 'southern_ocean');
  // Caribbean
  adj('gulf_mexico', 'caribbean_w');
  adj('caribbean_w', 'caribbean');
  adj('caribbean', 'caribbean_e');
  // Hudson Bay
  adj('baffin_bay', 'hudson_bay');
  adj('labrador_sea', 'hudson_bay');
  adj('hudson_bay', 'great_lakes');
  adj('arctic_can', 'hudson_bay');
  // continental connections
  adj('great_lakes', 'great_lakes_s');
  adj('ontario', 'great_lakes');
  adj('quebec', 'labrador_sea');
  adj('maritimes', 'labrador_sea');
  adj('new_england', 'atlantic_ocean');
  adj('new_york', 'atlantic_ocean');
  adj('mid_atlantic', 'atlantic_ocean');
  adj('southeast', 'gulf_mexico');
  adj('c_america', 'caribbean_w');
  adj('c_america', 'caribbean');
  adj('colombia', 'caribbean');
  adj('venezuela', 'caribbean_e');
  adj('venezuela', 'trinidad');
  adj('trinidad', 's_atlantic_e');
  adj('suriname', 's_atlantic_e');
  adj('brazil_ne', 'e_atlantic');
  adj('brazil_e', 'e_atlantic');
  adj('brazil_s', 's_atlantic');
  adj('argentina_n', 's_atlantic');
  adj('argentina_s', 's_atlantic_s');
  adj('chile_s', 'pac_far_s');
  adj('chile_c', 'pac_chile');
  adj('chile_n', 'pac_peru');
  adj('ecuador', 'pac_col');
  adj('peru', 'pac_peru');
  adj('c_america', 'pac_c_am');
  adj('mexico_s', 'pac_mex');
  adj('mexico_c', 'gulf_mexico');
  adj('texas', 'gulf_mexico');
  adj('southeast', 'w_atlantic');
  adj('lesser_ant', 'e_atlantic');
  adj('greenland', 'labrador_sea');
  adj('greenland', 'greenland_sea');

  return map;
}

// ── write maps ───────────────────────────────────────────────────────────────
const maps = [
  { fn: buildEurope,   file: 'assets/maps/grid-europe.json' },
  { fn: buildPacific,  file: 'assets/maps/grid-pacific.json' },
  { fn: buildAmericas, file: 'assets/maps/grid-americas.json' },
];

for (const { fn, file } of maps) {
  const map = fn();
  const outPath = path.join(__dirname, '..', file);
  fs.writeFileSync(outPath, JSON.stringify(map, null, 2));
  const land = map.territories.filter(t => t.type !== 'sea').length;
  const sea  = map.territories.filter(t => t.type === 'sea').length;
  console.log(`✓ ${map.name}: ${map.territories.length} territories (${land} land, ${sea} sea) → ${file}`);
}
