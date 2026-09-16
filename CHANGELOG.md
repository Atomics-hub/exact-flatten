# Changelog

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
