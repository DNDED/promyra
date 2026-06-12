import type { AgentMode, PiConfig } from "./types.js";

export const DEFAULT_CONFIG: PiConfig = {
  version: 1,
  provider: {
    name: "opencode-go",
    model: "minimax-m3",
  },
  agent: {
    name: "build",
    maxIterations: 10,
    toolBudget: 6,
  },
  theme: {
    name: "default",
  },
  ui: {
    statusLine: true,
    copyFriendly: false,
    nerdFonts: true,
    gitStatusIntervalMs: 5000,
  },
};

export const DEFAULT_MODES: AgentMode[] = [
  {
    name: "build",
    label: "BUILD",
    activeTools: [],
    readOnly: false,
  },
  {
    name: "plan",
    label: "PLAN",
    activeTools: ["read", "bash", "grep", "find", "ls", "questionnaire"],
    readOnly: true,
  },
];

export function getDefaultModes(): AgentMode[] {
  return DEFAULT_MODES.map((m) => ({ ...m, activeTools: [...m.activeTools] }));
}
