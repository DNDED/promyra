import type { AgentMode } from "@pi/config";
import { theme } from "../theme.js";

export interface AgentModeDisplay {
  label: string;
  color: string;
  readOnly: boolean;
}

export function getModeDisplay(name: string, modes: AgentMode[]): AgentModeDisplay {
  const m = modes.find((x) => x.name === name);
  if (!m) {
    return { label: name.toUpperCase(), color: theme.primary, readOnly: false };
  }
  const color = (theme as unknown as Record<string, string>)[m.color] ?? theme.primary;
  return { label: m.label, color, readOnly: m.readOnly };
}
