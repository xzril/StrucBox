import { conventionText, defaultConvention, type SignConvention } from '../lib/format';

export interface Settings extends SignConvention {
  defaultSystem: 'SI' | 'US';
}

export const defaultSettings: Settings = { ...defaultConvention, defaultSystem: 'SI' };

export function SettingsDialog({ settings, onChange, onClose }: { settings: Settings; onChange: (s: Settings) => void; onClose: () => void }) {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v });
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>
        <h3>Sign convention</h3>
        <label className="row">
          <span>Positive moment</span>
          <select value={settings.momentPositive} onChange={(e) => set('momentPositive', e.target.value as Settings['momentPositive'])}>
            <option value="ccw">↺ Counter-clockwise</option>
            <option value="cw">↻ Clockwise</option>
          </select>
        </label>
        <label className="row">
          <span>Positive force</span>
          <select value={settings.forcePositive} onChange={(e) => set('forcePositive', e.target.value as Settings['forcePositive'])}>
            <option value="up">↑ Upward</option>
            <option value="down">↓ Downward</option>
          </select>
        </label>
        <label className="row">
          <span>Shear and bending moment</span>
          <select value={settings.internal} onChange={(e) => set('internal', e.target.value as Settings['internal'])}>
            <option value="standard">Standard (sagging +, left-side-up shear +)</option>
            <option value="reversed">Reversed (hogging +)</option>
          </select>
        </label>
        <p className="muted">Now: {conventionText(settings)}.</p>
        <h3>Units</h3>
        <label className="row">
          <span>Default for new problems</span>
          <select value={settings.defaultSystem} onChange={(e) => set('defaultSystem', e.target.value as Settings['defaultSystem'])}>
            <option value="SI">SI (N, m)</option>
            <option value="US">US customary (lb, ft)</option>
          </select>
        </label>
        <p className="muted">A problem always keeps the units it was written in.</p>
        <div className="actions">
          <button className="primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
