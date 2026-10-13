import type { Rng } from '../math/rng';

const NAMES = [
  'Pip', 'Moss', 'Wren', 'Juniper', 'Ember', 'Fern', 'Tansy', 'Cricket', 'Briar', 'Sorrel',
  'Marlow', 'Linden', 'Nettle', 'Poppy', 'Bramble', 'Clover', 'Dill', 'Hazel', 'Ivy', 'Kit',
  'Lark', 'Mint', 'Nutmeg', 'Olive', 'Perry', 'Quill', 'Rue', 'Sage', 'Thistle', 'Umber',
  'Vesper', 'Willow', 'Yarrow', 'Zinnia', 'Alder', 'Birch', 'Cedar', 'Dune', 'Elm', 'Flint',
  'Gorse', 'Heath', 'Indigo', 'Jasper', 'Kestrel', 'Laurel', 'Maple', 'Nimbus', 'Orla', 'Pebble',
];

/** A shuffled, reusable supply of firefly names. Past the list, names get a number. */
export function createNameSupply(rng: Rng, alreadyUsed: readonly string[] = []) {
  const pool = NAMES.filter((n) => !alreadyUsed.includes(n));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  let overflow = alreadyUsed.length;
  return {
    next(): string {
      const name = pool.pop();
      if (name) return name;
      overflow += 1;
      return `Spark ${overflow}`;
    },
  };
}
