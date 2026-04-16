"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  RULE_VALID_TRANSITIONS: () => RULE_VALID_TRANSITIONS,
  VALID_TRANSITIONS: () => VALID_TRANSITIONS,
  isValidRuleTransition: () => isValidRuleTransition,
  isValidTransition: () => isValidTransition
});
module.exports = __toCommonJS(index_exports);

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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  RULE_VALID_TRANSITIONS,
  VALID_TRANSITIONS,
  isValidRuleTransition,
  isValidTransition
});
//# sourceMappingURL=index.js.map