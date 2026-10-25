import { useEffect, useState } from 'react';
import { ComingSoon } from './components/ComingSoon';
import { ConfirmForm } from './components/ConfirmForm';
import { InputScreen } from './components/InputScreen';
import { ModelScreen } from './components/ModelScreen';
import { SettingsDialog, type Settings, defaultSettings } from './components/SettingsDialog';
import { aiStatus, providerName, WEB_BUILD, type Plan } from './input/api';
import { load, save } from './lib/storage';
import { usePalette } from './lib/theme';
import type { Problem } from './solver/types';

type Stage = { name: 'input' } | { name: 'confirm' } | { name: 'model' } | { name: 'soon'; reason: string };

export default function App() {
  const [stage, setStage] = useState<Stage>({ name: 'input' });
  const [problem, setProblem] = useState<Problem | null>(() => load<{ p: Problem | null }>('last', { p: null }).p);
  const [settings, setSettings] = useState<Settings>(() => load('settings', defaultSettings));
  const [showSettings, setShowSettings] = useState(false);
  const [plan, setPlan] = useState<Plan>({ premium: false, provider: null });
  useEffect(() => {
    aiStatus().then(setPlan);
  }, []);
  const C = usePalette(settings.theme);
  const dark = C.dark;

  const updateProblem = (p: Problem) => {
    setProblem(p);
    save('last', { p });
  };
  const updateSettings = (s: Settings) => {
    setSettings(s);
    save('settings', s);
  };

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => setStage({ name: 'input' })} title="New problem">
          <span className="logo">▣</span> StrucBox
        </button>
        <nav className="steps">
          <span className={stage.name === 'input' ? 'on' : ''}>1 Problem</span>
          <span className={stage.name === 'confirm' ? 'on' : ''}>2 Confirm values</span>
          <span className={stage.name === 'model' ? 'on' : ''}>3 Model</span>
        </nav>
        <span
          className={`plan ${plan.premium ? 'premium' : ''}`}
          title={plan.premium ? 'AI tools are on (API key found).' : WEB_BUILD ? 'Online test version: free offline app only.' : 'Offline version. Run SetApiKey.bat to unlock the AI tools.'}
        >
          {plan.premium ? `PREMIUM · AI (${providerName(plan.provider)})` : 'FREE · offline'}
        </span>
        <button
          className="ghost theme-toggle"
          title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={() => updateSettings({ ...settings, theme: dark ? 'light' : 'dark' })}
        >
          {dark ? '☀' : '☾'}
        </button>
        <button className="ghost" aria-label="Settings" onClick={() => setShowSettings(true)}>
          ⚙ <span className="hide-sm">Settings</span>
        </button>
      </header>

      <main>
        {stage.name === 'input' && (
          <InputScreen
            premium={plan.premium}
            hasLast={!!problem}
            defaultSystem={settings.defaultSystem}
            onLast={() => setStage({ name: 'confirm' })}
            onParsed={(r) => {
              if (r.ok) {
                updateProblem(r.problem);
                setStage({ name: 'confirm' });
              } else setStage({ name: 'soon', reason: r.reason });
            }}
          />
        )}
        {stage.name === 'confirm' && problem && (
          <ConfirmForm
            problem={problem}
            onChange={updateProblem}
            onBack={() => setStage({ name: 'input' })}
            onBuild={() => setStage({ name: 'model' })}
            onComingSoon={(reason) => setStage({ name: 'soon', reason })}
          />
        )}
        {stage.name === 'model' && problem && (
          <ModelScreen problem={problem} onChange={updateProblem} settings={settings} onEdit={() => setStage({ name: 'confirm' })} C={C} plan={plan} />
        )}
        {stage.name === 'soon' && <ComingSoon reason={stage.reason} onBack={() => setStage({ name: 'input' })} />}
      </main>

      {showSettings && <SettingsDialog settings={settings} onChange={updateSettings} onClose={() => setShowSettings(false)} />}
    </div>
  );
}
