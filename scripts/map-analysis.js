const fs = require('fs');
const path = require('path');
const map = JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/maps/grid-world-map.json'),'utf8'));
const get = id => map.territories.find(t => t.id === id);

function hops(startId, endId) {
  const visited = new Set([startId]);
  const queue = [[startId, 0]];
  while (queue.length) {
    const [cur, dist] = queue.shift();
    const t = get(cur);
    if (!t) continue;
    for (const adj of t.adjacentTo) {
      if (adj === endId) return dist + 1;
      if (!visited.has(adj)) { visited.add(adj); queue.push([adj, dist+1]); }
    }
  }
  return -1;
}

const routes = [
  ['new_england',   'uk',          'US East Coast → UK (Atlantic)'],
  ['new_york',      'france',      'New York → France'],
  ['carolinas',     'morocco',     'Carolinas → Morocco'],
  ['california',    'japan',       'California → Japan (Pacific)'],
  ['alaska',        'kamchatka',   'Alaska → Kamchatka (Bering)'],
  ['florida',       'brazil',      'Florida → Brazil'],
  ['uk',            'leningrad',   'UK → Leningrad (overland)'],
  ['india_south',   'east_africa', 'India → East Africa'],
  ['australia_east','japan',       'Australia → Japan'],
  ['illinois',      'russia_west', 'Chicago → Moscow (overland)'],
  ['virginia',      'morocco',     'Virginia → Morocco'],
  ['new_england',   'uk',          'new_england → uk (sea only?)'],
];

console.log('Hop counts (all territory types, shortest path):');
for (const [a, b, label] of routes) {
  const h = hops(a, b);
  const flag = h <= 2 ? ' *** TOO FAST' : h <= 3 ? ' * fast' : '';
  console.log('  ' + label.padEnd(40) + h + ' hops' + flag);
}

const wwiiUnits = JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/units/wwii-units.json'),'utf8'));
console.log('\nWWII unit movement values:');
const units = Array.isArray(wwiiUnits) ? wwiiUnits : wwiiUnits.unitTypes || wwiiUnits.units || Object.values(wwiiUnits);
for (const u of units) {
  if (u.movement !== undefined) {
    console.log('  ' + u.id.padEnd(18) + 'mov=' + u.movement);
  }
}

console.log('\nMap size: ' + map.width + 'x' + map.height);
console.log('Atlantic sea cells (x=400-500): ' + map.territories.filter(t => t.type==='sea' && t.center[0]>=400 && t.center[0]<500).map(t=>t.id).join(', '));
console.log('Pacific sea cells (x>1100): ' + map.territories.filter(t => t.type==='sea' && t.center[0]>1100).length + ' cells');
