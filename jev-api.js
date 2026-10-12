// Chiamata a TypeSafe System One (Jev). Usata dal proxy del server e dal bench; la chiave resta in Node.
export const JEV_URL = 'https://api.typesafe.ai/v1/systemone';
export const JEV_MODEL = 'jev-latest';

export function createAsk({ key, fetchImpl = fetch, timeoutMs = 15000, retryMs = 1000 }) {
  async function once({ state, questions }) {
    const res = await fetchImpl(JEV_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: JEV_MODEL, state, questions }),
      signal: AbortSignal.timeout(timeoutMs)
    });
    const text = await res.text();
    return { status: res.status, ok: res.ok, text };
  }
  return async function ask(body) {
    let r = await once(body);
    // 429 e 529: TypeSafe chiede di riprovare dopo un attimo
    if (r.status === 429 || r.status === 529) {
      await new Promise(resolve => setTimeout(resolve, retryMs));
      r = await once(body);
    }
    if (!r.ok) throw new Error(`Jev ${r.status}: ${r.text.slice(0, 200)}`);
    return JSON.parse(r.text);
  };
}
