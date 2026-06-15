/**
 * Corrects Southeast Asia / Pacific geography on grid-world-map.json.
 *
 * Problem: Indonesia, Malaysia, Philippines, etc. were placed east of Tokyo.
 * In reality they lie south and west of Japan; the open Pacific (Hawaii, Wake)
 * belongs east of Japan.
 *
 * Run: node scripts/fix-southeast-asia-geography.cjs
 * Then: npm run generate:mega-map
 */
const fs = require('fs');
const path = require('path');

const mapPath = path.join(__dirname, '../assets/maps/grid-world-map.json');
const CELL = 50;

function makeSea(col, row) {
  return {
    id: `sea_${row}_${col}`,
    name: 'Sea',
    type: 'sea',
    production: 0,
    isCapital: false,
    hasFactory: false,
    owner: null,
    originalOwner: null,
    polygon: [
      [col * CELL, row * CELL],
      [(col + 1) * CELL, row * CELL],
      [(col + 1) * CELL, (row + 1) * CELL],
      [col * CELL, (row + 1) * CELL],
    ],
    center: [col * CELL + 25, row * CELL + 25],
    adjacentTo: [],
    _col: col,
    _row: row,
  };
}

function repositionTerritory(territory, col, row) {
  territory.polygon = [
    [col * CELL, row * CELL],
    [(col + 1) * CELL, row * CELL],
    [(col + 1) * CELL, (row + 1) * CELL],
    [col * CELL, (row + 1) * CELL],
  ];
  territory.center = [col * CELL + 25, row * CELL + 25];
  territory._col = col;
  territory._row = row;
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

  const byId = new Map(data.territories.map(t => [t.id, t]));
  const byPos = new Map();

  for (const t of data.territories) {
    const col = Math.round(t.polygon[0][0] / CELL);
    const row = Math.round(t.polygon[0][1] / CELL);
    t._col = col;
    t._row = row;
    byPos.set(`${col},${row}`, t);
  }

  /** Move a land/coastal tile; vacated cell becomes sea. */
  const moveTo = (id, newCol, newRow) => {
    const t = byId.get(id);
    if (!t) throw new Error(`Unknown territory: ${id}`);
    const oldCol = t._col;
    const oldRow = t._row;
    if (oldCol === newCol && oldRow === newRow) return;

    const newKey = `${newCol},${newRow}`;
    const occupant = byPos.get(newKey);
    if (occupant && occupant.id !== id) {
      data.territories = data.territories.filter(x => x.id !== occupant.id);
      byPos.delete(newKey);
      byId.delete(occupant.id);
    }

    byPos.delete(`${oldCol},${oldRow}`);
    repositionTerritory(t, newCol, newRow);
    byPos.set(newKey, t);

    if (!byPos.has(`${oldCol},${oldRow}`)) {
      const oldSea = makeSea(oldCol, oldRow);
      data.territories.push(oldSea);
      byPos.set(`${oldCol},${oldRow}`, oldSea);
      byId.set(oldSea.id, oldSea);
    }
  };

  // Southeast Asia — south & west of Japan (Tokyo col 17, row 1)
  // Move Philippines first so later moves don't delete it from the registry.
  moveTo('philippines', 17, 3);
  moveTo('indochina', 15, 3);
  moveTo('thailand', 15, 4);
  moveTo('malaysia', 16, 4);
  moveTo('borneo', 16, 5);

  // Rename Borneo → Indonesia for clarity
  const indonesia = byId.get('borneo');
  if (indonesia) indonesia.name = 'Indonesia';

  // Central Pacific — east of Japan, not mixed with Southeast Asia
  moveTo('hawaii', 21, 2);
  moveTo('wake_island', 22, 3);

  // Oceania — south of Indonesia / Philippines
  moveTo('australia_n', 18, 6);
  moveTo('australia_e', 19, 6);
  moveTo('australia_w', 18, 7);
  moveTo('australia_s', 19, 7);
  moveTo('new_zealand', 20, 7);

  // Label Pacific seas for readability
  const pacificSeaNames = {
    '18,1': 'Sea of Japan',
    '18,2': 'Western Pacific',
    '19,1': 'Mid Pacific N',
    '19,3': 'Mid Pacific',
    '20,2': 'Central Pacific',
    '20,4': 'South Pacific W',
    '21,2': 'Eastern Pacific',
    '21,4': 'Coral Sea',
    '22,4': 'South Pacific',
  };
  for (const t of data.territories) {
    const key = `${t._col},${t._row}`;
    if (t.type === 'sea' && pacificSeaNames[key]) {
      t.name = pacificSeaNames[key];
    }
  }

  rebuildAdjacency(data.territories, cols, rows, Boolean(data.wrapHorizontal));

  const cleaned = data.territories.map(({ _col, _row, ...rest }) => rest);
  const out = {
    ...data,
    version: '4.2.0',
    wrapHorizontal: true,
    territories: cleaned,
  };

  fs.writeFileSync(mapPath, JSON.stringify(out));

  const tokyo = cleaned.find(t => t.id === 'tokyo');
  const indo = cleaned.find(t => t.id === 'borneo');
  const hi = cleaned.find(t => t.id === 'hawaii');
  console.log(`Updated ${mapPath} (v4.2.0)`);
  console.log(`  Tokyo col=${Math.round(tokyo.center[0] / CELL - 0.5)}`);
  console.log(`  Indonesia col=${Math.round(indo.center[0] / CELL - 0.5)} row=${Math.round(indo.center[1] / CELL - 0.5)}`);
  console.log(`  Hawaii col=${Math.round(hi.center[0] / CELL - 0.5)}`);
  console.log(`  Indonesia west of Tokyo: ${indo.center[0] < tokyo.center[0]}`);
  console.log(`  Hawaii east of Tokyo: ${hi.center[0] > tokyo.center[0]}`);
}

main();
