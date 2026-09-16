import {flatten, unflatten, FlattenError} from 'exact-flatten';

const flat: Record<string, unknown> = flatten({a: {b: 1}});
const back: Record<string, unknown> | unknown[] = unflatten(flat);
const fromArray: Record<string, unknown> = flatten([1, 2, 3]);
const error: FlattenError = new FlattenError('x');
const name: 'FlattenError' = error.name;
void [flat, back, fromArray, name];
