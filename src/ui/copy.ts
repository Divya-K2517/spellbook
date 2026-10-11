import type { RuneKind, Rune } from '@core/circuit';
import type { RuneChange } from '@core/simulator';
import type { ValidationCode } from '@core/validator';
import type { SpellPage } from '@core/circuit';

/**
 * All wording lives here, apart from the logic. The core and app layers speak
 * in codes; this file turns them into the spellbook's voice.
 */

export const runeNames: Record<RuneKind, string> = {
  input: 'Switch',
  output: 'Result',
  or: 'Either',
  and: 'Both',
  not: 'Opposite',
};

export const runeBlurbs: Record<RuneKind, string> = {
  input: 'A switch you flip yourself.',
  output: 'Wakes something in the scene.',
  or: 'On when either (or any) input is on.',
  and: 'On only when both (all) inputs are on.',
  not: 'Flips on to off, and off to on.',
};

export function runeName(rune: Pick<Rune, 'kind' | 'label'>): string {
  return rune.label ?? runeNames[rune.kind];
}

export const noticeCopy: Record<string, string> = {
  'would-cycle': 'This spell bites its own tail.',
  'self-loop': 'A rune cannot whisper to itself.',
  'bad-source': 'Ink cannot flow out of this rune.',
  'bad-target': 'Ink cannot flow into this rune.',
  duplicate: 'Those two runes are already joined.',
  'target-full': 'This rune can only listen to one thing.',
  'unknown-rune': 'That rune seems to have vanished.',
  'action-not-allowed': 'The book will not allow that just now.',
  'page-missing': 'That page has gone missing from the book.',
  'library-load-failed': 'The library could not be opened.',
  'open-failed': 'That page would not open.',
  'delete-failed': 'That page could not be torn out.',
  'import-failed': 'That file is not a page this book can read.',
  'import-succeeded': 'A new page has been bound into the book.',
};

export function noticeText(code: string, detail?: string): string {
  const base = noticeCopy[code] ?? 'Something unexpected happened.';
  return code === 'import-failed' && detail ? `${base} (${detail})` : base;
}

export const validationCopy: Record<ValidationCode, { title: string; hint: string }> = {
  NO_OUTPUT: { title: 'Nothing to wake', hint: 'Add a Result rune for the spell to power.' },
  NO_INPUT: { title: 'Nothing to flip', hint: 'Add a Switch rune to start the signal.' },
  DANGLING_INK: { title: 'Ink leads nowhere', hint: 'Delete this ink or reconnect it.' },
  BAD_SOURCE: { title: 'Ink flows out the wrong way', hint: 'Results do not give off signals.' },
  BAD_TARGET: { title: 'Ink flows into the wrong rune', hint: 'Switches cannot listen to anything.' },
  DUPLICATE_INK: { title: 'Doubled ink', hint: 'Two paths join the same pair of runes.' },
  TOO_FEW_INPUTS: { title: 'A rune is not listening', hint: 'Connect ink into this rune.' },
  TOO_MANY_INPUTS: { title: 'A rune is listening to too much', hint: 'Remove some of its incoming ink.' },
  FEEDBACK_CYCLE: { title: 'This spell bites its own tail', hint: 'Break the loop so ink only flows forward.' },
  UNUSED_SIGNAL: { title: 'A signal goes nowhere', hint: 'This is harmless, but the ink may be unfinished.' },
};

/** One sentence describing a rune changing, for the trace panel. */
export function describeChange(change: RuneChange, page: SpellPage): string {
  const rune = page.runes.find((candidate) => candidate.id === change.runeId);
  if (!rune) return 'A rune changed.';
  const name = runeName(rune);
  const now = change.to ? 'awakened' : 'went dark';
  if (rune.kind === 'input') return `${name} was set and ${now}.`;

  const readings = change.inputs
    .map((reading) => {
      const source = page.runes.find((candidate) => candidate.id === reading.runeId);
      return `${source ? runeName(source) : 'something'} ${reading.value ? 'on' : 'off'}`;
    })
    .join(', ');
  return `${name} ${now}. ${change.rule} It heard: ${readings || 'nothing'}.`;
}
