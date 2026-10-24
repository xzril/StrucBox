// Local-only persistence (D10). Every access is guarded: storage can be unavailable.

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`strucbox.${key}`);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(`strucbox.${key}`, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}
