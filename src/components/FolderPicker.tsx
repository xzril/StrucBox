import { useState } from 'react';
import { newId } from '../input/parse';
import type { Library } from '../lib/library';

interface Props {
  lib: Library;
  title: string;
  onDone: (lib: Library, folderId: string) => void;
  onCancel: () => void;
}

/** Asks which folder a problem goes in; with no folders yet, asks for the first folder's name. */
export function FolderPicker({ lib, title, onDone, onCancel }: Props) {
  const [pick, setPick] = useState<string>(lib.folders[0]?.id ?? 'new');
  const [name, setName] = useState('');
  const creating = pick === 'new';
  const save = () => {
    if (!creating) return onDone(lib, pick);
    const id = newId();
    onDone({ ...lib, folders: [...lib.folders, { id, name: name.trim(), open: true, items: [] }] }, id);
  };
  return (
    <div className="modal-back" onClick={onCancel}>
      <div className="modal" role="dialog" aria-labelledby="pick-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="pick-title">{title}</h2>
        {lib.folders.length === 0 && <p className="muted">You don't have any folders yet. Name your first one.</p>}
        <div className="folder-pick">
          {lib.folders.map((f) => (
            <label key={f.id}>
              <input type="radio" name="folder" checked={pick === f.id} onChange={() => setPick(f.id)} />
              <span>{f.name}</span>
              <span className="muted small">{f.items.length}</span>
            </label>
          ))}
          {lib.folders.length > 0 && (
            <label>
              <input type="radio" name="folder" checked={creating} onChange={() => setPick('new')} />
              <span>+ New folder</span>
            </label>
          )}
        </div>
        {creating && (
          <label className="field">
            <span>Folder name</span>
            <input autoFocus value={name} placeholder="e.g. Statics Ch. 4" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && save()} />
          </label>
        )}
        <div className="actions">
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" disabled={creating && !name.trim()} onClick={save}>
            {creating ? 'Create folder and save' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
