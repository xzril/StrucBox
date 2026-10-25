import { useEffect, useRef, useState } from 'react';
import { postJson, WEB_BUILD } from '../input/api';
import { applyDrawing, readDrawing, type DrawingRead } from '../input/drawing';
import { fileToBase64, imagePixels, runOcr } from '../input/ocr';
import { blankProblem, fromAi, localParse, workedExample, type ParseResult } from '../input/parse';
import { defaultUnits } from '../lib/units';

interface Props {
  premium: boolean;
  hasLast: boolean;
  defaultSystem: 'SI' | 'US';
  onLast: () => void;
  onParsed: (r: ParseResult) => void;
}

export function InputScreen({ premium: ai, hasLast, defaultSystem, onLast, onParsed }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState('');
  const [drawing, setDrawing] = useState<DrawingRead | null>(null);
  const [ocrProgress, setOcrProgress] = useState<number | null>(null);
  const [wordText, setWordText] = useState('');
  const [answerKey, setAnswerKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
      if (f) pick(f);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  async function pick(f: File) {
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setError(null);
    setOcrProgress(0);
    setDrawing(null);
    // shortcut: runs on the main thread (about a second for a phone photo); move to a worker if it ever stutters
    imagePixels(f)
      .then((px) => setDrawing(readDrawing(px)))
      .catch(() => setDrawing(null));
    try {
      setOcrText((await runOcr(f, setOcrProgress)).trim());
    } catch (e: any) {
      setError(`OCR failed: ${e?.message ?? e}. You can still type the problem below.`);
    } finally {
      setOcrProgress(null);
    }
  }

  async function read() {
    setBusy(true);
    setError(null);
    const text = [wordText, ocrText].filter(Boolean).join('\n\n');
    try {
      let r: ParseResult;
      if (ai) {
        const image = file ? await fileToBase64(file) : undefined;
        r = fromAi(await postJson('/api/parse', { ocrText, wordText, image }), text);
      } else r = offline(text);
      if (r.ok) r.problem.answerKey = answerKey || undefined;
      onParsed(r);
    } catch (e: any) {
      setError(`Could not read the problem with AI (${e?.message ?? e}). Reading it offline instead.`);
      const ocr = ocrText || (file ? (await runOcr(file).catch(() => '')).trim() : '');
      const r = offline([wordText, ocr].filter(Boolean).join('\n\n'));
      if (r.ok) r.problem.answerKey = answerKey || undefined;
      setTimeout(() => onParsed(r), 1200);
    } finally {
      setBusy(false);
    }
  }

  /** Offline reading: words from the text, geometry (lengths, load positions, arrow directions) from the drawing. */
  const offline = (text: string): ParseResult => {
    const r = localParse(text);
    return r.ok && drawing ? { ok: true, problem: applyDrawing(r.problem, drawing) } : r;
  };

  const manual = () => {
    const p = blankProblem();
    p.units = defaultUnits(defaultSystem);
    if (defaultSystem === 'US') {
      p.length = 20;
      p.supports[1].x = 20;
      p.loads = [{ ...p.loads[0], x: 10 } as typeof p.loads[0]];
    }
    onParsed({ ok: true, problem: p });
  };

  const hasText = !!(ocrText.trim() || wordText.trim() || (ai && file) || drawing?.loads.length);

  return (
    <div className="input-screen">
      <section className="card">
        <h2>Photograph or upload the problem</h2>
        <div
          className={`drop ${preview ? 'has' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) pick(f);
          }}
        >
          {preview ? <img src={preview} alt="Problem" /> : <p>Click or tap to take or choose a photo, drop it here, or paste it (Ctrl+V).</p>}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])}
          />
        </div>
        {ocrProgress !== null && (
          <div className="progress">
            <div style={{ width: `${Math.round(ocrProgress * 100)}%` }} /> <span>Reading text… {Math.round(ocrProgress * 100)}%</span>
          </div>
        )}
        {(ocrText || file) && (
          <label className="field">
            <span>Text read from the photo (fix any mistakes)</span>
            <textarea rows={4} value={ocrText} onChange={(e) => setOcrText(e.target.value)} />
          </label>
        )}
        <label className="field">
          <span>Word problem (optional, adds context)</span>
          <textarea
            rows={3}
            value={wordText}
            placeholder="e.g. A 4 m simply supported beam, pin at O, roller at B, carries 600 N at 1 m from O. Find the moment about O."
            onChange={(e) => setWordText(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Answer key (optional, used to check the result)</span>
          <input value={answerKey} placeholder="e.g. M_O = 600 N·m" onChange={(e) => setAnswerKey(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button className="primary" disabled={!hasText || busy || (!ai && ocrProgress !== null)} onClick={read}>
            {busy ? 'Reading…' : 'Read problem'}
          </button>
          <span className="muted small">{ai
              ? 'Premium: AI reads the photo and the text.'
              : `Free: offline reading of the text and the drawing. Premium AI reading understands blurry photos and drawings${WEB_BUILD ? '.' : ' (run SetApiKey.bat).'}`}</span>
        </div>
      </section>

      <section className="card side">
        <h2>Or start without a photo</h2>
        <button onClick={() => onParsed({ ok: true, problem: workedExample() })}>Worked example: moment about O</button>
        <button onClick={manual}>Enter a beam by hand</button>
        {hasLast && <button onClick={onLast}>Continue last problem</button>}
        <p className="muted small">
          The prototype solves determinate beams (simply supported, overhanging, cantilever) with point loads, uniform and triangular loads, and
          applied moments.
        </p>
      </section>
    </div>
  );
}
