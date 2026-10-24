# StrucBox prototype — build plan

## Stack (resolves D18)
| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript | One language everywhere. |
| App | React 18 + Vite | Runs in the browser on desktop now; wrap with Tauri (desktop) or Capacitor (phones) later with no rewrite. |
| 3D | Three.js via React Three Fiber + drei | Standard web 3D, works on phones. |
| Math display | KaTeX | Textbook-looking formulas. |
| OCR | Tesseract.js (in browser) | Free, on-device (D2, D17). |
| AI | Claude API, called from a small handler inside the Vite dev server | Keeps the API key off the page. Optional: app works without a key. |
| Storage | Browser localStorage | Settings and last problem only (D10). |
| Tests | Vitest | Solver checked against hand-worked answers. |

Run: `npm install`, then `npm run dev` (opens the browser). AI needs `ANTHROPIC_API_KEY` in a `.env` file; without it, OCR + template explanations still work.

## Folder layout
```
src/
  solver/        pure math, no UI
    types.ts       Problem, Support, Load, Units
    loads.ts       resultants and centroids (point, UDL, linear)
    poly.ts        polynomial helpers
    solve.ts       reactions (pin+roller, cantilever), exact piecewise V(x)/M(x), deflection by double integration
    validate.ts    supported vs "Coming soon!" (determinacy, types)
    *.test.ts
  lib/           units, formatting, sign convention, report.ts (worked steps with substituted values)
  input/         photo upload, OCR, text parsing, AI parse call
  components/    ConfirmForm, BeamView3D, Diagrams (SFD/BMD/deflection), ResultsPanel, Settings
server/          AI handler (parse problem → JSON, explain results)
```

## Solver approach
- Problem schema = JSON (beam length, supports with position/type, loads, what is asked, units, optional E and I).
- Reactions from ΣFy = 0 and ΣM = 0 (about the pin, or the fixed end).
- V and M built exactly per segment between breakpoints (supports, load points, load ends), so maxima and values match textbook formulas, not approximations.
- Deflection: integrate M twice per segment exactly; constants from support conditions. Without E and I, report coefficient / EI.
- Moment about any point (e.g. M_O) computed directly from loads, with optional reaction terms.
- Sign convention applied only at display time, so the solver has one internal convention.

## Test plan
- Worked example (600 N, 4 m span): R_O = 450 N, R_B = 150 N, M_O = 600 N·m CW; at x = 3 m, M_O = 1800 N·m.
- Standard cases vs closed-form: SS point at midspan (PL/4, PL³/48EI), SS UDL (wL²/8, 5wL⁴/384EI), cantilever point and UDL (PL³/3EI, wL⁴/8EI), triangular load, applied moment, overhang.
- Unsupported inputs return "Coming soon!" (two pins, fixed+roller, truss).
- Owner's test problems added as they arrive (D21).

## Build order
1. Solver + tests (works with no UI).
2. Confirm form (manual input), results panel with formulas, sign convention, show/hide solution.
3. 3D beam view: supports, load arrows, reactions, deflected shape with scale note.
4. Dragging and UDL resizing with live updates.
5. SFD/BMD/deflection diagrams with asked/unasked toggle.
6. Photo → OCR → AI parse → confirm form; "Coming soon!" path.
7. AI explanations (brief, formal) with offline template fallback.
8. README with simple run steps; PR.

## Open points for the owner
- AI needs an Anthropic API key (paid per use). Without it the app still solves everything; only problem reading from photos and written explanations are reduced.
