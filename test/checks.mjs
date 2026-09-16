// Behavioural checks shared by the unit tests and by the test that installs the packed artifact into
// a fresh consumer, so the published build is held to the same behaviour as the source.
import assert from 'node:assert/strict';

// Comparison that distinguishes undefined from absent, and arrays from objects with numeric keys.
export function describe(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value !== 'object') return typeof value + ':' + String(value);
  if (value instanceof Date) return 'Date:' + value.toISOString();
  if (Array.isArray(value)) {
    const parts = [];
    for (let i = 0; i < value.length; i++) parts.push(i in value ? describe(value[i]) : '<hole>');
    return '[' + parts.join(',') + ']';
  }
  const proto = Object.getPrototypeOf(value);
  const tag = proto === null ? 'nullproto' : proto === Object.prototype ? '' : 'other';
  return tag + '{' + Object.keys(value).map((k) => JSON.stringify(k) + ':' + describe(value[k])).join(',') + '}';
}

const withHole = () => { const a = [1]; a[3] = 2; return a; };

export function fixtures() {
  return [
    ['plain nesting', {a: {b: {c: 1}}}],
    ['a key containing the delimiter', {'a.b': 1, a: {b: 2}}],
    ['only a dotted key', {'user.name': 'alice'}],
    ['i18n message ids', {'home.title': 'Home', 'home.body': 'Welcome'}],
    ['a hostname as a key', {'example.com': {ip: '1.2.3.4'}}],
    ['a metric name as a key', {'http.server.requests': 5}],
    ['numeric keys that are an object', {'1': {'2': 'x'}}],
    ['a real array', {a: ['x', 'y']}],
    ['an object whose key is "0"', {a: {'0': 'zero'}}],
    ['array of objects', {rows: [{id: 1}, {id: 2}]}],
    ['nested arrays', {a: [[1, 2], [3]]}],
    ['array at the root', [{id: 1}, {id: 2}]],
    ['a sparse array', {a: withHole()}],
    ['an empty object value', {a: {}, b: 1}],
    ['an empty array value', {a: [], b: 1}],
    ['null and undefined values', {a: null, b: undefined}],
    ['a key containing brackets', {'a[0]': 1, a: [9]}],
    ['a key containing a backslash', {'a\\b': 1}],
    ['an empty key', {'': 1}],
    ['an empty root', {}],
    ['a Date is a leaf', {d: new Date(0)}],
    ['a Map is a leaf', {m: new Map([['k', 1]])}],
    ['a class instance is a leaf', {p: Object.assign(Object.create({tag: 1}), {x: 1})}],
    ['a null-prototype object', {a: Object.assign(Object.create(null), {b: 1})}],
    ['everything awkward at once', {a: {'b.c': [{'d]e': 1}, {'f\\g': 2}]}, '': {'': 3}}],
  ];
}

export function runChecks(api) {
  const {flatten, unflatten, FlattenError} = api;
  let checked = 0;
  const check = (name, fn) => { fn(); checked++; };

  check('every fixture returns exactly what went in', () => {
    for (const [label, value] of fixtures()) {
      const back = unflatten(flatten(value));
      assert.equal(describe(back), describe(value), `${label} did not round trip`);
    }
  });

  check('the result of flatten is one level deep', () => {
    for (const [label, value] of fixtures()) {
      // Mirrors the rule the implementation uses: only arrays and plain objects without symbol keys
      // are walked, so anything else in the output is a leaf and belongs there.
      const walkable = (item) => {
        if (Array.isArray(item)) return true;
        if (item === null || typeof item !== 'object') return false;
        if (Object.getPrototypeOf(item) !== Object.prototype) return false;
        return Object.getOwnPropertySymbols(item).length === 0;
      };
      for (const [path, item] of Object.entries(flatten(value))) {
        const isEmptyContainer = walkable(item) && (Array.isArray(item) ? item.length === 0 : Object.keys(item).length === 0);
        assert.ok(isEmptyContainer || !walkable(item), `${label}: ${path} still holds a walkable container`);
      }
    }
  });

  check('a key containing the delimiter survives beside the nested form', () => {
    const value = {'a.b': 1, a: {b: 2}};
    const flat = flatten(value);
    assert.equal(Object.keys(flat).length, 2, 'both values must reach the flat form');
    const back = unflatten(flat);
    assert.equal(back['a.b'], 1);
    assert.equal(back.a.b, 2);
  });

  check('an array and an object with numeric keys stay different', () => {
    const asArray = unflatten(flatten({a: ['x']}));
    const asObject = unflatten(flatten({a: {'0': 'x'}}));
    assert.ok(Array.isArray(asArray.a), 'the array came back as an array');
    assert.ok(!Array.isArray(asObject.a), 'the object did not become an array');
    assert.equal(asObject.a['0'], 'x');
  });

  check('values that a path cannot describe are kept whole', () => {
    const date = new Date(0);
    const map = new Map([['k', 1]]);
    const flat = flatten({date, map});
    assert.equal(flat.date, date, 'the same Date instance');
    assert.equal(flat.map, map, 'the same Map instance');
  });

  check('bad input is refused', () => {
    for (const bad of [null, undefined, 1, 'x', new Date()]) {
      assert.throws(() => flatten(bad), FlattenError);
    }
    for (const bad of [null, undefined, 1, 'x', []]) {
      assert.throws(() => unflatten(bad), FlattenError);
    }
  });

  check('malformed paths are refused rather than guessed at', () => {
    assert.throws(() => unflatten({'a[': 1}), FlattenError);
    assert.throws(() => unflatten({'a[x]': 1}), FlattenError);
    assert.throws(() => unflatten({'a\\': 1}), FlattenError);
    assert.throws(() => unflatten({'a[0]': 1, 'a.b': 2}), FlattenError);
  });

  check('deep structures do not overflow the stack', () => {
    let node = {leaf: 1};
    for (let i = 1; i < 100000; i++) node = {next: node};
    const flat = flatten(node);
    const paths = Object.keys(flat);
    assert.equal(paths.length, 1);
    assert.equal(paths[0].split('.').length, 100000);
    const back = unflatten(flat);
    let depth = 0;
    for (let cursor = back; cursor && cursor.next !== undefined; cursor = cursor.next) depth++;
    assert.equal(depth, 99999);
  });

  return checked;
}
