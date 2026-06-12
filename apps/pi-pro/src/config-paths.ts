import { join } from "node:path";
import { homedir } from "node:os";

function resolveHome(): string {
  return process.env.PI_HOME_OVERRIDE ?? homedir();
}

export function piHome(): string {
  return join(resolveHome(), ".pi");
}

export const PI_CONFIG_PATH = join(piHome(), "pi-config.json");
export const PI_AUTH_PATH = join(piHome(), "pi-auth.json");

