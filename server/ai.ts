// AI handler served by the Vite dev server at /api/*. AI only reads problems and
// writes explanations; it never computes answers (D24). The API key stays here,
// on the user's machine, never in the page.

import Anthropic from '@anthropic-ai/sdk';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

const MODEL = 'claude-opus-5-5';

const PROBLEM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['structure', 'unsupportedReason', 'title', 'units', 'length', 'supports', 'loads', 'points', 'asked', 'stiffness'],
  properties: {
    structure: { type: 'string', enum: ['beam', 'truss', 'frame', 'arch', 'cable', 'incline_or_friction', 'other'] },
    unsupportedReason: { type: 'string', description: 'Empty if this is a beam problem.' },
    title: { type: 'string' },
    units: {
      type: 'object',
      additionalProperties: false,
      required: ['system', 'force', 'length'],
      properties: {
        system: { type: 'string', enum: ['SI', 'US'] },
        force: { type: 'string', enum: ['N', 'kN', 'lb', 'kip'] },
        length: { type: 'string', enum: ['m', 'mm', 'ft', 'in'] },
      },
    },
    length: { type: 'number' },
    supports: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'x', 'y', 'angle', 'label'],
        properties: {
          type: { type: 'string', enum: ['pin', 'roller', 'fixed', 'free'] },
          x: { type: 'number' },
          y: { type: 'number', description: 'height above the beam axis when the support sits on a rigid arm (L-shaped member); 0 otherwise' },
          angle: { type: 'number', description: 'roller only: direction of its reaction in degrees counter-clockwise from +x: 90 for an ordinary roller; tilted for a rocker, a roller on an incline (normal to the surface), or a cable/link/strut (along it, toward where the cable is anchored); 90 when unused' },
          label: { type: 'string' },
        },
      },
    },
    loads: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'x', 'P', 'dirX', 'dirY', 'y', 'x1', 'x2', 'w1', 'w2', 'poly', 'x0', 'M', 'dir', 'label'],
        properties: {
          kind: { type: 'string', enum: ['point', 'dist', 'moment'] },
          x: { type: 'number', description: 'point or moment position; 0 for dist' },
          P: { type: 'number', description: 'point load magnitude as printed (positive); 0 otherwise' },
          dirX: { type: 'number', description: 'point load direction, horizontal part (right positive): the slope triangle leg or cos of the angle; 0 for a vertical load' },
          dirY: { type: 'number', description: 'point load direction, vertical part (up positive): the slope triangle leg or sin of the angle; -1 for a plain downward load' },
          y: { type: 'number', description: 'height of the point load above the beam axis (bracket or arm); 0 otherwise' },
          x1: { type: 'number' },
          x2: { type: 'number' },
          w1: { type: 'number', description: 'intensity at x1, positive downward' },
          w2: { type: 'number', description: 'intensity at x2 (equal to w1 for a UDL)' },
          poly: { type: 'array', items: { type: 'number' }, description: 'curved load given by a formula only: coefficients [c0, c1, c2, ...] of w = c0 + c1 x + c2 x² + ... (downward positive), x measured from x0; [] for uniform or linear loads' },
          x0: { type: 'number', description: "where the formula's x = 0 lies, in beam x; 0 otherwise" },
          M: { type: 'number', description: 'applied moment magnitude' },
          dir: { type: 'string', enum: ['cw', 'ccw'] },
          label: { type: 'string' },
        },
      },
    },
    points: {
      type: 'array',
      description: 'Named points that are not supports (e.g. a point C where a value is asked).',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'x', 'y'],
        properties: { label: { type: 'string' }, x: { type: 'number' }, y: { type: 'number', description: 'height above the beam axis; 0 if on it' } },
      },
    },
    asked: {
      type: 'object',
      additionalProperties: false,
      required: ['reactions', 'resultant', 'momentAbout', 'internalAt', 'shear', 'moment', 'maxValues', 'deflection'],
      properties: {
        reactions: { type: 'boolean' },
        resultant: { type: 'boolean', description: 'the equivalent resultant force of the loads and its location asked ("replace the loading by an equivalent resultant force and specify its location")' },
        momentAbout: { type: 'array', items: { type: 'string' }, description: 'labels of points the moment of the loads is asked about ("moment of the forces about O")' },
        internalAt: { type: 'array', items: { type: 'string' }, description: 'labels of points where the internal shear and bending moment are asked ("internal shear and moment at C"); add the point to points if it is not a support' },
        shear: { type: 'boolean', description: 'shear force diagram asked' },
        moment: { type: 'boolean', description: 'bending moment diagram asked' },
        maxValues: { type: 'boolean' },
        deflection: { type: 'boolean' },
      },
    },
    stiffness: {
      type: 'object',
      additionalProperties: false,
      required: ['given', 'E', 'Eunit', 'I', 'Iunit'],
      properties: {
        given: { type: 'boolean' },
        E: { type: 'number' },
        Eunit: { type: 'string', enum: ['GPa', 'MPa', 'Pa', 'ksi', 'psi'] },
        I: { type: 'number' },
        Iunit: { type: 'string', enum: ['mm4', 'cm4', 'm4', 'in4', '1e6mm4'] },
      },
    },
  },
} as const;

const PARSE_SYSTEM = `You read textbook statics problems and convert them to a JSON description of a beam. Do not solve the problem.
Rules:
- x is measured from the beam's left end in the problem's length unit. Use the problem's own units (SI or US customary).
- Supports: pin, roller, fixed, or free (free end). A cable, link, strut, rocker or smooth inclined surface holding the beam at one point is a "roller" whose angle is the direction of its force. Label supports and points with the letters used in the problem (e.g. O, A, B).
- Coordinates: x along the beam from its left end, y up from the beam axis. An L-shaped member is the beam plus a rigid arm: give the support (or point) at the arm's end its y.
- Loads: "point" (P is the printed magnitude; dirX, dirY give the direction it points, copied from the slope triangle or angle without resolving: 500 N up and to the right on a 3-4-5 triangle with the 4 horizontal is dirX = 4, dirY = 3; a downward load is dirX = 0, dirY = -1), "dist" for uniform or linearly varying (triangular) loads (w1 at x1, w2 at x2), "moment" for an applied couple with its direction.
- Unused numeric fields are 0. Use dir "cw" when unused.
- "asked" lists only what the problem asks for.
- If the problem is not a beam (truss, frame, incline with friction, etc.), set structure accordingly and explain briefly in unsupportedReason.
- The OCR text may contain errors; the photo, if present, is the better source for the diagram.`;

const EXPLAIN_SYSTEM = `You write the explanation panel of a statics teaching app for engineering students.
Style: textbook-formal, direct, brief. At most 120 words. Plain text, no markdown headings, no bullet lists.
Explain the governing principle and why the results come out as they do, referring to the given numbers.
All numbers are computed by the app's solver and are correct. Never compute or state new numerical results; use only the numbers given.
If an answer key is supplied, add one final sentence that says whether the solver's results agree with it; if they differ, say which value differs.`;

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export type Provider = 'anthropic' | 'gemini';
interface Ask {
  system: string;
  text: string;
  image?: { data: string; mediaType: string };
  schema?: object;
  effort: 'low' | 'medium';
  maxTokens: number;
}

class KeyRejected extends Error {}

async function askClaude(client: Anthropic, q: Ask): Promise<string> {
  const content: any[] = [];
  if (q.image) content.push({ type: 'image', source: { type: 'base64', media_type: q.image.mediaType, data: q.image.data } });
  content.push({ type: 'text', text: q.text });
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: q.maxTokens,
      system: q.system,
      messages: [{ role: 'user', content }],
      output_config: { effort: q.effort, ...(q.schema ? { format: { type: 'json_schema', schema: q.schema } } : {}) },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    } as any);
    if (response.stop_reason === 'refusal') throw new Error('The AI declined this request.');
    return response.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('');
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new KeyRejected();
    if (e instanceof Anthropic.APIConnectionError) throw new Error('No internet connection to the AI service.');
    throw e;
  }
}

// Gemini through its REST API: a few lines of fetch, so no extra SDK.
async function askGemini(key: string, model: string, q: Ask): Promise<string> {
  const parts: any[] = [];
  if (q.image) parts.push({ inlineData: { mimeType: q.image.mediaType, data: q.image.data } });
  // shortcut: the schema goes in the prompt with JSON mode on; switch to responseJsonSchema once its support is confirmed for the chosen model
  parts.push({ text: q.schema ? `${q.text}\n\nReply with JSON only, matching this JSON Schema:\n${JSON.stringify(q.schema)}` : q.text });
  let r: Response;
  try {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: q.system }] },
        contents: [{ role: 'user', parts }],
        generationConfig: { maxOutputTokens: q.maxTokens, ...(q.schema ? { responseMimeType: 'application/json' } : {}) },
      }),
    });
  } catch {
    throw new Error('No internet connection to the AI service.');
  }
  const json: any = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg: string = json?.error?.message ?? `Gemini error ${r.status}`;
    if (r.status === 401 || r.status === 403 || /api key/i.test(msg)) throw new KeyRejected();
    throw new Error(msg);
  }
  const text = (json.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('');
  if (!text) throw new Error('The AI returned no answer.');
  return text;
}

/** Picks the provider from .env: AI_PROVIDER if its key is set, otherwise whichever key exists. */
export function pickProvider(env: Record<string, string | undefined>): Provider | null {
  const has = { anthropic: !!env.ANTHROPIC_API_KEY, gemini: !!env.GEMINI_API_KEY };
  const wanted = env.AI_PROVIDER as Provider | undefined;
  if (wanted && has[wanted]) return wanted;
  return has.anthropic ? 'anthropic' : has.gemini ? 'gemini' : null;
}

const TUTOR_SYSTEM = `You are the tutor panel of a statics teaching app for engineering students.
Answer the student's question about the given beam problem: textbook-formal, direct, at most 120 words, plain text.
All numbers come from the app's solver and are correct. Never compute or state new numerical results; refer only to the given numbers and to the solution steps by name.
If the question needs a number that is not given, say which step or diagram of the solution shows it.`;

export function aiPlugin(env: Record<string, string | undefined>): Plugin {
  const provider = pickProvider(env);
  const client = provider === 'anthropic' ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) : null;
  const ask = (q: Ask) =>
    provider === 'anthropic' ? askClaude(client!, q) : askGemini(env.GEMINI_API_KEY!, env.GEMINI_MODEL || 'gemini-3.8-flash', q);

  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = req.url ?? '';
    if (!url.startsWith('/api/')) return next();
    try {
      if (url === '/api/status') return send(res, 200, { ai: !!provider, provider });
      if (!provider) return send(res, 503, { error: 'Premium AI tools need an API key. Run SetApiKey.bat, then restart StrucBox.' });
      const body = await readBody(req);

      if (url === '/api/parse') {
        const text = await ask({
          system: PARSE_SYSTEM,
          text: `OCR text from the photo:\n${body.ocrText || '(none)'}\n\nWord problem typed by the student:\n${body.wordText || '(none)'}`,
          image: body.image?.data ? body.image : undefined,
          schema: PROBLEM_SCHEMA,
          effort: 'medium',
          maxTokens: 16000,
        });
        return send(res, 200, JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')));
      }

      if (url === '/api/explain' || url === '/api/ask') {
        const text = await ask({
          system: url === '/api/ask' ? TUTOR_SYSTEM : EXPLAIN_SYSTEM,
          text: JSON.stringify(body),
          effort: 'low',
          maxTokens: 4000,
        });
        return send(res, 200, { text: text.trim() });
      }
      return send(res, 404, { error: 'Unknown endpoint' });
    } catch (e: any) {
      if (e instanceof KeyRejected)
        return send(res, 401, { error: 'Your API key was rejected. Run SetApiKey.bat again with a valid key, then restart StrucBox.' });
      return send(res, 500, { error: e?.error?.error?.message ?? e?.message ?? String(e) });
    }
  };
  return {
    name: 'strucbox-ai',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}
