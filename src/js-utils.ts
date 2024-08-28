/**
 * Remove duplicate elements in the array.
 */
export function uniqueArray<T>(a: T[], compare?: (item1: T, item2: T) => boolean): T[] {
  if (compare)
    return a.filter((x, pos) => a.findIndex((y) => compare(x, y)) == pos);
  else
    return a.filter((x, pos) => a.indexOf(x) == pos);
}

/**
 * Like [].map().join() but accept a callback specifying the joiner.
 */
export function joinArray<T>(a: T[],
                             separator: (item1: T, item2: T) => string,
                             toString: (item: T) => string): string {
  if (a.length == 0)
    return '';
  if (a.length == 1)
    return toString(a[0]);
  let result = '';
  for (let i = 0; i < a.length - 1; i++)
    result += toString(a[i]) + separator(a[i], a[i + 1]);
  return result + toString(a[a.length - 1]);
}

/**
 * Create a new map from array with a transformer returning key and value.
 */
export function createMapFromArray<K, V, A>(source: A[], transform: (element: A) => [ K, V ]): Map<K, V> {
  return new Map<K, V>(source.map(transform));
}

/**
 * Clone a map with a transformer for values.
 */
export function cloneMap<K, V>(source: Map<K, V>, transform?: (value: V) => V) {
  let entries = Array.from(source.entries());
  if (transform)
    entries = entries.map(([ key, value ]) => [ key, transform(value) ]);
  return new Map<K, V>(entries);
}
