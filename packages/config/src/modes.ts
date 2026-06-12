import { getDefaultModes } from "./defaults.js";
import type { AgentMode } from "./types.js";

export function listModes(modes?: AgentMode[]): AgentMode[] {
  if (modes && modes.length > 0) return modes;
  return getDefaultModes();
}

export function getMode(name: string, modes?: AgentMode[]): AgentMode | undefined {
  return listModes(modes).find((m) => m.name === name);
}

export function cycleMode(currentName: string, modes?: AgentMode[]): string {
  const all = listModes(modes);
  const idx = all.findIndex((m) => m.name === currentName);
  if (idx === -1) return all[0]!.name;
  return all[(idx + 1) % all.length]!.name;
}
