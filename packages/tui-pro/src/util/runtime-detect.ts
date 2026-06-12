import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface RuntimeInfo {
  name: string;
  version: string | null;
}

const RUNTIME_MARKERS: Array<{
  name: string;
  files: string[];
  versionFrom?: { file: string; regex: RegExp };
}> = [
  { name: "node", files: ["package.json"], versionFrom: { file: "package.json", regex: /"engines"\s*:\s*\{[^}]*"node"\s*:\s*"?([^",}]+)/ } },
  { name: "bun", files: ["bun.lock", "bun.lockb", "package.json"] },
  { name: "deno", files: ["deno.json", "deno.jsonc", "deno.lock"] },
  { name: "go", files: ["go.mod"] },
  { name: "rust", files: ["Cargo.toml"] },
  { name: "python", files: ["pyproject.toml", "setup.py", "requirements.txt", "Pipfile"] },
  { name: "ruby", files: ["Gemfile", ".ruby-version"] },
  { name: "elixir", files: ["mix.exs"] },
  { name: "elm", files: ["elm.json", "elm-stuff"] },
  { name: "c", files: [], versionFrom: undefined },
  { name: "cpp", files: [] },
  { name: "cmake", files: ["CMakeLists.txt", "CMakeCache.txt"] },
  { name: "java", files: [".java-version", "pom.xml", "build.gradle", "build.gradle.kts"] },
  { name: "kotlin", files: [] },
  { name: "scala", files: ["build.sbt", ".scala"] },
  { name: "swift", files: ["Package.swift"] },
  { name: "dotnet", files: [] },
  { name: "haskell", files: ["stack.yaml", "*.cabal"] },
  { name: "lua", files: [".luarc.json"] },
  { name: "perl", files: ["cpanfile", "Makefile.PL"] },
  { name: "php", files: ["composer.json"] },
  { name: "pixi", files: ["pixi.toml", "pixi.lock"] },
  { name: "terraform", files: [] },
  { name: "zig", files: ["build.zig"] },
  { name: "v", files: ["v.mod"] },
  { name: "r", files: ["DESCRIPTION"] },
  { name: "mojo", files: [] },
];

export function detectRuntime(cwd: string): RuntimeInfo | null {
  for (const marker of RUNTIME_MARKERS) {
    for (const f of marker.files) {
      if (f.includes("*")) continue;
      const p = join(cwd, f);
      if (existsSync(p)) {
        let version: string | null = null;
        if (marker.versionFrom && marker.versionFrom.file === f) {
          try {
            const content = readFileSync(p, "utf8");
            const m = content.match(marker.versionFrom.regex);
            if (m && m[1]) version = m[1];
          } catch {
            // ignore
          }
        }
        return { name: marker.name, version };
      }
    }
  }
  return null;
}

export function detectRuntimes(cwd: string): RuntimeInfo[] {
  const seen = new Set<string>();
  const result: RuntimeInfo[] = [];
  for (const marker of RUNTIME_MARKERS) {
    for (const f of marker.files) {
      if (f.includes("*")) continue;
      const p = join(cwd, f);
      if (existsSync(p) && !seen.has(marker.name)) {
        seen.add(marker.name);
        let version: string | null = null;
        if (marker.versionFrom && marker.versionFrom.file === f) {
          try {
            const content = readFileSync(p, "utf8");
            const m = content.match(marker.versionFrom.regex);
            if (m && m[1]) version = m[1];
          } catch {
            // ignore
          }
        }
        result.push({ name: marker.name, version });
        break;
      }
    }
  }
  return result;
}

export function formatRuntime(info: RuntimeInfo): string {
  return info.version ? `via ${info.name} ${info.version}` : `via ${info.name}`;
}
