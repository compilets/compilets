/**
 * Remove duplicate elements in the array.
 */
export function uniqueArray<T>(a: T[], compare: (item1: T, item2: T) => boolean): T[] {
  return a.filter((x, pos) => a.findIndex((y) => compare(x, y)) == pos);
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
