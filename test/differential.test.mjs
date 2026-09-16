// The correctness gate.
//
// Generated structures, held to one property: unflatten(flatten(x)) is x. The generator deliberately
// produces the keys that break delimiter-based flattening — dots, brackets, backslashes, digits — and
// mixes arrays with objects whose keys are numeric, because telling those two apart is the other half
// of the problem.
import assert from 'node:assert/strict';
import test from 'node:test';
import {flatten, unflatten, FlattenError} from '../src/index.js';
import {describe} from './checks.mjs';

let state = 20260928;
const rnd = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
const pick = (list) => list[Math.floor(rnd() * list.length)];

const KEYS = ['a', 'b', 'home.title', 'example.com', 'a[0]', 'a\\b', '0', '1', '', 'x.y.z', ']', '[', '.', 'k'];
const LEAVES = [1, 0, -2.5, 'text', '', true, false, null, undefined, 9007199254740993n];

function build(depth) {
  if (depth <= 0 || rnd() < 0.3) return pick(LEAVES);
  if (rnd() < 0.35) {
    const length = Math.floor(rnd() * 4);
    const out = new Array(length);
    for (let i = 0; i < length; i++) if (rnd() > 0.15) out[i] = build(depth - 1);
    return out;
  }
  const out = {};
  const count = Math.floor(rnd() * 4);
  for (let i = 0; i < count; i++) out[pick(KEYS)] = build(depth - 1);
  return out;
}

test('500 generated structures round trip exactly', () => {
  for (let n = 0; n < 500; n++) {
    const value = rnd() < 0.2 ? [build(4), build(4)] : {root: build(4), extra: build(3)};
    const before = describe(value);
    let back;
    try { back = unflatten(flatten(value)); } catch (error) { throw new Error(`structure ${n} threw: ${error.message}\n${before.slice(0, 200)}`); }
    assert.equal(describe(back), before, `structure ${n} did not round trip`);
  }
});

test('flattening never changes the input', () => {
  for (let n = 0; n < 200; n++) {
    const value = {root: build(4)};
    const before = describe(value);
    flatten(value);
    assert.equal(describe(value), before, `structure ${n} was modified by flatten`);
  }
});

test('every generated key survives as itself', () => {
  for (let n = 0; n < 200; n++) {
    const keys = Array.from({length: 1 + Math.floor(rnd() * 5)}, () => pick(KEYS));
    const value = {};
    for (const key of keys) value[key] = build(2);
    const flat = flatten(value);
    const back = unflatten(flat);
    const show = (v) => JSON.stringify(v, (k, x) => typeof x === 'bigint' ? String(x) : x === undefined ? '__undef__' : x);
    assert.deepEqual(Object.keys(back).sort(), Object.keys(value).sort(),
      `structure ${n} changed its keys\n  in:   ${show(value)}\n  flat: ${show(flat)}\n  back: ${show(back)}`);
  }
});

test('the flat form is stable: flattening twice gives the same paths', () => {
  for (let n = 0; n < 100; n++) {
    const value = {root: build(4)};
    assert.deepEqual(Object.keys(flatten(value)), Object.keys(flatten(value)));
    // And flattening what unflatten produced gives the same flat form again.
    const once = flatten(value);
    assert.deepEqual(flatten(unflatten(once)), once, `structure ${n} was not stable`);
  }
});

test('depth is bounded by memory, not by the call stack', () => {
  for (const depth of [50000, 200000]) {
    let node = {leaf: 1};
    for (let i = 1; i < depth; i++) node = {next: node};
    const back = unflatten(flatten(node));
    let seen = 0;
    for (let cursor = back; cursor && cursor.next !== undefined; cursor = cursor.next) seen++;
    assert.equal(seen, depth - 1);
  }
});

test('flattening stays linear in the size of the input', () => {
  const make = (n) => ({rows: Array.from({length: n}, (_, i) => ({id: i, tags: ['a', 'b'], meta: {seen: true}}))});
  const time = (value) => {
    flatten(value);
    let best = Infinity;
    for (let i = 0; i < 3; i++) {
      const started = process.hrtime.bigint();
      flatten(value);
      best = Math.min(best, Number(process.hrtime.bigint() - started) / 1e6);
    }
    return best;
  };
  const small = Math.max(time(make(2000)), 0.5);
  const large = time(make(16000));
  assert.ok(large < small * 24 + 50, `eightfold input multiplied the time by ${(large / small).toFixed(1)}`);
});

test('a path that contradicts an earlier one is refused', () => {
  assert.throws(() => unflatten({'a.b': 1, 'a[0]': 2}), FlattenError);
  assert.throws(() => unflatten({'a[0]': 1, 'a.b': 2}), FlattenError);
});
