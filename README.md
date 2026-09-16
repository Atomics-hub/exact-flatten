# exact-flatten

Flatten an object to `path -> value` pairs and get exactly the same object back. Zero dependencies.

```js
import {flatten, unflatten} from 'exact-flatten';

const flat = flatten({user: {name: 'alice', tags: ['a', 'b']}});
// {'user.name': 'alice', 'user.tags[0]': 'a', 'user.tags[1]': 'b'}

unflatten(flat);   // the object that went in
```

## The problem

Flattening is only useful if it can be undone, and the delimiter is what stops it. If a key can
itself contain the delimiter, `a.b` means two different things and one of them has to lose.

`flat` (21.7M downloads a week) resolves that by destroying a value:

```js
unflatten(flatten({'a.b': 1, a: {b: 2}}));   // {a: {b: 2}} — the first value is gone
```

There is no delimiter that fixes this — choose `|` and a key containing `|` breaks the same way.
Keys with dots in them are not exotic: i18n message ids, hostnames, metric names, CSV headers,
filenames, any `Record<string, T>` keyed by user input.

The second ambiguity is digits. Once a key is a number, a path cannot say whether it belonged to an
array or to an object:

```js
unflatten(flatten({'1': {'2': 'x'}}));   // {'1': [null, null, 'x']} — an object became a sparse array
unflatten(flatten({a: {'0': 'zero'}}));  // {a: ['zero']}
```

`flat`'s `{object: true}` fixes the second case by breaking the first: then every array comes back
as an object. No option keeps both. `safe-flat` (287k a week) loses both cases in the same way.
`flattie` (4.1M a week) only flattens — there is nothing to reverse.

None of this throws. It is silent data loss, in a round trip whose whole purpose is to be lossless.

## The format

`exact-flatten` escapes instead of guessing, so every path has exactly one reading:

| path | means |
| --- | --- |
| `a.b` | two keys, `a` then `b` |
| `a\.b` | one key, `a.b` |
| `a[0]` | key `a` holding an array |
| `a.0` | key `a` holding an object whose key is `"0"` |
| `[0]` | the whole value was an array |
| `\0` | the empty key |
| `a[]` | the length of an array that ends in holes |

```js
flatten({'a.b': 1, a: {b: 2}});   // {'a\\.b': 1, 'a.b': 2}  — both survive
flatten({'example.com': {ip: '1.2.3.4'}});   // {'example\\.com.ip': '1.2.3.4'}
```

`.`, `[`, `]` and `\` are escaped inside keys; nothing else is touched, so ordinary paths stay
readable. Values a path cannot describe — `Date`, `Map`, class instances, null-prototype objects,
objects with symbol keys — are kept whole as leaves rather than being walked into and lost.
`unflatten` throws `FlattenError` on a malformed or contradictory path instead of guessing.

## Measured

`npm run bench` reproduces all of this.

**Round trip** — 25 fixtures, comparing what comes back against what went in, counting `undefined`
separately from absent, array holes, and arrays separately from objects with numeric keys:

| library | weekly downloads | kept | first losses |
| --- | --- | --- | --- |
| `flat` | 21.7M | 13/25 | key containing the delimiter, dotted key, i18n ids |
| `flat` `{object: true}` | 21.7M | 11/25 | same, plus every array returns as an object |
| `safe-flat` | 287k | 14/25 | key containing the delimiter, dotted key, i18n ids |
| **`exact-flatten`** | — | **25/25** | — |

**Depth** — the deepest structure each one can flatten:

| library | deepest that worked | how it fails |
| --- | --- | --- |
| `flat`, `flattie`, `safe-flat` | 1,000 | `Maximum call stack size exceeded` |
| **`exact-flatten`** | **1,000,000** | — |

**Speed** — flatten then unflatten a list of rows, best of seven, milliseconds:

| rows | `flat` | `safe-flat` | **`exact-flatten`** |
| --- | --- | --- | --- |
| 1,000 | 5.36 | 7.11 | **3.03** |
| 10,000 | 64.13 | 409.83 | **37.71** |
| 50,000 | 445.19 | 9,334.30 | **275.13** |

Measured on Node 24, Apple Silicon. The exact numbers move with the machine; the ordering does not.

## API

### `flatten(value)`

Takes a plain object or an array and returns a flat object of `path -> value`. Throws
`FlattenError` on anything else.

Empty objects and empty arrays are preserved as values, so `{a: {}}` does not lose `a`.

### `unflatten(flat)`

Takes the output of `flatten` and returns the original object or array. Throws `FlattenError` on a
path that is malformed (`a[`, `a[x]`, a dangling `\`) or that contradicts another path
(`{'a[0]': 1, 'a.b': 2}` asks for an array and an object in the same place).

### `FlattenError`

Thrown for bad input and bad paths. `error.name` is `'FlattenError'`.

## Why iterative

Both operations use an explicit stack rather than recursion, so depth costs memory instead of call
frames. Deeply nested data is usually not hand-written — it comes from a parser, a tree, a linked
list turned into JSON — which is exactly when a stack overflow arrives as a crash in production
rather than as a failing test.

## Install

```sh
npm install exact-flatten
```

ESM and CommonJS, TypeScript types included, Node 18 or newer, no dependencies.

## License

MIT
