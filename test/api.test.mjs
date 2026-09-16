import assert from 'node:assert/strict';
import test from 'node:test';
import * as api from '../src/index.js';
import {runChecks, fixtures, describe} from './checks.mjs';
import {flatten as flatFlatten, unflatten as flatUnflatten} from 'flat';
import {flattie} from 'flattie';

const {flatten, unflatten, FlattenError} = api;

test('shared behavioural checks', () => {
  assert.ok(runChecks(api) >= 8);
});

test('the libraries this claims to beat really do lose these', () => {
  // The README is only honest while these hold, so they are asserted rather than written down once.
  const collision = {'a.b': 1, a: {b: 2}};
  assert.equal(Object.keys(flatFlatten(collision)).length, 1, 'flat is expected to collapse the two keys');
  assert.notDeepEqual(flatUnflatten(flatFlatten(collision)), collision, 'flat is expected to lose one value');

  const i18n = {'home.title': 'Home'};
  assert.notDeepEqual(flatUnflatten(flatFlatten(i18n)), i18n, 'flat is expected to split a dotted key');

  // Neither of flat's two modes keeps an array and a numeric-keyed object apart.
  const asArray = {a: ['x']};
  const asObject = {a: {'0': 'x'}};
  assert.notDeepEqual(flatUnflatten(flatFlatten(asObject)), asObject, 'default mode turns numeric keys into an array');
  assert.notDeepEqual(flatUnflatten(flatFlatten(asArray), {object: true}), asArray, 'object mode turns an array into an object');

  assert.equal(Object.keys(flattie({'a.b': 1, a: {b: 2}})).length, 1, 'flattie is expected to collide too');

  assert.throws(() => { let n = {}; for (let i = 0; i < 20000; i++) n = {n}; return flatFlatten(n); }, RangeError,
    'flat is expected to overflow the stack on deep input');
});

test('this keeps every one of those', () => {
  for (const value of [{'a.b': 1, a: {b: 2}}, {'home.title': 'Home'}, {a: ['x']}, {a: {'0': 'x'}}]) {
    assert.equal(describe(unflatten(flatten(value))), describe(value));
  }
});

test('paths read the way the format says', () => {
  assert.deepEqual(flatten({a: {b: 1}}), {'a.b': 1});
  assert.deepEqual(flatten({'a.b': 1}), {'a\\.b': 1});
  assert.deepEqual(flatten({a: ['x']}), {'a[0]': 'x'});
  assert.deepEqual(flatten({a: {'0': 'x'}}), {'a.0': 'x'});
  assert.deepEqual(flatten(['x']), {'[0]': 'x'});
  assert.deepEqual(flatten({'': 1}), {'\\0': 1});
  assert.deepEqual(flatten({'a[0]': 1}), {'a\\[0\\]': 1});
  assert.deepEqual(flatten({'a\\b': 1}), {'a\\\\b': 1});
});

test('an array that ends in holes keeps its length', () => {
  const sparse = [1];
  sparse[4] = 2;
  sparse.length = 7;
  const back = unflatten(flatten(sparse));
  assert.equal(back.length, 7);
  assert.equal(back[0], 1);
  assert.equal(back[4], 2);
  assert.ok(!(1 in back) && !(6 in back), 'the holes are still holes');
});

test('unflatten accepts paths a person wrote by hand', () => {
  assert.deepEqual(unflatten({'a.b': 1, 'a.c': 2}), {a: {b: 1, c: 2}});
  assert.deepEqual(unflatten({'rows[0].id': 7}), {rows: [{id: 7}]});
  assert.deepEqual(unflatten({'a\\.b': 1}), {'a.b': 1});
});

test('a second flatten of the same value gives the same paths', () => {
  for (const [, value] of fixtures()) {
    assert.deepEqual(flatten(value), flatten(value));
  }
});

test('leaves keep their identity', () => {
  const date = new Date(0);
  const map = new Map();
  const instance = Object.assign(Object.create({tag: 1}), {x: 1});
  const back = unflatten(flatten({date, map, instance}));
  assert.equal(back.date, date);
  assert.equal(back.map, map);
  assert.equal(back.instance, instance);
});

test('errors say what is wrong', () => {
  assert.throws(() => flatten('x'), (error) => {
    assert.ok(error instanceof FlattenError);
    assert.match(error.message, /plain object or an array/);
    return true;
  });
  assert.throws(() => unflatten({'a[': 1}), /unclosed/);
  assert.throws(() => unflatten({'a\\': 1}), /dangling escape/);
  assert.throws(() => unflatten({'a[x]': 1}), /not an array index/);
});
