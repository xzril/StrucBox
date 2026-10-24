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
        required: ['type', 'x', 'label'],
        properties: {
          type: { type: 'string', enum: ['pin', 'roller', 'fixed', 'free'] },
          x: { type: 'number' },
          label: { type: 'string' },
        },
      },
    },
    loads: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'x', 'P', 'x1', 'x2', 'w1', 'w2', 'M', 'dir', 'label'],
        properties: {
          kind: { type: 'string', enum: ['point', 'dist', 'moment'] },
          x: { type: 'number', description: 'point or moment position; 0 for dist' },
          P: { type: 'number', description: 'point load magnitude, positive downward; 0 otherwise' },
          x1: { type: 'number' },
          x2: { type: 'number' },
          w1: { type: 'number', description: 'intensity at x1, positive downward' },
          w2: { type: 'number', description: 'intensity at x2 (equal to w1 for a UDL)' },
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
        required: ['label', 'x'],
        properties: { label: { type: 'string' }, x: { type: 'number' } },
      },
    },
    asked: {
      type: 'object',
      additionalProperties: false,
      required: ['reactions', 'momentAbout', 'shear', 'moment', 'maxValues', 'deflection'],
      properties: {
        reactions: { type: 'boolean' },
        momentAbout: { type: 'array', items: { type: 'string' }, description: 'labels of points a moment is asked about' },
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
- Supports: pin, roller, fixed, or free (free end). Label supports and points with the letters used in the problem (e.g. O, A, B).
- Loads: "point" (P > 0 downward), "dist" for uniform or linearly varying (triangular) loads (w1 at x1, w2 at x2), "moment" for an applied couple with its direction.
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

async function ask(client: Anthropic, params: { system: string; content: any[]; effort: 'low' | 'medium'; schema?: object; maxTokens: number }) {
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: params.maxTokens,
    system: params.system,
    messages: [{ role: 'user', content: params.content }],
    output_config: { effort: params.effort, ...(params.schema ? { format: { type: 'json_schema', schema: params.schema } } : {}) },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
  } as any);
  if (response.stop_reason === 'refusal') throw new Error('The AI declined this request.');
  return response.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('');
}

export function aiPlugin(apiKey: string | undefined): Plugin {
  const client = apiKey ? new Anthropic({ apiKey }) : null;

  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = req.url ?? '';
    if (!url.startsWith('/api/')) return next();
    try {
      if (url === '/api/status') return send(res, 200, { ai: !!client });
      if (!client) return send(res, 503, { error: 'No ANTHROPIC_API_KEY set in .env' });
      const body = await readBody(req);

      if (url === '/api/parse') {
        const content: any[] = [];
        if (body.image?.data)
          content.push({ type: 'image', source: { type: 'base64', media_type: body.image.mediaType, data: body.image.data } });
        content.push({
          type: 'text',
          text: `OCR text from the photo:\n${body.ocrText || '(none)'}\n\nWord problem typed by the student:\n${body.wordText || '(none)'}`,
        });
        const text = await ask(client, { system: PARSE_SYSTEM, content, effort: 'medium', schema: PROBLEM_SCHEMA, maxTokens: 16000 });
        return send(res, 200, JSON.parse(text));
      }

      if (url === '/api/explain') {
        const text = await ask(client, {
          system: EXPLAIN_SYSTEM,
          content: [{ type: 'text', text: JSON.stringify(body) }],
          effort: 'low',
          maxTokens: 4000,
        });
        return send(res, 200, { text: text.trim() });
      }
      return send(res, 404, { error: 'Unknown endpoint' });
    } catch (e: any) {
      return send(res, 500, { error: e?.message ?? String(e) });
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
