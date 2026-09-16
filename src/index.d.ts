export declare class FlattenError extends Error {
  readonly name: 'FlattenError';
}

/**
 * Turn a nested value into one level of `path -> value`.
 *
 * Paths escape `.`, `[`, `]` and `\` inside keys, write array indices as `[0]`, and write the empty
 * key as `\0`, so that `unflatten` can rebuild exactly what went in.
 */
export declare function flatten(value: Record<string, unknown> | readonly unknown[]): Record<string, unknown>;

/** Rebuild the nested value that `flatten` was given. */
export declare function unflatten(flat: Record<string, unknown>): Record<string, unknown> | unknown[];
