// src/models/state-machine.ts
var VALID_TRANSITIONS = {
  pending: ["corrected", "abandoned", "false_positive"],
  corrected: ["recurring", "verified", "abandoned"],
  recurring: ["corrected", "verified", "abandoned"],
  verified: ["graduated", "abandoned"],
  graduated: [],
  // 终态
  abandoned: [],
  // 终态
  false_positive: []
  // 终态
};
var RULE_VALID_TRANSITIONS = {
  active: ["verified", "superseded", "archived"],
  verified: ["superseded", "archived"],
  superseded: [],
  // 终态
  archived: []
  // 终态
};
function isValidTransition(from, to) {
  const allowed = VALID_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}
function isValidRuleTransition(from, to) {
  const allowed = RULE_VALID_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}
export {
  RULE_VALID_TRANSITIONS,
  VALID_TRANSITIONS,
  isValidRuleTransition,
  isValidTransition
};
//# sourceMappingURL=index.mjs.map