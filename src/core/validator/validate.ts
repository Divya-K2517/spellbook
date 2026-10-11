import { DEFAULT_RULES, runeSpec, findCycleRunes, buildIncoming, buildSuccessors } from '../circuit';
import type { CircuitRules, SpellPage } from '../circuit';

export type ValidationCode =
  | 'NO_OUTPUT'
  | 'NO_INPUT'
  | 'DANGLING_INK'
  | 'BAD_SOURCE'
  | 'BAD_TARGET'
  | 'DUPLICATE_INK'
  | 'TOO_FEW_INPUTS'
  | 'TOO_MANY_INPUTS'
  | 'FEEDBACK_CYCLE'
  | 'UNUSED_SIGNAL';

export interface ValidationIssue {
  code: ValidationCode;
  /** Plain description for logs. The UI maps `code` to its own charming copy. */
  message: string;
  /** Runes involved, so the UI can highlight them. */
  runeIds: string[];
  /** Ink paths involved, so the UI can highlight them. */
  inkIds: string[];
}

export type ValidationResult =
  | { ok: true; warnings: ValidationIssue[] }
  | { ok: false; errors: ValidationIssue[]; warnings: ValidationIssue[] };

/**
 * Decides whether a page's circuit can be evaluated.
 *
 * Errors block preview. Warnings (for example a gate whose output feeds
 * nothing) do not. Never throws; malformed pages produce errors instead.
 */
export function validate(page: SpellPage, rules: CircuitRules = DEFAULT_RULES): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const runeById = new Map(page.runes.map((rune) => [rune.id, rune]));

  if (!page.runes.some((rune) => rune.kind === 'output')) {
    errors.push(issue('NO_OUTPUT', 'The spell has no output rune to power.'));
  }
  if (!page.runes.some((rune) => rune.kind === 'input')) {
    errors.push(issue('NO_INPUT', 'The spell has no input rune to flip.'));
  }

  // Ink path integrity: endpoints must exist and be compatible.
  const seenPairs = new Set<string>();
  const sound = { runes: page.runes, ink: [] as SpellPage['ink'] };
  for (const path of page.ink) {
    const source = runeById.get(path.from);
    const target = runeById.get(path.to);
    if (!source || !target) {
      errors.push(
        issue('DANGLING_INK', 'An ink path points to a rune that is not on the page.', [], [path.id]),
      );
      continue;
    }
    if (!runeSpec(source.kind).hasOutput) {
      errors.push(issue('BAD_SOURCE', 'Ink cannot flow out of this rune.', [source.id], [path.id]));
      continue;
    }
    if (runeSpec(target.kind).maxInputs === 0) {
      errors.push(issue('BAD_TARGET', 'Ink cannot flow into this rune.', [target.id], [path.id]));
      continue;
    }
    const pair = `${path.from}->${path.to}`;
    if (seenPairs.has(pair)) {
      errors.push(
        issue('DUPLICATE_INK', 'Two ink paths connect the same pair of runes.', [source.id, target.id], [path.id]),
      );
      continue;
    }
    seenPairs.add(pair);
    sound.ink.push(path);
  }

  // Arity: each rune must have an allowed number of incoming ink paths.
  const incoming = buildIncoming(sound);
  for (const rune of page.runes) {
    const spec = runeSpec(rune.kind);
    const count = incoming.get(rune.id)?.length ?? 0;
    if (count < spec.minInputs) {
      errors.push(
        issue('TOO_FEW_INPUTS', `A ${rune.kind} rune needs at least ${spec.minInputs} incoming ink path.`, [rune.id]),
      );
    } else if (count > spec.maxInputs) {
      errors.push(
        issue('TOO_MANY_INPUTS', `A ${rune.kind} rune accepts at most ${spec.maxInputs} incoming ink path.`, [rune.id]),
      );
    }
  }

  if (!rules.allowFeedback) {
    const cycle = findCycleRunes(sound);
    if (cycle.length > 0) {
      const cycleSet = new Set(cycle);
      const cycleInk = sound.ink.filter((p) => cycleSet.has(p.from) && cycleSet.has(p.to)).map((p) => p.id);
      errors.push(issue('FEEDBACK_CYCLE', 'The spell bites its own tail.', cycle, cycleInk));
    }
  }

  // Warnings: gates and inputs whose signal goes nowhere.
  const successors = buildSuccessors(sound);
  for (const rune of page.runes) {
    if (runeSpec(rune.kind).hasOutput && (successors.get(rune.id)?.length ?? 0) === 0) {
      warnings.push(issue('UNUSED_SIGNAL', `This ${rune.kind} rune's signal goes nowhere.`, [rune.id]));
    }
  }

  return errors.length === 0 ? { ok: true, warnings } : { ok: false, errors, warnings };
}

function issue(
  code: ValidationCode,
  message: string,
  runeIds: string[] = [],
  inkIds: string[] = [],
): ValidationIssue {
  return { code, message, runeIds, inkIds };
}
