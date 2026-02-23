const fs = require('fs');
const path = require('path');

const mapPath = path.join(__dirname, '../assets/maps/grid-europe.json');
const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
const get = id => map.territories.find(t => t.id === id);

const link = (a, b) => {
  const ta = get(a), tb = get(b);
  if (!ta || !tb) { console.warn('missing:', a, b); return; }
  if (!ta.adjacentTo.includes(b)) ta.adjacentTo.push(b);
  if (!tb.adjacentTo.includes(a)) tb.adjacentTo.push(a);
};
const unlink = (a, b) => {
  const ta = get(a), tb = get(b);
  if (ta) ta.adjacentTo = ta.adjacentTo.filter(x => x !== b);
  if (tb) tb.adjacentTo = tb.adjacentTo.filter(x => x !== a);
};

// Fix one-way issues from cell collision (english_ch & france_n share col=2,row=3)
link('english_ch', 'england');
link('english_ch', 'benelux');
link('english_ch', 'portugal');   // English Channel doesn't touch Portugal; remove this
// actually Portugal is at col=1,row=3 and english_ch at col=2,row=3 — they ARE grid-adjacent
// but geographically the Channel doesn't reach Portugal. Remove it.
unlink('english_ch', 'portugal');
link('english_ch', 'france_n');   // france_n is at same cell; link them to their neighbors instead

// yugoslavia one-ways
link('yugoslavia', 'austria');
link('yugoslavia', 'romania');
link('yugoslavia', 'hungary');
link('yugoslavia', 'greece');

// italy_s one-ways
link('italy_s', 'italy_n');
link('italy_s', 'med_c3');
link('italy_s', 'med_e1');

// Also: france_n should connect to benelux and england via channel
link('france_n', 'benelux');
link('france_n', 'england');    // via English Channel

// Extra geographic fixes
link('spain_n', 'france_s');     // Pyrenees border
link('portugal', 'spain_n');
link('portugal', 'bay_biscay');
link('morocco', 'spain_s');      // Strait of Gibraltar (game abstraction)
link('tunisia', 'italy_s');      // Sicily Channel
link('med_c3', 'med_e1');
link('aegean_sea', 'med_e2');
link('med_e4', 'black_sea');     // connects through Bosphorus area
link('black_sea', 'turkey_w');
link('black_sea_e', 'turkey_e');

// Validate
let errors = 0;
const ids = new Set(map.territories.map(t => t.id));
for (const t of map.territories) {
  for (const adj of t.adjacentTo) {
    if (!ids.has(adj)) { console.log('MISSING REF:', t.id, '->', adj); errors++; continue; }
    const other = get(adj);
    if (!other.adjacentTo.includes(t.id)) { console.log('STILL ONE-WAY:', t.id, '->', adj); errors++; }
  }
}

fs.writeFileSync(mapPath, JSON.stringify(map, null, 2));
console.log(errors ? errors + ' errors remain' : 'All adjacencies valid!');
console.log('Saved grid-europe.json');
