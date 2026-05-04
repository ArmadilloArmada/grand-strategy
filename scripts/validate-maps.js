const fs = require('fs');
const path = require('path');

const mapsDir = path.join(__dirname, '../assets/maps');
const mapFiles = fs.readdirSync(mapsDir)
  .filter(file => file.endsWith('.json'))
  .sort();

let totalErrors = 0;

for (const file of mapFiles) {
  const f = path.basename(file, '.json');
  const map = JSON.parse(fs.readFileSync(path.join(mapsDir, file), 'utf8'));
  const ids = new Set(map.territories.map(t => t.id));
  let errors = 0;

  for (const t of map.territories) {
    for (const adj of t.adjacentTo) {
      if (!ids.has(adj)) {
        console.log('MISSING REF:', f, t.id, '->', adj);
        errors++;
      } else {
        const other = map.territories.find(x => x.id === adj);
        if (other && !other.adjacentTo.includes(t.id)) {
          console.log('ONE-WAY:', f, t.id, '->', adj);
          errors++;
        }
      }
    }
  }

  const isolated = map.territories.filter(t => t.type !== 'sea' && t.adjacentTo.length === 0);
  if (isolated.length) console.log(f, 'ISOLATED:', isolated.map(t => t.id).join(', '));

  const capitals = map.territories.filter(t => t.isCapital).map(t => t.id).join(', ');
  const factories = map.territories.filter(t => t.hasFactory).length;
  console.log(f + ': ' + (errors ? errors + ' ERRORS' : 'OK') +
    ' | ' + map.territories.length + ' territories' +
    ' | ' + factories + ' factories' +
    ' | capitals: ' + capitals);

  totalErrors += errors;
}

if (totalErrors > 0) {
  process.exitCode = 1;
}
