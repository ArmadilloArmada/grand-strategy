/**
 * Generates grid-world-map-mega.json from grid-world-map.json:
 * each 50×50 territory → four 25×25 sub-territories (48×16 grid on 1200×400).
 * Updates world-factions-mega.json capital ids to the sub-tile that contains each old capital center.
 *
 * Run: node scripts/generate-mega-world-map.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const INPUT = path.join(ROOT, 'assets/maps/grid-world-map.json');
const OUT_MAP = path.join(ROOT, 'assets/maps/grid-world-map-mega.json');
const OUT_FACTIONS = path.join(ROOT, 'assets/factions/world-factions-mega.json');

function polyMinMax(poly) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of poly) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

function pointInRect(px, py, minX, minY, maxX, maxY) {
  return px >= minX && px < maxX && py >= minY && py < maxY;
}

function subId(parentId, sx, sy) {
  return `${parentId}__${sx}_${sy}`;
}

function main() {
  const data = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
  const CELL = 50;
  const SUB = 25;
  const oldTerritories = data.territories;

  const cellKey = (gx, gy) => `${gx},${gy}`;
  const gridToId = new Map();

  const newTerritories = [];

  for (const t of oldTerritories) {
    const { minX, minY, maxX, maxY } = polyMinMax(t.polygon);
    if (maxX - minX !== CELL || maxY - minY !== CELL) {
      throw new Error(`Expected 50×50 cell for ${t.id}, got ${maxX - minX}×${maxY - minY}`);
    }

    const prod = Number(t.production) || 0;
    const base = Math.floor(prod / 4);
    let rem = prod % 4;
    const productions = [];
    for (let i = 0; i < 4; i++) {
      productions.push(base + (rem > 0 ? 1 : 0));
      if (rem > 0) rem--;
    }

    let qi = 0;
    for (let sy = 0; sy < 2; sy++) {
      for (let sx = 0; sx < 2; sx++) {
        const x0 = minX + sx * SUB;
        const y0 = minY + sy * SUB;
        const id = subId(t.id, sx, sy);
        const gx = Math.floor(x0 / SUB);
        const gy = Math.floor(y0 / SUB);
        gridToId.set(cellKey(gx, gy), id);

        const nameSuffix = sx === 0 && sy === 0 ? 'NW' : sx === 1 && sy === 0 ? 'NE' : sx === 0 && sy === 1 ? 'SW' : 'SE';
        const nt = {
          id,
          name: `${t.name} (${nameSuffix})`,
          type: t.type,
          production: productions[qi],
          isCapital: false,
          hasFactory: false,
          owner: t.owner,
          originalOwner: t.originalOwner,
          polygon: [
            [x0, y0],
            [x0 + SUB, y0],
            [x0 + SUB, y0 + SUB],
            [x0, y0 + SUB],
          ],
          center: [x0 + SUB / 2, y0 + SUB / 2],
          adjacentTo: [],
        };
        if (t.color != null) nt.color = t.color;
        if (t.terrain != null) nt.terrain = t.terrain;
        if (t.resource != null) nt.resource = t.resource;
        if (t.isCapital) {
          const [cx, cy] = t.center;
          if (pointInRect(cx, cy, x0, y0, x0 + SUB, y0 + SUB)) nt.isCapital = true;
        }
        if (t.hasFactory) {
          const [cx, cy] = t.center;
          if (pointInRect(cx, cy, x0, y0, x0 + SUB, y0 + SUB)) nt.hasFactory = true;
        }
        newTerritories.push(nt);
        qi++;
      }
    }
  }

  const maxGx = Math.floor(data.width / SUB) - 1;
  const maxGy = Math.floor(data.height / SUB) - 1;

  for (const nt of newTerritories) {
    const x0 = nt.polygon[0][0];
    const y0 = nt.polygon[0][1];
    const gx = Math.floor(x0 / SUB);
    const gy = Math.floor(y0 / SUB);
    const adj = [];
    const tryN = (dgx, dgy) => {
      const ngx = gx + dgx;
      const ngy = gy + dgy;
      if (ngx < 0 || ngx > maxGx || ngy < 0 || ngy > maxGy) return;
      const nid = gridToId.get(cellKey(ngx, ngy));
      if (nid && nid !== nt.id) adj.push(nid);
    };
    tryN(1, 0);
    tryN(-1, 0);
    tryN(0, 1);
    tryN(0, -1);
    adj.sort();
    nt.adjacentTo = adj;
  }

  const capitals = { washington: null, moscow: null, tokyo: null, india: null };
  for (const nt of newTerritories) {
    if (nt.isCapital && capitals.hasOwnProperty(nt.id.split('__')[0])) {
      const base = nt.id.split('__')[0];
      if (base in capitals) capitals[base] = nt.id;
    }
  }
  for (const [k, v] of Object.entries(capitals)) {
    if (!v) throw new Error(`No sub-capital tile found for ${k}`);
  }

  const outData = {
    id: 'grid-mega',
    name: 'World at War — Fine Grid (Grid)',
    version: '1.0.0',
    width: data.width,
    height: data.height,
    gridSize: SUB,
    backgroundColor: data.backgroundColor,
    territories: newTerritories,
    startingUnits: [],
  };

  fs.writeFileSync(OUT_MAP, JSON.stringify(outData));

  const factions = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/factions/world-factions.json'), 'utf8'));
  for (const f of factions) {
    const cap = f.capital;
    if (capitals[cap]) f.capital = capitals[cap];
    else throw new Error(`Unknown capital territory ${cap}`);
  }
  fs.writeFileSync(OUT_FACTIONS, JSON.stringify(factions, null, 2) + '\n');

  console.log('Wrote', OUT_MAP, `(${newTerritories.length} territories)`);
  console.log('Wrote', OUT_FACTIONS);
  console.log('Capital mapping:', capitals);
}

main();
