// Flatten and unflatten that round-trip exactly.
//
// Flattening turns a nested object into one level of `path -> value`. That is only useful if it can
// be undone, and the delimiter is what usually stops it: if a key may itself contain the delimiter,
// then `a.b` is ambiguous and one of the two values disappears. Keys with dots in them are not
// exotic — i18n message ids, hostnames, CSV headers, metric names.
//
// The path format exists to remove every such ambiguity:
//
//   `a.b`      two keys, `a` then `b`
//   `a\.b`     one key, `a.b`
//   `a[0]`     key `a` holding an array
//   `a.0`      key `a` holding an object whose key is `"0"`
//   `[0]`      the whole value was an array
//   `\0`       the empty key, so that `{'': [1]}` cannot be mistaken for an array at the root
//   `a[]`      the length of an array that ends in holes, which indices alone cannot express
//
// Nothing recurses, so depth is bounded by memory rather than by the call stack.

export class FlattenError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FlattenError';
  }
}

const isPlainObject = (value) => {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

// A value is a leaf when a path cannot describe what is inside it: primitives, Dates, Maps, class
// instances, objects with a null prototype, and plain objects carrying symbol keys — no string path
// can name a symbol or say "this one has no prototype". Keeping those whole is what lets the round
// trip stay exact instead of quietly dropping what it cannot express.
const isTraversable = (value) => {
  if (Array.isArray(value)) return true;
  if (value === null || typeof value !== 'object') return false;
  if (Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Object.getOwnPropertySymbols(value).length === 0;
};

function escapeKey(key) {
  // The empty key gets its own escape. Without it a path could begin with `[` — `{'': [1]}` would
  // flatten to `[0]` — and become indistinguishable from an array at the root. `\0` can only ever
  // mean this, because a literal backslash is always written as `\\`.
  if (key === '') return '\\0';
  let out = '';
  for (let i = 0; i < key.length; i++) {
    const ch = key[i];
    if (ch === '\\' || ch === '.' || ch === '[' || ch === ']') out += '\\';
    out += ch;
  }
  return out;
}

/**
 * Turn a nested value into one level of `path -> value`.
 *
 * @param {Record<string, unknown> | unknown[]} value
 * @returns {Record<string, unknown>}
 */
export function flatten(value) {
  if (!isTraversable(value)) {
    throw new FlattenError('flatten expects a plain object or an array');
  }

  const out = {};
  // Children are pushed in reverse so that popping walks them in document order; leaves travel on the
  // same stack rather than being written where they are found, or siblings would come out reversed.
  const stack = [[value, '', true]];

  while (stack.length > 0) {
    const entry = stack.pop();
    const source = entry[0];
    const prefix = entry[1];
    // Whether this is the value that was handed in, tracked rather than inferred from an empty
    // prefix: a root object whose key is `""` also has an empty prefix, and conflating the two lost
    // that key entirely.
    const atRoot = entry[2];

    if (!isTraversable(source)) {
      out[prefix] = source;
      continue;
    }

    if (Array.isArray(source)) {
      if (source.length === 0) {
        // An empty array at the root has no elements to write, so its length carries the shape.
        if (atRoot) out['[]'] = 0;
        else out[prefix] = [];
        continue;
      }
      // Indices describe the elements that exist. When the array ends in holes, nothing among them
      // records how long it was, so the length is written out too.
      if (!(source.length - 1 in source)) out[`${prefix}[]`] = source.length;
      for (let i = source.length - 1; i >= 0; i--) {
        if (!(i in source)) continue;
        stack.push([source[i], `${prefix}[${i}]`, false]);
      }
      continue;
    }

    const keys = Object.keys(source);
    if (keys.length === 0) {
      if (!atRoot) out[prefix] = {};
      continue;
    }
    for (let i = keys.length - 1; i >= 0; i--) {
      const key = keys[i];
      stack.push([source[key], atRoot ? escapeKey(key) : `${prefix}.${escapeKey(key)}`, false]);
    }
  }

  return out;
}

// Reads a path back into segments: {key}, {index}, or {length} for the array-length marker.
function parsePath(path) {
  const segments = [];
  let key = '';
  let i = 0;
  // `pending` means a key segment is open and must be emitted. A path beginning with `[` is an array
  // at the root: no key path can start that way, because an empty key is written as `\\0`.
  let pending = path[0] !== '[';

  while (i < path.length) {
    const ch = path[i];

    if (ch === '\\') {
      const next = path[i + 1];
      if (next === undefined) throw new FlattenError(`path ends with a dangling escape: ${path}`);
      // `\\0` is the empty key and contributes no characters.
      if (next !== '0') key += next;
      pending = true;
      i += 2;
      continue;
    }

    if (ch === '.') {
      segments.push({key});
      key = '';
      pending = true;
      i += 1;
      continue;
    }

    if (ch === '[') {
      const close = findClose(path, i);
      const digits = path.slice(i + 1, close);
      if (pending) segments.push({key});
      key = '';
      pending = false;
      if (digits === '') segments.push({length: true});
      else if (/^\d+$/.test(digits)) segments.push({index: Number(digits)});
      else throw new FlattenError(`not an array index in ${path}: [${digits}]`);
      i = close + 1;
      if (path[i] === '.') {
        i += 1;
        pending = true;
      }
      continue;
    }

    key += ch;
    pending = true;
    i += 1;
  }

  if (pending) segments.push({key});
  return segments;
}

function findClose(path, open) {
  for (let i = open + 1; i < path.length; i++) {
    if (path[i] === '\\') {
      i += 1;
      continue;
    }
    if (path[i] === ']') return i;
  }
  throw new FlattenError(`unclosed array index in ${path}`);
}

/**
 * Rebuild the nested value that `flatten` was given.
 *
 * @param {Record<string, unknown>} flat
 * @returns {Record<string, unknown> | unknown[]}
 */
export function unflatten(flat) {
  if (!isPlainObject(flat)) throw new FlattenError('unflatten expects a plain object');

  const paths = Object.keys(flat);
  if (paths.length === 0) return {};

  const parsed = paths.map((path) => ({path, segments: parsePath(path), value: flat[path]}));
  const first = parsed[0].segments[0];
  const root = first.index !== undefined || first.length === true ? [] : {};

  for (let p = 0; p < parsed.length; p++) {
    const path = parsed[p].path;
    const segments = parsed[p].segments;
    const value = parsed[p].value;
    let cursor = root;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];

      if (segment.length === true) {
        if (i !== segments.length - 1) throw new FlattenError(`the length marker must end a path: ${path}`);
        if (!Array.isArray(cursor)) throw new FlattenError(`a length marker needs an array: ${path}`);
        if (typeof value !== 'number') throw new FlattenError(`a length marker needs a number: ${path}`);
        cursor.length = value;
        continue;
      }

      const key = segment.index !== undefined ? segment.index : segment.key;

      if (i === segments.length - 1) {
        cursor[key] = value;
        continue;
      }

      const next = segments[i + 1];
      const nextIsIndex = next.index !== undefined || next.length === true;
      const existing = cursor[key];
      if (existing === undefined || typeof existing !== 'object' || existing === null) {
        cursor[key] = nextIsIndex ? [] : {};
      } else if (Array.isArray(existing) !== nextIsIndex) {
        throw new FlattenError(
          `path ${path} needs ${nextIsIndex ? 'an array' : 'an object'} where the data already holds ${Array.isArray(existing) ? 'an array' : 'an object'}`,
        );
      }
      cursor = cursor[key];
    }
  }

  return root;
}
