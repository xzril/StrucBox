export async function aiAvailable(): Promise<boolean> {
  try {
    const r = await fetch('/api/status');
    return r.ok && (await r.json()).ai === true;
  } catch {
    return false;
  }
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.error ?? `Request failed (${r.status})`);
  return json as T;
}
