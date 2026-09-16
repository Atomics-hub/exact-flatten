// Reproduces the README: what each library loses on a flatten/unflatten round trip, how deep each
// can go, and how fast they are. Run with: npm run bench
import {flatten, unflatten} from '../src/index.js';
import {flatten as flatFlatten, unflatten as flatUnflatten} from 'flat';
import {flattie} from 'flattie';
import safeFlat from 'safe-flat';
import {fixtures, describe} from '../test/checks.mjs';

const ROUND_TRIPS = {
  'flat': (v) => flatUnflatten(flatFlatten(v)),
  'flat {object:true}': (v) => flatUnflatten(flatFlatten(v), {object: true}),
  'safe-flat': (v) => safeFlat.unflatten(safeFlat.flatten(v)),
  'exact-flatten': (v) => unflatten(flatten(v)),
};

console.log('round trip: does the original come back?\n');
const cases = fixtures();
console.log('library'.padEnd(22) + 'kept'.padStart(8) + '   first losses');
for (const [name, roundTrip] of Object.entries(ROUND_TRIPS)) {
  let kept = 0;
  const lost = [];
  for (const [label, value] of cases) {
    try {
      if (describe(roundTrip(value)) === describe(value)) kept++;
      else lost.push(label);
    } catch { lost.push(label + ' (threw)'); }
  }
  console.log(name.padEnd(22) + `${kept}/${cases.length}`.padStart(8) + '   ' + lost.slice(0, 3).join(', '));
}

console.log('\ndeepest structure each one can flatten\n');
const nest = (depth) => { let node = {leaf: 1}; for (let i = 1; i < depth; i++) node = {next: node}; return node; };
const FLATTENERS = {'flat': flatFlatten, 'flattie': flattie, 'safe-flat': safeFlat.flatten, 'exact-flatten': flatten};
console.log('library'.padEnd(22) + 'deepest ok'.padStart(12) + '   how it fails');
for (const [name, fn] of Object.entries(FLATTENERS)) {
  let deepest = 0, how = '';
  for (const depth of [1000, 5000, 10000, 100000, 1000000]) {
    try { fn(nest(depth)); deepest = depth; }
    catch (error) { how = String(error.message).slice(0, 40); break; }
  }
  console.log(name.padEnd(22) + String(deepest).padStart(12) + '   ' + how);
}

console.log('\nspeed, flatten then unflatten, best of seven, milliseconds\n');
const make = (n) => ({rows: Array.from({length: n}, (_, i) => ({id: i, tags: ['a', 'b'], meta: {seen: true}}))});
const best = (fn, runs = 7) => { fn(); let ms = Infinity; for (let i = 0; i < runs; i++) { const t = process.hrtime.bigint(); fn(); ms = Math.min(ms, Number(process.hrtime.bigint() - t) / 1e6); } return ms; };
const names = Object.keys(ROUND_TRIPS);
console.log('rows'.padStart(8) + names.map((n) => n.padStart(22)).join(''));
for (const n of [1000, 10000, 50000]) {
  const value = make(n);
  console.log(String(n).padStart(8) + names.map((k) => {
    try { return best(() => ROUND_TRIPS[k](value)).toFixed(2).padStart(22); } catch { return 'threw'.padStart(22); }
  }).join(''));
}
