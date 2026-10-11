/**
 * Switches for which circuit shapes are allowed.
 *
 * Today only combinational spells are valid. When memory runes arrive,
 * flipping `allowFeedback` (or refining it) is how cycles become legal,
 * without touching the simulator, which already settles in rounds.
 */
export interface CircuitRules {
  allowFeedback: boolean;
}

export const DEFAULT_RULES: CircuitRules = {
  allowFeedback: false,
};
