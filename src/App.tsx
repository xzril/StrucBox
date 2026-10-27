import { useEffect, useState } from 'react';
import { ComingSoon } from './components/ComingSoon';
import { ConfirmForm } from './components/ConfirmForm';
import { FolderPicker } from './components/FolderPicker';
import { HomeScreen } from './components/HomeScreen';
import { InputScreen } from './components/InputScreen';
import { ModelScreen } from './components/ModelScreen';
import { CableScreen, sampleCable } from './components/CableScreen';
import { TrussScreen, sampleTruss } from './components/TrussScreen';
import { SettingsDialog, type Settings, defaultSettings } from './components/SettingsDialog';
import { aiStatus, providerName, WEB_BUILD, type Plan } from './input/api';
import { blankProblem, newId } from './input/parse';
import { addEntry, emptyLibrary, findEntry, mapEntry, removeEntry, thumbnail, type Library } from './lib/library';
import { load, save } from './lib/storage';
import { usePalette } from './lib/theme';
import { defaultUnits } from './lib/units';
import type { Cable } from './solver/cable';
import type { Truss } from './solver/truss';
import type { Problem } from './solver/types';

type Stage = { name: 'home' } | { name: 'input'; file?: File } | { name: 'confirm' } | { name: 'model' } | { name: 'soon'; reason: string } | { name: 'truss' };
/** The problem on screen: a saved entry (id) or a new one not yet put in a folder (id null). */
type Current = { id: string | null; problem: Problem; file?: File };

export default function App() {
  const [stage, setStage] = useState<Stage>({ name: 'home' });
  const [lib, setLib] = useState<Library>(() => load('library', emptyLibrary));
  const [current, setCurrent] = useState<Current | null>(null);
  const [picker, setPicker] = useState<{ moveId?: string } | null>(null);
  const [settings, setSettings] = useState<Settings>(() => load('settings', defaultSettings));
  const [showSettings, setShowSettings] = useState(false);
  // the truss or cable on screen: a saved entry (id) or a new one (id null), the last one kept in localStorage
  const [truss, setTruss] = useState<{ id: string | null; truss: Truss | Cable; file?: File }>(() => ({ id: null, truss: load('truss', sampleTruss()) }));
  const changeTruss = (t: Truss | Cable) => {
    setTruss({ ...truss, truss: t });
    save('truss', t);
    if (truss.id) updateLib(mapEntry(lib, truss.id, (e) => ({ ...e, problem: t, modified: now() })));
  };
  const openTruss = () => {
    setTruss({ id: null, truss: sampleTruss() });
    setStage({ name: 'truss' });
  };
  const openCable = () => {
    setTruss({ id: null, truss: sampleCable() });
    setStage({ name: 'truss' });
  };
  const [plan, setPlan] = useState<Plan>({ premium: false, provider: null });
  useEffect(() => {
    aiStatus().then(setPlan);
  }, []);
  useEffect(() => {
    scrollTo(0, 0);
  }, [stage.name]);
  const C = usePalette(settings.theme);
  const dark = C.dark;

  // shortcut: localStorage holds ~5 MB (about 500 problems with thumbnails); move to IndexedDB if users hit it
  const updateLib = (l: Library) => {
    setLib(l);
    save('library', l);
  };
  const updateSettings = (s: Settings) => {
    setSettings(s);
    save('settings', s);
  };
  const now = () => new Date().toISOString();

  const start = (problem: Problem, file?: File) => {
    setCurrent({ id: null, problem, file });
    setStage({ name: 'confirm' });
  };
  const manual = () => {
    const p = blankProblem();
    p.units = defaultUnits(settings.defaultSystem);
    if (settings.defaultSystem === 'US') {
      p.length = 20;
      p.supports[1].x = 20;
      p.loads = [{ ...p.loads[0], x: 10 } as typeof p.loads[0]];
    }
    start(p);
  };
  const open = (id: string, name: 'model' | 'confirm') => {
    const e = findEntry(lib, id);
    if (!e) return;
    if ('kind' in e.problem) {
      setTruss({ id, truss: e.problem });
      return setStage({ name: 'truss' });
    }
    setCurrent({ id, problem: e.problem });
    setStage(name === 'model' ? { name: 'model' } : { name: 'confirm' });
  };
  // live edits on the model screen are saved straight away
  const changeModel = (problem: Problem) => {
    setCurrent({ ...current!, problem });
    if (current?.id) updateLib(mapEntry(lib, current.id, (e) => ({ ...e, problem, modified: now() })));
  };
  const build = () => {
    if (!current) return;
    if (!current.id) return setPicker({});
    updateLib(mapEntry(lib, current.id, (e) => ({ ...e, problem: current.problem, modified: now() })));
    setStage({ name: 'model' });
  };
  const picked = async (l: Library, folderId: string) => {
    setPicker(null);
    if (picker?.moveId) {
      const e = findEntry(l, picker.moveId)!;
      return updateLib(addEntry(removeEntry(l, e.id), folderId, e));
    }
    if (stage.name === 'truss') {
      const id = newId();
      const image = truss.file && (await thumbnail(truss.file));
      updateLib(addEntry(l, folderId, { id, problem: truss.truss, image, created: now(), modified: now() }));
      return setTruss({ ...truss, id });
    }
    if (!current) return;
    const id = newId();
    const image = current.file && (await thumbnail(current.file));
    updateLib(addEntry(l, folderId, { id, problem: current.problem, image, created: now(), modified: now() }));
    setCurrent({ id, problem: current.problem });
    setStage({ name: 'model' });
  };
  const duplicate = (id: string) => {
    const f = lib.folders.find((f) => f.items.some((e) => e.id === id))!;
    const e = findEntry(lib, id)!;
    updateLib(addEntry(lib, f.id, { ...e, id: newId(), problem: { ...e.problem, title: `${e.problem.title} (copy)` }, created: now(), modified: now() }));
  };

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => setStage({ name: 'home' })} title="Home">
          <span className="logo">▣</span> StrucBox
        </button>
        {stage.name !== 'home' && stage.name !== 'truss' && (
          <nav className="steps">
            <span className={stage.name === 'input' ? 'on' : ''}>1 Problem</span>
            <span className={stage.name === 'confirm' ? 'on' : ''}>2 Confirm values</span>
            <span className={stage.name === 'model' ? 'on' : ''}>3 Model</span>
          </nav>
        )}
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
        {stage.name !== 'home' && (
          <button className="ghost" aria-label="Settings" onClick={() => setShowSettings(true)}>
            ⚙ <span className="hide-sm">Settings</span>
          </button>
        )}
      </header>

      <main className={stage.name === 'home' ? 'home-main' : ''}>
        {stage.name === 'home' && (
          <HomeScreen
            lib={lib}
            onLib={updateLib}
            onOpen={(id) => open(id, 'model')}
            onEdit={(id) => open(id, 'confirm')}
            onMove={(id) => setPicker({ moveId: id })}
            onDuplicate={duplicate}
            onPhoto={(file) => setStage({ name: 'input', file })}
            onManual={manual}
            onSettings={() => setShowSettings(true)}
          />
        )}
        {stage.name === 'input' && (
          <InputScreen
            premium={plan.premium}
            initialFile={stage.file}
            onManual={manual}
            onTruss={openTruss}
            onCable={openCable}
            onParsed={(r, file) => {
              if (r.ok) return start(r.problem, file);
              if (!r.truss) return setStage({ name: 'soon', reason: r.reason });
              setTruss({ id: null, truss: r.truss, file });
              setStage({ name: 'truss' });
            }}
          />
        )}
        {stage.name === 'confirm' && current && (
          <ConfirmForm
            problem={current.problem}
            onChange={(problem) => setCurrent({ ...current, problem })}
            onBack={() => setStage({ name: 'home' })}
            onBuild={build}
            onComingSoon={(reason) => setStage({ name: 'soon', reason })}
          />
        )}
        {stage.name === 'model' && current && (
          <ModelScreen problem={current.problem} onChange={changeModel} settings={settings} onEdit={() => setStage({ name: 'confirm' })} C={C} plan={plan} />
        )}
        {stage.name === 'soon' && <ComingSoon reason={stage.reason} onBack={() => setStage({ name: 'home' })} onTruss={/truss/i.test(stage.reason) ? openTruss : undefined} />}
        {stage.name === 'truss' &&
          (truss.truss.kind === 'cable' ? (
            <CableScreen key={truss.id ?? 'new'} cable={truss.truss} photo={truss.file} onChange={changeTruss} onSave={truss.id ? undefined : () => setPicker({})} C={C} />
          ) : (
            <TrussScreen key={truss.id ?? 'new'} truss={truss.truss} photo={truss.file} onChange={changeTruss} onSave={truss.id ? undefined : () => setPicker({})} C={C} />
          ))}
      </main>

      {picker && (
        <FolderPicker lib={lib} title={picker.moveId ? 'Move to folder' : 'Save to folder'} onDone={picked} onCancel={() => setPicker(null)} />
      )}
      {showSettings && <SettingsDialog settings={settings} onChange={updateSettings} onClose={() => setShowSettings(false)} />}
    </div>
  );
}
