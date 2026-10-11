import { isRuneKind } from '../circuit';
import type { InkPath, Rune, SpellPage } from '../circuit';

/**
 * Turning a page into text and back. Pure: no storage, no file access.
 * The app layer decides where the text goes (IndexedDB, a downloaded file).
 */

export const SCHEMA_VERSION = 1;
export const FILE_KIND = 'logic-spellbook-page';

interface PageFile {
  kind: typeof FILE_KIND;
  schemaVersion: number;
  page: SpellPage;
}

export function serializePage(page: SpellPage): string {
  const file: PageFile = { kind: FILE_KIND, schemaVersion: SCHEMA_VERSION, page };
  return JSON.stringify(file, null, 2);
}

export type ParseResult = { ok: true; page: SpellPage } | { ok: false; error: string };

export function deserializePage(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }
  if (!isRecord(data) || data.kind !== FILE_KIND) {
    return { ok: false, error: 'That file is not a Logic Spellbook page.' };
  }
  if (typeof data.schemaVersion !== 'number') {
    return { ok: false, error: 'That page file has no schema version.' };
  }
  if (data.schemaVersion > SCHEMA_VERSION) {
    return { ok: false, error: 'That page was saved by a newer version of the spellbook.' };
  }
  const migrated = migrate(data.page, data.schemaVersion);
  return coercePage(migrated);
}

/** Upgrade hook. Add a step here whenever SCHEMA_VERSION increases. */
function migrate(page: unknown, _fromVersion: number): unknown {
  return page;
}

function coercePage(value: unknown): ParseResult {
  if (!isRecord(value)) return { ok: false, error: 'The page data is missing.' };
  const { id, title, runes, ink, scene, createdAt, updatedAt } = value;
  if (typeof id !== 'string' || typeof title !== 'string') {
    return { ok: false, error: 'The page has no id or title.' };
  }
  if (!Array.isArray(runes) || !Array.isArray(ink)) {
    return { ok: false, error: 'The page has no runes or ink list.' };
  }

  const cleanRunes: Rune[] = [];
  for (const raw of runes) {
    if (
      !isRecord(raw) ||
      typeof raw.id !== 'string' ||
      !isRuneKind(raw.kind) ||
      typeof raw.x !== 'number' ||
      typeof raw.y !== 'number'
    ) {
      return { ok: false, error: 'A rune in the page is malformed.' };
    }
    cleanRunes.push({
      id: raw.id,
      kind: raw.kind,
      x: raw.x,
      y: raw.y,
      ...(typeof raw.label === 'string' ? { label: raw.label } : {}),
    });
  }

  const cleanInk: InkPath[] = [];
  for (const raw of ink) {
    if (
      !isRecord(raw) ||
      typeof raw.id !== 'string' ||
      typeof raw.from !== 'string' ||
      typeof raw.to !== 'string'
    ) {
      return { ok: false, error: 'An ink path in the page is malformed.' };
    }
    cleanInk.push({ id: raw.id, from: raw.from, to: raw.to });
  }

  const now = Date.now();
  return {
    ok: true,
    page: {
      id,
      title,
      runes: cleanRunes,
      ink: cleanInk,
      scene: {
        themeId: isRecord(scene) && typeof scene.themeId === 'string' ? scene.themeId : 'placeholder',
      },
      createdAt: typeof createdAt === 'number' ? createdAt : now,
      updatedAt: typeof updatedAt === 'number' ? updatedAt : now,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
