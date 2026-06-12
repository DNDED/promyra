import { join } from "node:path";
import { homedir } from "node:os";

export function getConfigDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg) return join(xdg, "pi-pro");
  return join(process.env.PI_HOME_OVERRIDE ?? homedir(), ".pi", "agent");
}

export function getConfigPath(): string {
  return join(getConfigDir(), "pi.json");
}
