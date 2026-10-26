const toCamel = (k) => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
export function camel(x) {
  if (Array.isArray(x)) return x.map(camel);
  if (x && typeof x === 'object' && !(x instanceof Date)) {
    return Object.fromEntries(Object.entries(x).map(([k, v]) => [toCamel(k), v]));
  }
  return x;
}
