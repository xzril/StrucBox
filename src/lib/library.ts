// Saved problems, sorted into user folders. Kept in localStorage with everything else (D10).
import type { Cable } from '../solver/cable';
import type { Truss } from '../solver/truss';
import type { Problem } from '../solver/types';

export interface Entry {
  id: string;
  problem: Problem | Truss | Cable;
  image?: string; // small JPEG data URL of the photo, for quick recognition
  created: string; // ISO dates
  modified: string;
}
export interface Folder {
  id: string;
  name: string;
  open: boolean;
  items: Entry[];
}
export type SortBy = 'modified' | 'created' | 'name';
export interface Library {
  folders: Folder[];
  sort: SortBy;
}

export const emptyLibrary: Library = { folders: [], sort: 'modified' };

export function sortItems(items: Entry[], by: SortBy): Entry[] {
  return [...items].sort((a, b) => (by === 'name' ? a.problem.title.localeCompare(b.problem.title) : b[by].localeCompare(a[by])));
}

export function beamKind(p: Problem | Truss | Cable): string {
  if ('kind' in p) return p.kind === 'cable' ? 'Cable' : 'Truss';
  if (p.supports.some((s) => s.type === 'fixed')) return 'Cantilever';
  const ends = p.supports.every((s) => s.x <= 1e-9 || s.x >= p.length - 1e-9);
  return ends ? 'Simply supported' : 'Overhang';
}

/** Applies `fn` to the entry with this id, wherever it is. */
export function mapEntry(lib: Library, id: string, fn: (e: Entry) => Entry): Library {
  return { ...lib, folders: lib.folders.map((f) => ({ ...f, items: f.items.map((e) => (e.id === id ? fn(e) : e)) })) };
}

export function removeEntry(lib: Library, id: string): Library {
  return { ...lib, folders: lib.folders.map((f) => ({ ...f, items: f.items.filter((e) => e.id !== id) })) };
}

export function addEntry(lib: Library, folderId: string, e: Entry): Library {
  return { ...lib, folders: lib.folders.map((f) => (f.id === folderId ? { ...f, open: true, items: [...f.items, e] } : f)) };
}

export function findEntry(lib: Library, id: string): Entry | undefined {
  for (const f of lib.folders) for (const e of f.items) if (e.id === id) return e;
}

/** Downscales a photo so hundreds of them still fit in localStorage. */
export async function thumbnail(file: File, size = 160): Promise<string | undefined> {
  try {
    const bmp = await createImageBitmap(file);
    const k = size / Math.max(bmp.width, bmp.height);
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.7);
  } catch {
    return undefined;
  }
}
