import {flatten, unflatten} from 'exact-flatten';
const flat: Record<string, unknown> = flatten({a: 1});
const back = unflatten(flat);
void [flat, back];
