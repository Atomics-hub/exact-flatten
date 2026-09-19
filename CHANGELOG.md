# Changelog

## 0.1.1

README corrections, so that every claim is one that holds:

- Both `flat` behaviours are linked to their prior reports: escaping the delimiter requested in 2018
  (#79), numeric keys becoming arrays reported with the same example in 2020 (#103). Both are open.
- The description of `flat`'s `{object: true}` says what it does: it keeps numeric keys as objects at
  the cost of every real array, and does not touch the delimiter problem.
- Download counts refreshed. No code change.

## 0.1.0

First release.

- `flatten(value)` — a nested object or array becomes one level of `path -> value`.
- `unflatten(flat)` — returns exactly what `flatten` was given.
- Paths escape `.`, `[`, `]` and `\` inside keys, write the empty key as `\0`, and record the length
  of arrays ending in holes, so no key can be confused with structure.
- Arrays and objects with numeric keys stay distinct; sparse arrays, `undefined` values, empty
  objects and empty arrays survive the round trip.
- Values a path cannot describe — `Date`, `Map`, class instances, null-prototype objects, objects
  with symbol keys — are kept whole as leaves.
- `FlattenError` on malformed or contradictory paths rather than a guess.
- Iterative: depth is bounded by memory, not by the call stack.
- Zero dependencies. Node 18 or newer.
