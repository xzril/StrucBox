# StrucBox

App for engineering students (priority) and teachers that turns a textbook structural problem into an interactive 3D model with formulas and explanations. Full PRD (v1.2, decisions D1–D29) lives in the owner's Obsidian vault; this file is the working summary. Build plan: `PLAN.md`.

## Prototype scope
- Desktop, local-only, no accounts (D3, D10).
- **Beams only, statically determinate** (D8, D26): simply supported, overhang (pin + roller anywhere), cantilever (fixed + free end).
- Supports: pin, roller, fixed, free end (D23). Loads: point, UDL, triangular (linear), applied moment.
- Anything else (trusses, frames, indeterminate beams, other supports) shows **"Coming soon!"** (D29).

## Core flow
1. Photo of the problem → OCR (D2) + optional word-problem text.
2. AI turns OCR text into a beam JSON; **user confirms/edits every value before the model is built** (D7).
3. 3D beam render. 2D problems keep forces in the beam's plane (D9).
4. Results, formulas with substituted values, short explanation.

## Hard rules
- **The built-in solver computes every number** (reactions, V, M, deflection, moments about points). AI only reads the problem and writes explanations (D24). Never let AI produce answers.
- AI explanations: textbook-formal, direct, brief (D28). Need internet; app must still work offline without them (D17), using template text.
- Results must match the owner's answer keys; if a key is wrong, show a derivation that justifies ours (D15, D21).
- Units follow the problem: SI or US customary (D16).
- User-set sign convention for moments and forces (D19).
- Show/hide solution toggle so students can try first (D6).
- Diagrams/forces not asked for are hidden by default, with a toggle (D13).
- Deflection drawn to true scale; if too small, exaggerate and label "not to scale, exaggerated for visualization" (D14). If E and I are not given, show results divided by EI, e.g. `12345 kN·m³ / EI` (D25).
- Point loads, UDLs, and moments are draggable; UDLs resizable; everything updates live without lag (D27).

## Worked example (must pass)
Simply supported, pin at O (x=0), roller at x=4 m, 600 N down at x=1 m. M_O = 600 N·m clockwise; R_O = 450 N, R_B = 150 N. Load at x=3 m → M_O = 1800 N·m.

## Later (not now)
Indeterminate beams, more supports, trusses/frames/arches/cables, sandbox free-tier limits (D5, D22), accounts, teacher mode, mobile (Capacitor), freemium + school licences (D11).

## Owner
Xzril, non-developer. Keep run instructions to `npm install` then `npm run dev`. Node.js and Git are installed on their Windows PC.
