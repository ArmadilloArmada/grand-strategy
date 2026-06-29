/**
 * Adds Pacific geography + horizontal wrap to grid-world-map.json:
 * - Hawaii, Australia, New Zealand
 * - Rebuilds 8-way adjacency with east↔west wrap
 *
 * Run: node scripts/update-world-map-wrap.cjs
 * Then: npm run generate:mega-map
 */
const fs = require('fs');
const path = require('path');

const mapPath = path.join(__dirname, '../assets/maps/grid-world-map.json');
const CELL = 50;

function makeTerr(col, row, id, name, type, prod = 3, owner = null, factory = false, capital = false) {
  return {
    id,
    name,
    type,
    production: type === 'sea' ? 0 : prod,
    adjacentTo: [],
    polygon: [[col * CELL, row * CELL], [(col + 1) * CELL, row * CELL], [(col + 1) * CELL, (row + 1) * CELL], [col * CELL, (row + 1) * CELL]],
    center: [col * CELL + 25, row * CELL + 25],
    owner: owner ?? null,
    originalOwner: owner ?? null,
    hasFactory: factory,
    isCapital: capital,
    _col: col,
    _row: row,
  };
}

function rebuildAdjacency(territories, cols, rows, wrapHorizontal) {
  const byPos = new Map();
  for (const t of territories) {
    byPos.set(`${t._col},${t._row}`, t);
  }

  const offsets = [
    [0, -1], [1, 0], [0, 1], [-1, 0],
    [-1, -1], [1, -1], [-1, 1], [1, 1],
  ];

  for (const t of territories) {
    const merged = new Set();
    for (const [dc, dr] of offsets) {
      const nr = t._row + dr;
      if (nr < 0 || nr >= rows) continue;
      let nc = t._col + dc;
      if (wrapHorizontal) {
        nc = ((nc % cols) + cols) % cols;
      } else if (nc < 0 || nc >= cols) {
        continue;
      }
      const n = byPos.get(`${nc},${nr}`);
      if (n && n.id !== t.id) merged.add(n.id);
    }
    t.adjacentTo = Array.from(merged).sort();
  }
}

function main() {
  const data = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
  const cols = Math.round(data.width / CELL);
  const rows = Math.round(data.height / CELL);

  const byPos = new Map();
  for (const t of data.territories) {
    const col = Math.round(t.polygon[0][0] / CELL);
    const row = Math.round(t.polygon[0][1] / CELL);
    t._col = col;
    t._row = row;
    byPos.set(`${col},${row}`, t);
  }

  const replaceAt = (col, row, territory) => {
    const key = `${col},${row}`;
    const old = byPos.get(key);
    if (old) {
      data.territories = data.territories.filter(t => t.id !== old.id);
    }
    territory._col = col;
    territory._row = row;
    data.territories.push(territory);
    byPos.set(key, territory);
  };

  const SF = 'southern_federation';
  const AA = 'atlantic_alliance';

  // Central Pacific — east of Japan (not mixed with Southeast Asia)
  replaceAt(21, 2, makeTerr(21, 2, 'hawaii', 'Hawaii', 'coastal', 2, AA));
  replaceAt(22, 3, makeTerr(22, 3, 'wake_island', 'Wake Atoll', 'coastal', 1, null));

  // Oceania — south of Indonesia / Philippines
  replaceAt(18, 6, makeTerr(18, 6, 'australia_n', 'Northern Australia', 'coastal', 3, SF));
  replaceAt(19, 6, makeTerr(19, 6, 'australia_e', 'Eastern Australia', 'coastal', 4, SF, true));
  replaceAt(18, 7, makeTerr(18, 7, 'australia_w', 'Western Australia', 'coastal', 3, SF));
  replaceAt(19, 7, makeTerr(19, 7, 'australia_s', 'Southern Australia', 'coastal', 3, SF));
  replaceAt(20, 7, makeTerr(20, 7, 'new_zealand', 'New Zealand', 'coastal', 2, null));

  // Name key Pacific seas for readability
  const seaNames = {
    '23,1': 'Eastern Pacific',
    '22,1': 'Mid Pacific',
    '23,2': 'Central Pacific E',
    '23,3': 'Central Pacific S',
    '23,4': 'South Pacific E',
    '22,4': 'South Pacific',
    '23,5': 'Tasman Sea E',
    '22,5': 'Coral Sea',
    '23,6': 'Southern Ocean E',
  };
  for (const [key, name] of Object.entries(seaNames)) {
    const sea = byPos.get(key);
    if (sea?.type === 'sea') sea.name = name;
  }

  rebuildAdjacency(data.territories, cols, rows, true);

  const cleaned = data.territories.map(({ _col, _row, ...rest }) => rest);
  const out = {
    ...data,
    version: '4.1.0',
    wrapHorizontal: true,
    territories: cleaned,
  };

  fs.writeFileSync(mapPath, JSON.stringify(out));
  console.log(`Updated ${mapPath}`);
  console.log(`  territories: ${cleaned.length}`);
  console.log(`  wrapHorizontal: true`);
  console.log(`  added: hawaii, australia (4 tiles), new_zealand, wake_island`);

  const alaska = cleaned.find(t => t.id === 'alaska');
  const hawaii = cleaned.find(t => t.id === 'hawaii');
  if (alaska && hawaii) {
    console.log(`  alaska neighbors include hawaii: ${alaska.adjacentTo.includes('hawaii')}`);
    console.log(`  hawaii neighbors include alaska: ${hawaii.adjacentTo.includes('alaska')}`);
  }
}

main();
