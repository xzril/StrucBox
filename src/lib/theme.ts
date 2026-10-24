// Two-tone theme: blueprint navy (structure, reactions) + safety amber (loads, actions).
// Blue/orange stays distinct for red-green colour-blind students. Keep in sync with styles.css.
import { useEffect, useState } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';

const LIGHT = {
  dark: false,
  bg: '#f3f5f9',
  grid: ['#c9d2e0', '#e2e7ef'],
  beam: '#9aa9bf',
  support: '#4a5568',
  load: '#e8890c',
  reaction: '#1d4e89',
  moment: '#b45309',
  handle: '#1d4e89',
  shear: '#1d4e89',
  bending: '#e8890c',
  deflection: '#5a6478',
};
const DARK: typeof LIGHT = {
  dark: true,
  bg: '#0f1a2e',
  grid: ['#2b3a5a', '#1b2742'],
  beam: '#7d8fae',
  support: '#a3b1c9',
  load: '#ffb020',
  reaction: '#6fa8ff',
  moment: '#ffd27a',
  handle: '#6fa8ff',
  shear: '#6fa8ff',
  bending: '#ffb020',
  deflection: '#9aa7bd',
};
export type Palette = typeof LIGHT;

/** Resolves the preference, follows the OS when 'system', and sets data-theme for the CSS. */
export function usePalette(pref: ThemePref): Palette {
  const [osDark, setOsDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const on = (e: MediaQueryListEvent) => setOsDark(e.matches);
    media.addEventListener('change', on);
    return () => media.removeEventListener('change', on);
  }, []);
  const dark = pref === 'dark' || (pref === 'system' && osDark);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);
  return dark ? DARK : LIGHT;
}
