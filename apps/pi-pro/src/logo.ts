export const PI_LOGO = ` ____   _
|  _ \\ (_)___  ___
| |_) || |/ _ \\/ __|
|  __/ | | (_) \\__ \\
|_|    |_|\\___/|___/`;

export const PI_TAGLINE = "coding agent";

export function banner(version: string, model?: string): string {
  return [PI_LOGO, "", `${PI_TAGLINE}${model ? ` · ${model}` : ""}`, `v${version}`, "─".repeat(40)].join("\n");
}
