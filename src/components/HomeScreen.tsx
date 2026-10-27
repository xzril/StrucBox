import { useRef, useState } from 'react';
import { beamKind, mapEntry, removeEntry, sortItems, type Entry, type Library, type SortBy } from '../lib/library';
import { newId } from '../input/parse';

interface Props {
  lib: Library;
  onLib: (lib: Library) => void;
  onOpen: (id: string) => void;
  onEdit: (id: string) => void;
  onMove: (id: string) => void;
  onDuplicate: (id: string) => void;
  onPhoto: (f: File) => void;
  onManual: () => void;
  onTruss: () => void;
  onCable: () => void;
  onSettings: () => void;
}

const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export function HomeScreen({ lib, onLib, onOpen, onEdit, onMove, onDuplicate, onPhoto, onManual, onTruss, onCable, onSettings }: Props) {
  const [menu, setMenu] = useState<string | null>(null);
  const [search, setSearch] = useState<string | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const upload = useRef<HTMLInputElement>(null);

  const setFolder = (id: string, change: object) => onLib({ ...lib, folders: lib.folders.map((f) => (f.id === id ? { ...f, ...change } : f)) });
  const newFolder = () => {
    const name = prompt('Folder name')?.trim();
    if (name) onLib({ ...lib, folders: [...lib.folders, { id: newId(), name, open: true, items: [] }] });
  };
  const q = search?.trim().toLowerCase();
  const matches = (e: Entry) => !q || `${e.problem.title} ${e.problem.text}`.toLowerCase().includes(q);
  const act = (fn: () => void) => () => (setMenu(null), fn());

  const card = (e: Entry) => (
    <div key={e.id} className="entry" onContextMenu={(ev) => (ev.preventDefault(), setMenu(e.id))}>
      <button className="entry-open" onClick={() => onOpen(e.id)}>
        <span className="thumb">{e.image ? <img src={e.image} alt="" /> : <BeamIcon />}</span>
        <span className="entry-text">
          <span className="kind">{beamKind(e.problem)}</span>
          <span className="desc">{e.problem.text || e.problem.title}</span>
          <span className="dates">
            Created {date(e.created)} · Edited {date(e.modified)}
          </span>
        </span>
      </button>
      <button className="ghost more" aria-label="More actions" aria-expanded={menu === e.id} onClick={() => setMenu(menu === e.id ? null : e.id)}>
        ⋮
      </button>
      {menu === e.id && (
        <div className="menu" role="menu">
          <button role="menuitem" onClick={act(() => onEdit(e.id))}>Edit problem</button>
          <button
            role="menuitem"
            onClick={act(() => {
              const title = prompt('Problem name', e.problem.title)?.trim();
              if (title) onLib(mapEntry(lib, e.id, (x) => ({ ...x, problem: { ...x.problem, title } })));
            })}
          >
            Rename
          </button>
          <button role="menuitem" onClick={act(() => onMove(e.id))}>Move to folder…</button>
          <button role="menuitem" onClick={act(() => onDuplicate(e.id))}>Duplicate</button>
          <hr />
          <button
            role="menuitem"
            className="danger"
            onClick={act(() => {
              if (confirm(`Delete "${e.problem.title}"?`)) onLib(removeEntry(lib, e.id));
            })}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="home">
      {menu && <div className="menu-back" onClick={() => setMenu(null)} />}
      <div className="home-list">
        {search !== null && (
          <input className="search" autoFocus type="search" placeholder="Search problems" value={search} onChange={(e) => setSearch(e.target.value)} />
        )}
        <div className="home-bar">
          <button onClick={newFolder}>+ New folder</button>
          <label className="muted small">
            Sort by{' '}
            <select value={lib.sort} onChange={(e) => onLib({ ...lib, sort: e.target.value as SortBy })}>
              <option value="modified">Last modified</option>
              <option value="created">Date created</option>
              <option value="name">Name</option>
            </select>
          </label>
        </div>
        {lib.folders.length === 0 && <p className="muted center-text">No problems yet. Take a photo of one, or add one manually.</p>}
        {lib.folders.map((f) => {
          const items = sortItems(f.items, lib.sort).filter(matches);
          return (
            <section key={f.id} className="folder">
              <div className="folder-head">
                <button className="ghost chev" aria-label={f.open ? 'Hide folder contents' : 'Show folder contents'} aria-expanded={f.open} onClick={() => setFolder(f.id, { open: !f.open })}>
                  {f.open ? '▼' : '▶'}
                </button>
                <h3>{f.name}</h3>
                <span className="muted small">
                  {f.items.length} {f.items.length === 1 ? 'problem' : 'problems'}
                </span>
                <button
                  className="ghost rename"
                  aria-label="Rename folder"
                  onClick={() => {
                    const name = prompt('Folder name', f.name)?.trim();
                    if (name) setFolder(f.id, { name });
                  }}
                >
                  ✎
                </button>
              </div>
              {(f.open || q) && <div className="entries">{items.map(card)}</div>}
            </section>
          );
        })}
      </div>

      <nav className="belt" aria-label="Main actions">
        <BeltButton label="Search" onClick={() => setSearch(search === null ? '' : null)}>
          <path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4" />
        </BeltButton>
        <BeltButton label="Add manually" onClick={onManual}>
          <path d="M12 5v14M5 12h14" />
        </BeltButton>
        <BeltButton label="Truss" onClick={onTruss}>
          <path d="M3 18h18M3 18l4.5-9 4.5 9 4.5-9 4.5 9M7.5 9h9" />
        </BeltButton>
        <BeltButton label="Cable" onClick={onCable}>
          <path d="M4 5v14M20 5v14M4 6c4 9 12 9 16 0M10 10.5v4M15 10v4" />
        </BeltButton>
        <BeltButton label="Take photo" big onClick={() => camera.current?.click()}>
          <path d="M4 8h3l2-3h6l2 3h3v11H4zM12 9.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" />
        </BeltButton>
        <BeltButton label="Upload image" onClick={() => upload.current?.click()}>
          <path d="M3 4h18v16H3zM9 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM21 16l-5-5-9 9" />
        </BeltButton>
        <BeltButton label="Settings" onClick={onSettings}>
          <path d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1" />
        </BeltButton>
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && onPhoto(e.target.files[0])} />
        <input ref={upload} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && onPhoto(e.target.files[0])} />
      </nav>
    </div>
  );
}

function BeltButton({ label, big, onClick, children }: { label: string; big?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className={`belt-btn ${big ? 'big' : ''}`} onClick={onClick}>
      <span className="circle">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {children}
        </svg>
      </span>
      <span className="belt-label">{label}</span>
    </button>
  );
}

function BeamIcon() {
  return (
    <svg viewBox="0 0 60 40" aria-hidden="true" fill="none" strokeWidth="2" strokeLinecap="round">
      <path d="M30 4v14M27 14l3 4 3-4" stroke="var(--amber)" />
      <rect x="6" y="20" width="48" height="4" fill="var(--primary)" />
      <path d="M10 24l-5 8h10zM50 24l-4 6h8z" stroke="var(--primary)" />
    </svg>
  );
}
