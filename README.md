# StrucBox

Turns a textbook beam problem into an interactive 3D model with the worked solution.

## Run it (Windows, macOS, Linux)

You need Node.js and Git (both already installed).

**Windows:** double-click `StrucBox.bat` in this folder. The first start installs everything (a minute or two); the app then opens in your browser at http://localhost:5173. Close the black window to stop it.

**Any system, from a terminal:** go to this folder first (`cd "D:\School stuff\StrucBox\github\StrucBox"` on this PC), then run `npm install` once and `npm run dev`. Press `Ctrl+C` to stop.

## Free and Premium

**Free (no key):** the full offline app. It solves every problem, reads photos with offline OCR, and writes template explanations.

**Premium (with an AI key):** adds AI tools. AI reads photos and drawings (much better on blurry or pixelated photos), writes an explanation for each problem and checks your answer key, and answers questions in an "Ask the tutor" box. The solver still computes every number. The top bar shows which plan is on.

1. Get a key from either service. Each use is paid or rate-limited by the provider.
   - Claude: https://console.anthropic.com
   - Gemini: https://aistudio.google.com/apikey
2. Double-click `SetApiKey.bat`, press 1 (Claude) or 2 (Gemini), paste the key, and press Enter. Running it again for the other service keeps both keys and switches to the one you just chose. (Other systems: copy `.env.example` to `.env` and fill it in.)
3. Close the StrucBox window and start `StrucBox.bat` again.

The key is saved in `.env` on your computer only. `.env` is never uploaded to GitHub, and the key is never sent to the page.

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
- `server/ai.ts`: the AI handler (Claude or Gemini), which runs inside the dev server.
