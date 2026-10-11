import type { SpellPage } from './types';

/** Maps each rune id to the ids of runes it feeds. */
export function buildSuccessors(page: Pick<SpellPage, 'runes' | 'ink'>): Map<string, string[]> {
  const successors = new Map<string, string[]>();
  for (const rune of page.runes) successors.set(rune.id, []);
  for (const path of page.ink) {
    successors.get(path.from)?.push(path.to);
  }
  return successors;
}

/** Maps each rune id to the ink paths arriving at it, in creation order. */
export function buildIncoming(page: Pick<SpellPage, 'runes' | 'ink'>): Map<string, string[]> {
  const incoming = new Map<string, string[]>();
  for (const rune of page.runes) incoming.set(rune.id, []);
  for (const path of page.ink) {
    incoming.get(path.to)?.push(path.from);
  }
  return incoming;
}

/**
 * Finds runes that sit on a feedback cycle.
 * Returns the ids involved (empty when the graph is acyclic).
 *
 * Uses Kahn's algorithm: repeatedly strip runes with no remaining incoming ink.
 * Whatever cannot be stripped is on a cycle or downstream of one, then we
 * narrow to runes that can actually reach themselves.
 */
export function findCycleRunes(page: Pick<SpellPage, 'runes' | 'ink'>): string[] {
  const successors = buildSuccessors(page);
  const indegree = new Map<string, number>();
  for (const rune of page.runes) indegree.set(rune.id, 0);
  for (const path of page.ink) {
    if (indegree.has(path.to) && indegree.has(path.from)) {
      indegree.set(path.to, (indegree.get(path.to) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [id, degree] of indegree) if (degree === 0) queue.push(id);

  while (queue.length > 0) {
    const id = queue.pop() as string;
    for (const next of successors.get(id) ?? []) {
      const degree = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, degree);
      if (degree === 0) queue.push(next);
    }
  }

  const remaining = [...indegree.entries()].filter(([, degree]) => degree > 0).map(([id]) => id);
  if (remaining.length === 0) return [];

  // Narrow to runes that can reach themselves, so purely downstream runes are not blamed.
  const remainingSet = new Set(remaining);
  return remaining.filter((start) => canReachSelf(start, successors, remainingSet));
}

function canReachSelf(
  start: string,
  successors: Map<string, string[]>,
  allowed: Set<string>,
): boolean {
  const seen = new Set<string>();
  const stack = [...(successors.get(start) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (id === start) return true;
    if (seen.has(id) || !allowed.has(id)) continue;
    seen.add(id);
    stack.push(...(successors.get(id) ?? []));
  }
  return false;
}

/** Would adding an ink path from -> to create a feedback cycle? */
export function wouldCreateCycle(
  page: Pick<SpellPage, 'runes' | 'ink'>,
  from: string,
  to: string,
): boolean {
  if (from === to) return true;
  // A cycle appears if `from` is already reachable from `to`.
  const successors = buildSuccessors(page);
  const seen = new Set<string>();
  const stack = [to];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (id === from) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(successors.get(id) ?? []));
  }
  return false;
}
