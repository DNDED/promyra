import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { listSkills, loadPrompt } from "@pi/skill-bundle";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_BUNDLE_ROOT = join(__dirname, "..", "..", "..", "..", "packages", "skill-bundle");

export async function doctor(): Promise<void> {
  const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

  try {
    checks.push({
      name: "git installed",
      ok: true,
      detail: execSync("git --version", { encoding: "utf8" }).trim(),
    });
  } catch (e) {
    checks.push({ name: "git installed", ok: false, detail: (e as Error).message });
  }

  checks.push({
    name: "current dir is a git repo",
    ok: existsSync(join(process.cwd(), ".git")),
    detail: existsSync(join(process.cwd(), ".git")) ? "yes" : "no — run from inside a repo",
  });

  try {
    const skills = await listSkills(SKILL_BUNDLE_ROOT);
    const allHaveBody = skills.every(s => s.description.length > 0);
    checks.push({ name: "@pi/skill-bundle loads", ok: allHaveBody, detail: `${skills.length} skills, all with descriptions` });
  } catch (e) {
    checks.push({ name: "@pi/skill-bundle loads", ok: false, detail: (e as Error).message });
  }

  try {
    const prompt = await loadPrompt(SKILL_BUNDLE_ROOT);
    checks.push({ name: "default system prompt", ok: prompt.length > 0, detail: `${prompt.length} chars` });
  } catch (e) {
    checks.push({ name: "default system prompt", ok: false, detail: (e as Error).message });
  }

  console.log("\npi-pro doctor:\n");
  for (const c of checks) {
    console.log(`  ${c.ok ? "✓" : "✗"} ${c.name} — ${c.detail}`);
  }
  const allOk = checks.every(c => c.ok);
  console.log(`\n${allOk ? "All checks passed." : "Some checks failed."}`);
  process.exit(allOk ? 0 : 1);
}
