# StrucBox

Turns a textbook beam problem into an interactive 3D model with the worked solution.

## Run it (Windows, macOS, Linux)

You need Node.js and Git (both already installed).

**Windows:** double-click `StrucBox.bat` in this folder. The first start installs everything (a minute or two); the app then opens in your browser at http://localhost:5173. Close the black window to stop it.

**Any system, from a terminal:** go to this folder first (`cd "D:\School stuff\StrucBox\github\StrucBox"` on this PC), then run `npm install` once and `npm run dev`. Press `Ctrl+C` to stop.

## Optional: AI reading and explanations

Without a key, the app still solves everything. It reads photos offline and writes template explanations. With a key, AI reads photos and diagrams better and writes an explanation for each problem.

1. Get an API key at https://console.anthropic.com. Each use is paid.
2. Copy `.env.example` to a new file named `.env`.
3. Paste the key after `ANTHROPIC_API_KEY=`, then restart `npm run dev`.

The key stays on your computer and is never sent to the page.

## Using it

1. **Problem:** upload or paste a photo, type the word problem, or both. Then press "Read problem". You can also start from the worked example or enter a beam by hand.
2. **Confirm values:** check every support, load, and dimension, and tick what the problem asks for.
3. **Model:** drag loads along the beam (drag the blue dots to resize a distributed load). Press "Show solution" for the answers, steps, diagrams, and explanation.

The sign convention and default units are under ⚙ Settings.

## Tests

`npm test` checks the solver against the PRD worked example and textbook formulas.

## Layout

- `src/solver/`: the math (reactions, shear, moment, deflection). It has no UI code.
- `src/lib/`: units, formatting, sign convention, and the worked steps.
- `src/input/`: OCR and problem reading.
- `src/components/`: the screens, the 3D view, and the diagrams.
- `server/ai.ts`: the AI handler, which runs inside the dev server.
