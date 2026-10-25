export type Provider = 'anthropic' | 'gemini';
/** Premium = an API key is set in .env; free = offline only. */
export interface Plan {
  premium: boolean;
  provider: Provider | null;
}
export const providerName = (p: Provider | null) => (p === 'gemini' ? 'Gemini' : 'Claude');

/** The online web build is the free offline app only; AI runs only on the local dev server (StrucBox.bat). */
export const WEB_BUILD = import.meta.env.PROD;

export async function aiStatus(): Promise<Plan> {
  if (WEB_BUILD) return { premium: false, provider: null };
  try {
    const r = await fetch('/api/status');
    const j = r.ok ? await r.json() : {};
    return { premium: j.ai === true, provider: j.provider ?? null };
  } catch {
    return { premium: false, provider: null };
  }
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.error ?? `Request failed (${r.status})`);
  return json as T;
}
