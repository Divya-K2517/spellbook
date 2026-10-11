import { runeSpec } from './runes';
import { DEFAULT_RULES, type CircuitRules } from './rules';
import { wouldCreateCycle } from './graph';
import type { InkPath, Rune, RuneKind, SpellPage } from './types';

/**
 * Pure editing operations. Each returns a new page and never mutates its input.
 * The app layer calls these in response to machine events such as
 * `place-rune` and `connect-ink-path`.
 */

let idCounter = 0;

/** Creates a reasonably unique id without touching any browser API. */
export function makeId(prefix: string): string {
  idCounter += 1;
  const random = Math.floor(Math.random() * 36 ** 4)
    .toString(36)
    .padStart(4, '0');
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}${random}`;
}

export function createEmptyPage(title = 'Untitled spell', now = Date.now()): SpellPage {
  return {
    id: makeId('page'),
    title,
    runes: [],
    ink: [],
    scene: { themeId: 'placeholder' },
    createdAt: now,
    updatedAt: now,
  };
}

function touch(page: SpellPage, changes: Partial<SpellPage>, now = Date.now()): SpellPage {
  return { ...page, ...changes, updatedAt: now };
}

export function placeRune(
  page: SpellPage,
  kind: RuneKind,
  x: number,
  y: number,
  label?: string,
): { page: SpellPage; rune: Rune } {
  const rune: Rune = { id: makeId('rune'), kind, x, y, ...(label ? { label } : {}) };
  return { page: touch(page, { runes: [...page.runes, rune] }), rune };
}

export function moveRune(page: SpellPage, runeId: string, x: number, y: number): SpellPage {
  return touch(page, {
    runes: page.runes.map((rune) => (rune.id === runeId ? { ...rune, x, y } : rune)),
  });
}

export function renameRune(page: SpellPage, runeId: string, label: string): SpellPage {
  const trimmed = label.trim();
  return touch(page, {
    runes: page.runes.map((rune) => {
      if (rune.id !== runeId) return rune;
      const { label: _old, ...rest } = rune;
      return trimmed ? { ...rest, label: trimmed } : rest;
    }),
  });
}

/** Removes a rune and every ink path touching it. */
export function deleteRune(page: SpellPage, runeId: string): SpellPage {
  return touch(page, {
    runes: page.runes.filter((rune) => rune.id !== runeId),
    ink: page.ink.filter((path) => path.from !== runeId && path.to !== runeId),
  });
}

export type ConnectRefusal =
  | 'unknown-rune'
  | 'self-loop'
  | 'bad-source'
  | 'bad-target'
  | 'duplicate'
  | 'target-full'
  | 'would-cycle';

export type ConnectCheck = { ok: true } | { ok: false; reason: ConnectRefusal };

/**
 * Checks whether an ink path may be drawn. Refusing here (rather than only at
 * validation time) lets the UI answer immediately, e.g. "This spell bites its own tail."
 */
export function canConnect(
  page: SpellPage,
  from: string,
  to: string,
  rules: CircuitRules = DEFAULT_RULES,
): ConnectCheck {
  const source = page.runes.find((rune) => rune.id === from);
  const target = page.runes.find((rune) => rune.id === to);
  if (!source || !target) return { ok: false, reason: 'unknown-rune' };
  if (from === to) return { ok: false, reason: 'self-loop' };
  if (!runeSpec(source.kind).hasOutput) return { ok: false, reason: 'bad-source' };
  if (runeSpec(target.kind).maxInputs === 0) return { ok: false, reason: 'bad-target' };
  if (page.ink.some((path) => path.from === from && path.to === to)) {
    return { ok: false, reason: 'duplicate' };
  }
  const incomingCount = page.ink.filter((path) => path.to === to).length;
  if (incomingCount >= runeSpec(target.kind).maxInputs) {
    return { ok: false, reason: 'target-full' };
  }
  if (!rules.allowFeedback && wouldCreateCycle(page, from, to)) {
    return { ok: false, reason: 'would-cycle' };
  }
  return { ok: true };
}

export function connectInk(
  page: SpellPage,
  from: string,
  to: string,
  rules: CircuitRules = DEFAULT_RULES,
): { page: SpellPage; path: InkPath } | { page: SpellPage; refused: ConnectRefusal } {
  const check = canConnect(page, from, to, rules);
  if (!check.ok) return { page, refused: check.reason };
  const path: InkPath = { id: makeId('ink'), from, to };
  return { page: touch(page, { ink: [...page.ink, path] }), path };
}

export function deleteInk(page: SpellPage, inkId: string): SpellPage {
  return touch(page, { ink: page.ink.filter((path) => path.id !== inkId) });
}

export function renamePage(page: SpellPage, title: string): SpellPage {
  return touch(page, { title: title.trim() || 'Untitled spell' });
}

export function setSceneTheme(page: SpellPage, themeId: string): SpellPage {
  return touch(page, { scene: { ...page.scene, themeId } });
}

/** A copy with a new identity, for the library's duplicate action. */
export function duplicatePage(page: SpellPage, now = Date.now()): SpellPage {
  const runeIdMap = new Map<string, string>();
  const runes = page.runes.map((rune) => {
    const id = makeId('rune');
    runeIdMap.set(rune.id, id);
    return { ...rune, id };
  });
  const ink = page.ink.flatMap((path) => {
    const from = runeIdMap.get(path.from);
    const to = runeIdMap.get(path.to);
    return from && to ? [{ id: makeId('ink'), from, to }] : [];
  });
  return {
    ...page,
    id: makeId('page'),
    title: `${page.title} (copy)`,
    runes,
    ink,
    createdAt: now,
    updatedAt: now,
  };
}
