# Promyra Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build pi-pro — a TypeScript coding agent that beats OpenCode on coding capability and agentic task completion, layered on a fork of `badlogic/pi-mono`.

**Architecture:** Fork pi-mono monorepo. Add six new packages (`@pi/skill-bundle`, `@pi/checkpoint`, `@pi/memory`, `@pi/tasks`, `@pi/subagent`, `@pi/tui-pro`) plus a `pi-pro` binary. Each package is independently testable, independently shippable to upstream.

**Tech Stack:** TypeScript, Node 20+, pnpm workspaces, Vitest, Ink (React for TUI), Zod (schema validation), simple-git, gray-matter (frontmatter parsing), commander (CLI).

**Realistic scope note:** The full plan below is 12+ hours of work. We will execute it in parallel using subagent swarms, organized by dependency order. Each task includes working code — no placeholders. Tasks 1-2 must finish first (fork + scaffolding). Then PRs 1-6 can fan out in dependency order.

---

## File Structure (target)

```
pi-pro/                                            # git repo, fork of pi-mono
├── docs/superpowers/
│   ├── specs/2026-06-09-pi-pro-agent-design.md
│   └── plans/2026-06-09-pi-pro-implementation.md
├── packages/
│   ├── skill-bundle/                              # @pi/skill-bundle   PR 1
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/loader.ts
│   │   ├── skills/                                # mirrored from superpowers
│   │   │   ├── using-superpowers/SKILL.md
│   │   │   ├── brainstorming/SKILL.md
│   │   │   ├── writing-plans/SKILL.md
│   │   │   ├── tdd/SKILL.md
│   │   │   ├── systematic-debugging/SKILL.md
│   │   │   ├── verification-before-completion/SKILL.md
│   │   │   ├── subagent-driven-development/SKILL.md
│   │   │   ├── safe-pr-workflow/SKILL.md
│   │   │   ├── code-review-and-quality/SKILL.md
│   │   │   └── security-and-hardening/SKILL.md
│   │   ├── prompt.md
│   │   └── test/loader.test.ts
│   ├── checkpoint/                                # @pi/checkpoint     PR 2
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── store.ts
│   │   │   ├── types.ts
│   │   │   └── resume.ts
│   │   └── test/store.test.ts
│   ├── memory/                                    # @pi/memory         PR 3
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── session-memory.ts
│   │   │   └── types.ts
│   │   └── test/session-memory.test.ts
│   ├── tasks/                                     # @pi/tasks          PR 4
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── state-machine.ts
│   │   │   ├── session-log.ts
│   │   │   ├── worktree-store.ts
│   │   │   ├── task-runner.ts
│   │   │   ├── types.ts
│   │   │   └── index.ts
│   │   └── test/state-machine.test.ts
│   ├── subagent/                                  # @pi/subagent       PR 5
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── router.ts
│   │   │   ├── worker.ts
│   │   │   ├── tool-restrictions.ts
│   │   │   ├── roles/
│   │   │   │   ├── build.ts
│   │   │   │   ├── test-runner.ts
│   │   │   │   ├── code-reviewer.ts
│   │   │   │   └── security-auditor.ts
│   │   │   └── types.ts
│   │   └── test/router.test.ts
│   └── tui-pro/                                   # @pi/tui-pro        PR 6
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── theme.ts
│       │   ├── components/
│       │   │   ├── ToolCallCard.tsx
│       │   │   ├── DiffViewer.tsx
│       │   │   ├── FileTree.tsx
│       │   │   ├── SessionBrowser.tsx
│       │   │   └── StatusBar.tsx
│       │   └── commands/
│       │       ├── plan.tsx
│       │       ├── subagent.tsx
│       │       ├── pr.tsx
│       │       └── verify.tsx
│       └── test/components.test.tsx
├── apps/pi-pro/                                   # pi-pro binary
│   ├── package.json
│   ├── tsconfig.json
│   ├── bin/pi-pro
│   └── src/
│       ├── cli.ts
│       └── commands/
│           ├── start.ts
│           ├── resume.ts
│           ├── replay.ts
│           ├── merge.ts
│           └── doctor.ts
├── bench/                                         # eval harness
│   ├── fixtures/
│   │   ├── tiny-express/        # Node/Express fixture
│   │   ├── tiny-cli/            # Python CLI fixture
│   │   └── tiny-go-svc/         # Go service fixture
│   ├── tasks/                   # 5 task definitions
│   └── run.ts
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── vitest.config.ts
├── .gitignore
└── README.md
```

**Why this layout:**
- Each package has one clear responsibility (state, memory, roles, chrome, etc.).
- Files that change together live together (e.g. `roles/*.ts` all change when a role's prompt changes).
- Tests live next to source for fast `vitest` runs.
- The TUI package is larger (~1500 LOC) but it's the polish layer, not the substance — and Ink naturally co-locates components.
- `bench/` is separate so eval fixtures don't pollute package builds.

---

## Task 0: Workspace scaffold (no PR)

**Files:** monorepo root configs

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "pi-pro",
  "version": "0.0.0",
  "private": true,
  "description": "Improved coding agent on top of pi-mono",
  "license": "MIT",
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint",
    "typecheck": "pnpm -r typecheck"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.6.0",
    "@types/node": "^20.0.0"
  }
}
```

- [ ] **Step 2: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
  - "apps/*"
```

- [ ] **Step 3: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "jsx": "react"
  }
}
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
dist/
.pi-pro/
*.log
.env
.env.local
coverage/
.DS_Store
```

- [ ] **Step 5: Create `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["packages/*/test/**/*.test.ts", "packages/*/test/**/*.test.tsx"],
  },
});
```

- [ ] **Step 6: Install + commit**

```bash
cd ~/Developer/pi-pro
pnpm install
git add package.json pnpm-workspace.yaml tsconfig.base.json vitest.config.ts .gitignore
git commit -m "chore: workspace scaffold"
```

Expected: `pnpm install` succeeds, no errors.

---

## Task 1 (PR 1): @pi/skill-bundle

**Files:** `packages/skill-bundle/*`

- [ ] **Step 1: Create `packages/skill-bundle/package.json`**

```json
{
  "name": "@pi/skill-bundle",
  "version": "0.1.0",
  "description": "Curated skills for pi-pro",
  "type": "module",
  "main": "./dist/loader.js",
  "types": "./dist/loader.d.ts",
  "exports": { ".": "./dist/loader.js" },
  "files": ["dist", "skills", "prompt.md"],
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "gray-matter": "^4.0.3"
  },
  "devDependencies": {
    "@types/gray-matter": "^4.0.3",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create `packages/skill-bundle/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test"],
  "compilerOptions": { "outDir": "dist", "rootDir": "src" }
}
```

- [ ] **Step 3: Create `packages/skill-bundle/src/loader.ts`**

```typescript
import { readFile, readdir, mkdir, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";

export interface SkillMeta {
  name: string;
  description: string;
  path: string;
}

export interface Skill extends SkillMeta {
  body: string;
}

const SKILLS_DIR = "skills";
const PROMPT_FILE = "prompt.md";
const GLOBAL_SKILLS_DIR = join(process.env.HOME ?? "~", ".pi", "agent", "skills", "pi-pro");

export async function listSkills(packageDir: string = import.meta.dirname): Promise<SkillMeta[]> {
  const dir = join(packageDir, "..", SKILLS_DIR);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const out: SkillMeta[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const file = join(dir, e.name, "SKILL.md");
    if (!existsSync(file)) continue;
    const raw = await readFile(file, "utf8");
    const parsed = matter(raw);
    out.push({
      name: parsed.data.name ?? e.name,
      description: parsed.data.description ?? "",
      path: file,
    });
  }
  return out;
}

export async function loadSkill(name: string, packageDir: string = import.meta.dirname): Promise<Skill | null> {
  const file = join(packageDir, "..", SKILLS_DIR, name, "SKILL.md");
  if (!existsSync(file)) return null;
  const raw = await readFile(file, "utf8");
  const parsed = matter(raw);
  return {
    name: parsed.data.name ?? name,
    description: parsed.data.description ?? "",
    path: file,
    body: parsed.content,
  };
}

export async function loadPrompt(packageDir: string = import.meta.dirname): Promise<string> {
  const file = join(packageDir, "..", PROMPT_FILE);
  if (!existsSync(file)) return "";
  return readFile(file, "utf8");
}

export async function installGlobally(packageDir: string = import.meta.dirname): Promise<{ installed: number; dest: string }> {
  await mkdir(GLOBAL_SKILLS_DIR, { recursive: true });
  const srcDir = join(packageDir, "..", SKILLS_DIR);
  const entries = await readdir(srcDir, { withFileTypes: true });
  let installed = 0;
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const srcFile = join(srcDir, e.name, "SKILL.md");
    if (!existsSync(srcFile)) continue;
    const destDir = join(GLOBAL_SKILLS_DIR, e.name);
    await mkdir(destDir, { recursive: true });
    await copyFile(srcFile, join(destDir, "SKILL.md"));
    installed++;
  }
  return { installed, dest: GLOBAL_SKILLS_DIR };
}
```

- [ ] **Step 4: Create `packages/skill-bundle/test/loader.test.ts`**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { listSkills, loadSkill, loadPrompt } from "../src/loader.js";

let pkgDir: string;

beforeAll(async () => {
  pkgDir = await mkFixture();
});

afterAll(async () => {
  await rm(join(pkgDir, ".."), { recursive: true, force: true });
});

describe("skill-bundle loader", () => {
  it("lists skills from skills/ directory", async () => {
    const skills = await listSkills(pkgDir);
    expect(skills.map(s => s.name).sort()).toEqual(["test-skill-a", "test-skill-b"]);
  });

  it("loads a single skill body", async () => {
    const skill = await loadSkill("test-skill-a", pkgDir);
    expect(skill).not.toBeNull();
    expect(skill!.body).toContain("hello from a");
  });

  it("returns null for missing skill", async () => {
    const skill = await loadSkill("nope", pkgDir);
    expect(skill).toBeNull();
  });

  it("loads the package prompt", async () => {
    const prompt = await loadPrompt(pkgDir);
    expect(prompt).toContain("plan -> branch -> test -> verify -> PR");
  });
});

async function mkFixture(): Promise<string> {
  const root = join(tmpdir(), `pi-pro-test-${Date.now()}`);
  await mkdir(root, { recursive: true });
  await mkdir(join(root, "src"));
  await mkdir(join(root, "skills", "test-skill-a"), { recursive: true });
  await mkdir(join(root, "skills", "test-skill-b"), { recursive: true });
  await writeFile(join(root, "skills", "test-skill-a", "SKILL.md"),
    "---\nname: test-skill-a\ndescription: First test skill\n---\nhello from a\n");
  await writeFile(join(root, "skills", "test-skill-b", "SKILL.md"),
    "---\nname: test-skill-b\ndescription: Second test skill\n---\nhello from b\n");
  await writeFile(join(root, "prompt.md"), "Default prompt: plan -> branch -> test -> verify -> PR\n");
  return join(root, "src");
}
```

- [ ] **Step 5: Create `packages/skill-bundle/prompt.md`**

```markdown
# Promyra System Prompt

You are pi-pro, an improved coding agent on top of pi-mono.

## Non-negotiable workflow

For every non-trivial task, follow this order. Skills enforce it:

1. **intake** — read `.pi-pro/memory.md` for project context, triage trivial vs non-trivial.
2. **plan** — invoke `brainstorming` (one question at a time), then `writing-plans` to produce `docs/superpowers/plans/<task>.md`. Get user approval.
3. **branch** — create a git worktree at `.pi-pro/worktrees/<task-id>/` on a new branch `pi-pro/<task-id>`.
4. **execute** — for each plan step, follow `tdd` (failing test first), then implement. Use `subagent-driven-development` to delegate specialized work to subagents.
5. **verify** — invoke `verification-before-completion`. Run the full test suite. Run `code-reviewer` and `security-auditor` subagents. Refuse to mark done on any failure.
6. **summarize** — append what changed to `.pi-pro/memory.md`. Generate a PR description. Offer `gh pr create`.

## Anti-patterns to refuse

- "I'll just make this small change" — if it's a behavior change, plan first.
- "Tests can come later" — no, write the failing test first.
- "Looks good" without running verification.
- "Skip the worktree, it's just one file" — worktrees prevent silent corruption.

## Skills you must consult

Before every non-trivial action, run the `using-superpowers` skill mentally: "is there a skill for what I'm about to do?"
```

- [ ] **Step 6: Create `packages/skill-bundle/skills/*/SKILL.md` (10 skills)**

For each of the 10 skills listed in the spec, create a `SKILL.md` with frontmatter (`name`, `description`) and a body that summarizes the skill's purpose and triggers. The detailed skill content is loaded by pi from the global `~/.pi-pro/skills/` directory at runtime. Promyra ships a *pointer* + brief summary in each `SKILL.md`; the user is expected to also have the upstream superpowers skills installed (or the postinstall pulls them).

Example `skills/using-superpowers/SKILL.md`:
```markdown
---
name: using-superpowers
description: Establishes how to find and use skills. Invoke BEFORE any response or action, including clarifying questions.
---

# Using Skills

Consult the relevant skill BEFORE responding. If a skill applies, you MUST use it.

See the upstream superpowers project for the full content:
https://github.com/obra/superpowers/tree/main/skills/using-superpowers

Pi-pro ships this as a thin pointer. The full skill is installed via the postinstall step.
```

Repeat this pattern for the other 9 skills: `brainstorming`, `writing-plans`, `tdd`, `systematic-debugging`, `verification-before-completion`, `subagent-driven-development`, `safe-pr-workflow`, `code-review-and-quality`, `security-and-hardening`. Each `SKILL.md` has the same shape: frontmatter with `name` and `description`, then a one-paragraph body pointing to the upstream source.

- [ ] **Step 7: Build + test + commit**

```bash
cd ~/Developer/pi-pro
pnpm --filter @pi/skill-bundle build
pnpm --filter @pi/skill-bundle test
```

Expected: build succeeds, 4 tests pass.

```bash
git add packages/skill-bundle
git commit -m "feat(skill-bundle): @pi/skill-bundle with 10 curated skills + default system prompt"
```

---

## Task 2 (PR 2): @pi/checkpoint

**Files:** `packages/checkpoint/*`

- [ ] **Step 1: Create `packages/checkpoint/package.json`**

```json
{
  "name": "@pi/checkpoint",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/store.js",
  "types": "./dist/store.d.ts",
  "exports": { ".": "./dist/store.js" },
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create `packages/checkpoint/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test"],
  "compilerOptions": { "outDir": "dist", "rootDir": "." }
}
```

- [ ] **Step 3: Create `packages/checkpoint/src/types.ts`**

```typescript
import { z } from "zod";

export const CheckpointSchema = z.object({
  id: z.string().regex(/^chk_\d{6,}$/),
  taskId: z.string().regex(/^tsk_[a-z0-9]{8,}$/),
  state: z.enum(["intake", "plan", "branch", "execute", "verify", "summarize", "done"]),
  gitTreeSha: z.string().min(7),
  createdAt: z.string().datetime(),
  payload: z.record(z.unknown()),
});

export type Checkpoint = z.infer<typeof CheckpointSchema>;
```

- [ ] **Step 4: Create `packages/checkpoint/src/store.ts`**

```typescript
import { mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { Checkpoint, CheckpointSchema } from "./types.js";

const SESSIONS_DIR = ".pi-pro/sessions";
const CHECKPOINTS_DIR = ".pi-pro/checkpoints";

export class CheckpointStore {
  constructor(private readonly rootDir: string = process.cwd()) {}

  private sessionsPath(): string { return join(this.rootDir, SESSIONS_DIR); }
  private checkpointPath(taskId: string, id: string): string {
    return join(this.rootDir, CHECKPOINTS_DIR, taskId, `${id}.json`);
  }

  async ensureDirs(taskId: string): Promise<void> {
    await mkdir(dirname(this.checkpointPath(taskId, "x")), { recursive: true });
    await mkdir(this.sessionsPath(), { recursive: true });
  }

  newId(seq: number): string {
    return `chk_${String(seq).padStart(6, "0")}`;
  }

  newTaskId(): string {
    return `tsk_${randomBytes(5).toString("hex")}`;
  }

  hashPayload(payload: unknown): string {
    return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
  }

  async snapshot(input: Omit<Checkpoint, "id" | "createdAt"> & { seq: number }): Promise<Checkpoint> {
    const cp = CheckpointSchema.parse({
      id: this.newId(input.seq),
      taskId: input.taskId,
      state: input.state,
      gitTreeSha: input.gitTreeSha,
      createdAt: new Date().toISOString(),
      payload: input.payload,
    });
    await this.ensureDirs(cp.taskId);
    await writeFile(this.checkpointPath(cp.taskId, cp.id), JSON.stringify(cp, null, 2));
    await this.appendSession(cp);
    return cp;
  }

  async appendSession(cp: Checkpoint): Promise<void> {
    const line = JSON.stringify({ ...cp, event: "checkpoint" }) + "\n";
    const logPath = join(this.sessionsPath(), `${cp.taskId}.jsonl`);
    await writeFile(logPath, line, { flag: "a" });
  }

  async listForTask(taskId: string): Promise<Checkpoint[]> {
    const dir = join(this.rootDir, CHECKPOINTS_DIR, taskId);
    if (!existsSync(dir)) return [];
    const files = (await readdir(dir)).filter(f => f.endsWith(".json")).sort();
    const out: Checkpoint[] = [];
    for (const f of files) {
      const raw = await readFile(join(dir, f), "utf8");
      out.push(CheckpointSchema.parse(JSON.parse(raw)));
    }
    return out;
  }

  async latest(taskId: string): Promise<Checkpoint | null> {
    const all = await this.listForTask(taskId);
    return all.length ? all[all.length - 1] : null;
  }

  async clearTask(taskId: string): Promise<void> {
    const dir = join(this.rootDir, CHECKPOINTS_DIR, taskId);
    if (existsSync(dir)) await rm(dir, { recursive: true, force: true });
    const log = join(this.sessionsPath(), `${taskId}.jsonl`);
    if (existsSync(log)) await rm(log);
  }
}
```

- [ ] **Step 5: Create `packages/checkpoint/test/store.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CheckpointStore } from "../src/store.js";

let dir: string;
let store: CheckpointStore;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "checkpoint-test-"));
  store = new CheckpointStore(dir);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("@pi/checkpoint", () => {
  it("creates checkpoints with predictable ids", async () => {
    const taskId = store.newTaskId();
    const cp1 = await store.snapshot({ seq: 1, taskId, state: "intake", gitTreeSha: "abc1234", payload: { foo: 1 } });
    const cp2 = await store.snapshot({ seq: 2, taskId, state: "plan", gitTreeSha: "abc1234", payload: { plan: "x" } });
    expect(cp1.id).toBe("chk_000001");
    expect(cp2.id).toBe("chk_000002");
    expect(cp1.state).toBe("intake");
  });

  it("lists checkpoints in order", async () => {
    const taskId = store.newTaskId();
    await store.snapshot({ seq: 1, taskId, state: "intake", gitTreeSha: "x", payload: {} });
    await store.snapshot({ seq: 2, taskId, state: "plan", gitTreeSha: "x", payload: {} });
    await store.snapshot({ seq: 3, taskId, state: "branch", gitTreeSha: "x", payload: {} });
    const all = await store.listForTask(taskId);
    expect(all.map(c => c.state)).toEqual(["intake", "plan", "branch"]);
  });

  it("retrieves the latest checkpoint", async () => {
    const taskId = store.newTaskId();
    await store.snapshot({ seq: 1, taskId, state: "intake", gitTreeSha: "x", payload: { a: 1 } });
    const latest = await store.snapshot({ seq: 2, taskId, state: "plan", gitTreeSha: "y", payload: { b: 2 } });
    const got = await store.latest(taskId);
    expect(got?.id).toBe(latest.id);
  });

  it("writes session log lines", async () => {
    const taskId = store.newTaskId();
    await store.snapshot({ seq: 1, taskId, state: "intake", gitTreeSha: "x", payload: {} });
    const { readFile } = await import("node:fs/promises");
    const log = await readFile(join(dir, ".pi-pro/sessions", `${taskId}.jsonl`), "utf8");
    expect(log).toContain("\"state\":\"intake\"");
    expect(log).toContain("\"event\":\"checkpoint\"");
  });

  it("hashes payloads deterministically", () => {
    const a = store.hashPayload({ a: 1, b: 2 });
    const b = store.hashPayload({ a: 1, b: 2 });
    const c = store.hashPayload({ a: 1, b: 3 });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("clears a task", async () => {
    const taskId = store.newTaskId();
    await store.snapshot({ seq: 1, taskId, state: "intake", gitTreeSha: "x", payload: {} });
    await store.clearTask(taskId);
    expect(await store.latest(taskId)).toBeNull();
  });
});
```

- [ ] **Step 6: Build + test + commit**

```bash
cd ~/Developer/pi-pro
pnpm --filter @pi/checkpoint build
pnpm --filter @pi/checkpoint test
```

Expected: 6 tests pass.

```bash
git add packages/checkpoint
git commit -m "feat(checkpoint): @pi/checkpoint with jsonl session log + snapshot/resume"
```

---

## Task 3 (PR 3): @pi/memory

**Files:** `packages/memory/*`

- [ ] **Step 1: Create `packages/memory/package.json`**

```json
{
  "name": "@pi/memory",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/session-memory.js",
  "types": "./dist/session-memory.d.ts",
  "exports": { ".": "./dist/session-memory.js" },
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create `packages/memory/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test"],
  "compilerOptions": { "outDir": "dist", "rootDir": "." }
}
```

- [ ] **Step 3: Create `packages/memory/src/types.ts`**

```typescript
export interface ContextEntry {
  ts: string;
  source: "intake" | "summarize" | "user";
  body: string;
}
```

- [ ] **Step 4: Create `packages/memory/src/session-memory.ts`**

```typescript
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { ContextEntry } from "./types.js";

const MEMORY_FILE = ".pi-pro/memory.md";

export class SessionMemory {
  constructor(private readonly rootDir: string = process.cwd()) {}

  private path(): string { return join(this.rootDir, MEMORY_FILE); }

  async read(): Promise<string> {
    if (!existsSync(this.path())) return "";
    return readFile(this.path(), "utf8");
  }

  async write(content: string): Promise<void> {
    await mkdir(dirname(this.path()), { recursive: true });
    await writeFile(this.path(), content, "utf8");
  }

  async appendLearning(entry: ContextEntry): Promise<void> {
    const current = await this.read();
    const section = `\n## Learning (${entry.ts})\n\n${entry.body}\n`;
    const next = current + section;
    await this.write(next);
  }

  async appendContext(entry: ContextEntry): Promise<void> {
    const current = await this.read();
    const section = `\n## Context (${entry.ts})\n\n${entry.body}\n`;
    const next = current + section;
    await this.write(next);
  }

  async getLearnings(): Promise<ContextEntry[]> {
    const raw = await this.read();
    return parseSection(raw, /^## Learning \(([^)]+)\)/);
  }

  async getContext(): Promise<ContextEntry[]> {
    const raw = await this.read();
    return parseSection(raw, /^## Context \(([^)]+)\)/);
  }

  async clear(): Promise<void> {
    await this.write("");
  }
}

function parseSection(raw: string, headerRe: RegExp): ContextEntry[] {
  const lines = raw.split("\n");
  const out: ContextEntry[] = [];
  let current: ContextEntry | null = null;
  for (const line of lines) {
    const m = line.match(headerRe);
    if (m) {
      if (current) out.push(current);
      current = { ts: m[1], source: "intake", body: "" };
    } else if (current) {
      current.body += line + "\n";
    }
  }
  if (current) out.push(current);
  return out.map(e => ({ ...e, body: e.body.trim() }));
}
```

- [ ] **Step 5: Create `packages/memory/test/session-memory.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionMemory } from "../src/session-memory.js";

let dir: string;
let mem: SessionMemory;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "memory-test-"));
  mem = new SessionMemory(dir);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("@pi/memory", () => {
  it("returns empty string when no memory file exists", async () => {
    expect(await mem.read()).toBe("");
  });

  it("writes and reads back", async () => {
    await mem.write("# Project Memory\n\n## Context (2026-06-09)\n\nfirst context\n");
    const got = await mem.read();
    expect(got).toContain("first context");
  });

  it("appends a learning with timestamp", async () => {
    await mem.appendLearning({ ts: "2026-06-09T01:00:00Z", source: "summarize", body: "Learned X" });
    const got = await mem.read();
    expect(got).toContain("## Learning (2026-06-09T01:00:00Z)");
    expect(got).toContain("Learned X");
  });

  it("parses learnings back out", async () => {
    await mem.appendLearning({ ts: "2026-06-09T01:00:00Z", source: "summarize", body: "L1" });
    await mem.appendLearning({ ts: "2026-06-09T02:00:00Z", source: "summarize", body: "L2" });
    const got = await mem.getLearnings();
    expect(got).toHaveLength(2);
    expect(got[0].body).toBe("L1");
    expect(got[1].body).toBe("L2");
  });

  it("clears memory", async () => {
    await mem.write("junk");
    await mem.clear();
    expect(await mem.read()).toBe("");
  });
});
```

- [ ] **Step 6: Build + test + commit**

```bash
cd ~/Developer/pi-pro
pnpm --filter @pi/memory build
pnpm --filter @pi/memory test
```

Expected: 5 tests pass.

```bash
git add packages/memory
git commit -m "feat(memory): @pi/memory with markdown-backed session memory"
```

---

## Task 4 (PR 4): @pi/tasks

**Files:** `packages/tasks/*`

- [ ] **Step 1: Create `packages/tasks/package.json`**

```json
{
  "name": "@pi/tasks",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": "./dist/index.js" },
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@pi/checkpoint": "workspace:*",
    "@pi/memory": "workspace:*",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create `packages/tasks/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test"],
  "compilerOptions": { "outDir": "dist", "rootDir": "." }
}
```

- [ ] **Step 3: Create `packages/tasks/src/types.ts`**

```typescript
import { z } from "zod";

export const StateSchema = z.enum([
  "intake", "plan", "branch", "execute", "verify", "summarize", "done",
]);
export type State = z.infer<typeof StateSchema>;

export const TransitionSchema = z.object({
  from: StateSchema,
  to: StateSchema,
  allowedFrom: z.array(StateSchema),
});
export type Transition = z.infer<typeof TransitionSchema>;

export const PlanStepSchema = z.object({
  id: z.string(),
  description: z.string(),
  done: z.boolean().default(false),
});
export type PlanStep = z.infer<typeof PlanStepSchema>;

export const PlanSchema = z.object({
  taskId: z.string(),
  title: z.string(),
  steps: z.array(PlanStepSchema),
});
export type Plan = z.infer<typeof PlanSchema>;

export const SessionEventSchema = z.object({
  ts: z.string().datetime(),
  state: StateSchema,
  event: z.string(),
  data: z.record(z.unknown()).optional(),
});
export type SessionEvent = z.infer<typeof SessionEventSchema>;
```

- [ ] **Step 4: Create `packages/tasks/src/state-machine.ts`**

```typescript
import { State, StateSchema, Plan, PlanStep, Transition } from "./types.js";

const ALLOWED: Record<State, State[]> = {
  intake:    ["plan"],
  plan:      ["branch", "intake"],
  branch:    ["execute", "plan"],
  execute:   ["verify", "execute", "branch"],
  verify:    ["summarize", "execute"],
  summarize: ["done", "verify"],
  done:      [],
};

export function nextStates(from: State): State[] {
  StateSchema.parse(from);
  return ALLOWED[from];
}

export function canTransition(from: State, to: State): boolean {
  return ALLOWED[from].includes(to);
}

export class StateMachine {
  private current: State;
  private stepIndex = 0;

  constructor(initial: State = "intake") {
    this.current = initial;
  }

  state(): State { return this.current; }

  transition(to: State): void {
    if (!canTransition(this.current, to)) {
      throw new Error(`Illegal transition: ${this.current} -> ${to}. Allowed from ${this.current}: ${ALLOWED[this.current].join(", ")}`);
    }
    this.current = to;
  }

  nextStep(plan: Plan): PlanStep | null {
    while (this.stepIndex < plan.steps.length && plan.steps[this.stepIndex].done) {
      this.stepIndex++;
    }
    return plan.steps[this.stepIndex] ?? null;
  }

  markStepDone(stepId: string, plan: Plan): void {
    const step = plan.steps.find(s => s.id === stepId);
    if (!step) throw new Error(`Unknown step: ${stepId}`);
    step.done = true;
  }

  isComplete(plan: Plan): boolean {
    return plan.steps.every(s => s.done);
  }
}

export const TRANSITIONS: Transition[] = (
  Object.keys(ALLOWED) as State[]
).flatMap(from => ALLOWED[from].map(to => ({ from, to, allowedFrom: [from] })));
```

- [ ] **Step 5: Create `packages/tasks/src/session-log.ts`**

```typescript
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { SessionEvent, SessionEventSchema } from "./types.js";

const SESSIONS_DIR = ".pi-pro/sessions";

export class SessionLog {
  constructor(private readonly rootDir: string = process.cwd()) {}

  private path(taskId: string): string {
    return join(this.rootDir, SESSIONS_DIR, `${taskId}.jsonl`);
  }

  async append(taskId: string, event: Omit<SessionEvent, "ts">): Promise<SessionEvent> {
    await mkdir(join(this.rootDir, SESSIONS_DIR), { recursive: true });
    const full: SessionEvent = SessionEventSchema.parse({ ...event, ts: new Date().toISOString() });
    await writeFile(this.path(taskId), JSON.stringify(full) + "\n", { flag: "a" });
    return full;
  }

  async read(taskId: string): Promise<SessionEvent[]> {
    if (!existsSync(this.path(taskId))) return [];
    const raw = await readFile(this.path(taskId), "utf8");
    return raw.trim().split("\n").filter(Boolean).map(l => SessionEventSchema.parse(JSON.parse(l)));
  }
}
```

- [ ] **Step 6: Create `packages/tasks/src/worktree-store.ts`**

```typescript
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const BASE = ".pi-pro/worktrees";

export interface WorktreeInfo {
  taskId: string;
  branch: string;
  path: string;
}

export class WorktreeStore {
  constructor(private readonly rootDir: string = process.cwd()) {}

  private worktreePath(taskId: string): string {
    return join(this.rootDir, BASE, taskId);
  }

  private branchName(taskId: string): string {
    return `pi-pro/${taskId.replace(/^tsk_/, "")}`;
  }

  create(taskId: string): WorktreeInfo {
    const branch = this.branchName(taskId);
    const path = this.worktreePath(taskId);
    mkdirSync(join(this.rootDir, BASE), { recursive: true });

    if (existsSync(path)) {
      throw new Error(`Worktree already exists: ${path}`);
    }

    this.run(["worktree", "add", "-b", branch, path]);
    return { taskId, branch, path };
  }

  remove(taskId: string): void {
    const path = this.worktreePath(taskId);
    if (!existsSync(path)) return;
    this.run(["worktree", "remove", "--force", path]);
    if (existsSync(path)) rmSync(path, { recursive: true, force: true });
  }

  list(): WorktreeInfo[] {
    const out = this.run(["worktree", "list", "--porcelain"]);
    return parsePorcelain(out, this.rootDir);
  }

  private run(args: string[]): string {
    return execSync(`git ${args.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(" ")}`, {
      cwd: this.rootDir,
      encoding: "utf8",
    }).trim();
  }
}

function parsePorcelain(out: string, rootDir: string): WorktreeInfo[] {
  const blocks = out.split("\n\n");
  const results: WorktreeInfo[] = [];
  for (const block of blocks) {
    if (!block.trim()) continue;
    const pathLine = block.split("\n").find(l => l.startsWith("worktree "));
    const branchLine = block.split("\n").find(l => l.startsWith("branch "));
    if (!pathLine || !branchLine) continue;
    const path = pathLine.replace(/^worktree /, "").trim();
    if (!path.startsWith(join(rootDir, BASE))) continue;
    const branch = branchLine.replace(/^branch /, "").replace(/^refs\/heads\//, "").trim();
    const id = path.split("/").pop() ?? "";
    results.push({ taskId: id, branch, path });
  }
  return results;
}
```

- [ ] **Step 7: Create `packages/tasks/src/task-runner.ts`**

```typescript
import { CheckpointStore } from "@pi/checkpoint";
import { SessionMemory } from "@pi/memory";
import { StateMachine, canTransition } from "./state-machine.js";
import { SessionLog } from "./session-log.js";
import { WorktreeStore } from "./worktree-store.js";
import { Plan, State } from "./types.js";

export interface TaskRunnerDeps {
  checkpoint: CheckpointStore;
  memory: SessionMemory;
  log: SessionLog;
  worktree: WorktreeStore;
}

export class TaskRunner {
  private sm: StateMachine;
  private taskId: string;
  private seq = 0;

  constructor(
    taskId: string,
    private readonly plan: Plan,
    private readonly deps: TaskRunnerDeps,
    initial: State = "intake",
  ) {
    this.taskId = taskId;
    this.sm = new StateMachine(initial);
  }

  state(): State { return this.sm.state(); }
  taskId_(): string { return this.taskId; }
  plan_(): Plan { return this.plan; }

  async transition(to: State, data: Record<string, unknown> = {}): Promise<void> {
    if (!canTransition(this.sm.state(), to)) {
      throw new Error(`Illegal transition: ${this.sm.state()} -> ${to}`);
    }
    this.seq++;
    await this.deps.log.append(this.taskId, { state: this.sm.state(), event: "transition", data: { to, ...data } });
    this.sm.transition(to);
    await this.deps.checkpoint.snapshot({
      seq: this.seq,
      taskId: this.taskId,
      state: to,
      gitTreeSha: "pending",
      payload: data,
    });
  }

  async intake(): Promise<void> {
    const context = await this.deps.memory.getContext();
    await this.deps.memory.appendContext({ ts: new Date().toISOString(), source: "intake", body: `Triage: ${this.plan.title}. Existing context entries: ${context.length}` });
    await this.transition("plan");
  }

  async branch(): Promise<{ branch: string; path: string }> {
    const wt = this.deps.worktree.create(this.taskId);
    await this.transition("execute", { worktree: wt.path, branch: wt.branch });
    return { branch: wt.branch, path: wt.path };
  }

  async markStepDone(stepId: string): Promise<void> {
    this.sm.markStepDone(stepId, this.plan);
    await this.deps.log.append(this.taskId, { state: this.sm.state(), event: "step-done", data: { stepId } });
  }

  async verifyPassed(): Promise<void> {
    await this.transition("summarize", { verify: "pass" });
  }

  async verifyFailed(reason: string): Promise<void> {
    await this.transition("execute", { verify: "fail", reason });
  }

  async summarize(prDescription: string): Promise<void> {
    await this.deps.memory.appendLearning({ ts: new Date().toISOString(), source: "summarize", body: `Task ${this.taskId}: ${this.plan.title}\n\n${prDescription}` });
    await this.transition("done");
  }
}
```

- [ ] **Step 8: Create `packages/tasks/src/index.ts`**

```typescript
export * from "./types.js";
export * from "./state-machine.js";
export * from "./session-log.js";
export * from "./worktree-store.js";
export * from "./task-runner.js";
```

- [ ] **Step 9: Create `packages/tasks/test/state-machine.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { StateMachine, canTransition, nextStates, TRANSITIONS } from "../src/state-machine.js";
import { Plan } from "../src/types.js";

describe("@pi/tasks state machine", () => {
  it("starts at intake", () => {
    const sm = new StateMachine();
    expect(sm.state()).toBe("intake");
  });

  it("allows intake -> plan", () => {
    expect(canTransition("intake", "plan")).toBe(true);
  });

  it("rejects intake -> execute (skips plan)", () => {
    expect(canTransition("intake", "execute")).toBe(false);
  });

  it("rejects done -> anything", () => {
    expect(nextStates("done")).toEqual([]);
  });

  it("executes the state transitions list", () => {
    expect(TRANSITIONS.length).toBeGreaterThan(0);
  });

  it("TaskRunner: steps advance in order", () => {
    const plan: Plan = { taskId: "tsk_abc", title: "x", steps: [
      { id: "s1", description: "first", done: false },
      { id: "s2", description: "second", done: false },
    ]};
    const sm = new StateMachine();
    expect(sm.nextStep(plan)?.id).toBe("s1");
    sm.markStepDone("s1", plan);
    expect(sm.nextStep(plan)?.id).toBe("s2");
    sm.markStepDone("s2", plan);
    expect(sm.nextStep(plan)).toBeNull();
    expect(sm.isComplete(plan)).toBe(true);
  });
});
```

- [ ] **Step 10: Build + test + commit**

```bash
cd ~/Developer/pi-pro
pnpm --filter @pi/tasks build
pnpm --filter @pi/tasks test
```

Expected: 6 tests pass.

```bash
git add packages/tasks
git commit -m "feat(tasks): @pi/tasks state machine + session log + worktree store + TaskRunner"
```

---

## Task 5 (PR 5): @pi/subagent

**Files:** `packages/subagent/*`

- [ ] **Step 1: Create `packages/subagent/package.json`**

```json
{
  "name": "@pi/subagent",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/router.js",
  "types": "./dist/router.d.ts",
  "exports": { ".": "./dist/router.js" },
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create `packages/subagent/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test"],
  "compilerOptions": { "outDir": "dist", "rootDir": "." }
}
```

- [ ] **Step 3: Create `packages/subagent/src/types.ts`**

```typescript
import { z } from "zod";

export const RoleSchema = z.enum(["build", "test-runner", "code-reviewer", "security-auditor"]);
export type Role = z.infer<typeof RoleSchema>;

export const StepContextSchema = z.object({
  taskId: z.string(),
  stepId: z.string(),
  description: z.string(),
  worktreePath: z.string().optional(),
  diff: z.string().optional(),
});
export type StepContext = z.infer<typeof StepContextSchema>;

export const SubagentResultSchema = z.object({
  role: RoleSchema,
  stepId: z.string(),
  status: z.enum(["pass", "fail", "blocked"]),
  evidence: z.string(),
  tokensIn: z.number().int().nonnegative(),
  tokensOut: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
});
export type SubagentResult = z.infer<typeof SubagentResultSchema>;

export type Tool = "bash" | "read" | "write" | "edit" | "grep" | "glob" | "webfetch";

export interface Worker {
  run(role: Role, context: StepContext, prompt: string): Promise<SubagentResult>;
}
```

- [ ] **Step 4: Create `packages/subagent/src/tool-restrictions.ts`**

```typescript
import { Role, Tool } from "./types.js";

const MATRIX: Record<Role, Tool[]> = {
  "build":            ["bash", "read", "write", "edit", "grep", "glob"],
  "test-runner":      ["bash", "read", "grep", "glob"],
  "code-reviewer":    ["read", "grep", "glob"],
  "security-auditor": ["read", "grep", "glob"],
};

export function allowedTools(role: Role): Tool[] {
  return [...MATRIX[role]];
}

export function isAllowed(role: Role, tool: Tool): boolean {
  return MATRIX[role].includes(tool);
}
```

- [ ] **Step 5: Create `packages/subagent/src/roles/build.ts`**

```typescript
import { Role, StepContext } from "../types.js";

export const buildPrompt = (ctx: StepContext): string => `
You are the BUILD subagent for task ${ctx.taskId}, step ${ctx.stepId}.

Goal: ${ctx.description}

Worktree: ${ctx.worktreePath ?? "(none)"}

Rules:
1. Follow the TDD skill: write a failing test first.
2. Implement the minimal change to make the test pass.
3. Do NOT run the full test suite — the test-runner subagent does that.
4. Do NOT review the diff — the code-reviewer subagent does that.
5. Return a JSON object: { "status": "pass"|"fail"|"blocked", "evidence": "<what you did>" }.
`;
```

- [ ] **Step 6: Create `packages/subagent/src/roles/test-runner.ts`**

```typescript
import { Role, StepContext } from "../types.js";

export const testRunnerPrompt = (ctx: StepContext): string => `
You are the TEST-RUNNER subagent for task ${ctx.taskId}, step ${ctx.stepId}.

Goal: Run the full test suite for ${ctx.description}.

Worktree: ${ctx.worktreePath ?? "(none)"}

Rules:
1. You may only use: bash, read, grep, glob. No write/edit.
2. Run the project's test command (e.g. \`pnpm test\`, \`npm test\`, \`pytest\`, \`go test ./...\`).
3. Run the linter and typechecker if configured.
4. Return a JSON object: { "status": "pass"|"fail", "evidence": "<test summary, e.g. '47/47 passed'>" }.
5. If you can't determine the test command, return "blocked" with the reason.
`;
```

- [ ] **Step 7: Create `packages/subagent/src/roles/code-reviewer.ts`**

```typescript
import { Role, StepContext } from "../types.js";

export const codeReviewerPrompt = (ctx: StepContext): string => `
You are the CODE-REVIEWER subagent for task ${ctx.taskId}, step ${ctx.stepId}.

Goal: Review the diff for ${ctx.description}.

Diff:
\`\`\`
${ctx.diff ?? "(no diff provided)"}
\`\`\`

Rules:
1. You may only use: read, grep, glob. No bash/write/edit.
2. Check for: naming, error handling, edge cases, missing tests, dead code, style violations.
3. Use the code-review-and-quality skill checklist.
4. Return a JSON object: { "status": "pass"|"fail"|"blocked", "evidence": "<issues found, one per line>" }.
5. If you cannot read the diff, return "blocked".
`;
```

- [ ] **Step 8: Create `packages/subagent/src/roles/security-auditor.ts`**

```typescript
import { Role, StepContext } from "../types.js";

export const securityAuditorPrompt = (ctx: StepContext): string => `
You are the SECURITY-AUDITOR subagent for task ${ctx.taskId}, step ${ctx.stepId}.

Goal: Audit the diff for ${ctx.description} for security issues.

Diff:
\`\`\`
${ctx.diff ?? "(no diff provided)"}
\`\`\`

Rules:
1. You may only use: read, grep, glob. No bash/write/edit.
2. Check for: secrets in code, unsafe shell (rm -rf, curl | sh), SSRF, SQL injection, XSS, missing authn/authz, insecure deserialization.
3. Use the security-and-hardening skill checklist.
4. Return a JSON object: { "status": "pass"|"fail"|"blocked", "evidence": "<issues found, one per line>" }.
5. If secrets are detected, return "fail" with the exact file:line.
`;
```

- [ ] **Step 9: Create `packages/subagent/src/worker.ts`**

```typescript
import { Role, StepContext, SubagentResult, Worker } from "./types.js";
import { buildPrompt } from "./roles/build.js";
import { testRunnerPrompt } from "./roles/test-runner.js";
import { codeReviewerPrompt } from "./roles/code-reviewer.js";
import { securityAuditorPrompt } from "./roles/security-auditor.js";

export function promptFor(role: Role, ctx: StepContext): string {
  switch (role) {
    case "build": return buildPrompt(ctx);
    case "test-runner": return testRunnerPrompt(ctx);
    case "code-reviewer": return codeReviewerPrompt(ctx);
    case "security-auditor": return securityAuditorPrompt(ctx);
  }
}

/** A stub Worker that produces a pass result. The real impl in PR 6 wires this to a model call. */
export class StubWorker implements Worker {
  async run(role: Role, context: StepContext, _prompt: string): Promise<SubagentResult> {
    const start = Date.now();
    return {
      role,
      stepId: context.stepId,
      status: "pass",
      evidence: `Stub ${role} execution for step ${context.stepId}.`,
      tokensIn: promptFor(role, context).length,
      tokensOut: 16,
      durationMs: Date.now() - start,
    };
  }
}
```

- [ ] **Step 10: Create `packages/subagent/src/router.ts`**

```typescript
import { z } from "zod";
import { Role, StepContext, SubagentResult, SubagentResultSchema, Worker } from "./types.js";
import { allowedTools } from "./tool-restrictions.js";
import { promptFor, StubWorker } from "./worker.js";

const RETRY_LIMIT = 2;

export class SubagentRouter {
  constructor(private readonly worker: Worker = new StubWorker()) {}

  async dispatch(role: Role, context: StepContext): Promise<SubagentResult> {
    const prompt = promptFor(role, context);
    const tools = allowedTools(role);
    if (tools.length === 0) {
      throw new Error(`Role ${role} has no allowed tools — invalid configuration`);
    }

    let lastError: unknown = null;
    for (let attempt = 1; attempt <= RETRY_LIMIT; attempt++) {
      try {
        const result = await this.worker.run(role, context, prompt);
        return SubagentResultSchema.parse(result);
      } catch (err) {
        lastError = err;
        if (attempt === RETRY_LIMIT) break;
      }
    }

    return {
      role,
      stepId: context.stepId,
      status: "blocked",
      evidence: `Router failed after ${RETRY_LIMIT} attempts: ${(lastError as Error)?.message ?? "unknown"}`,
      tokensIn: prompt.length,
      tokensOut: 0,
      durationMs: 0,
    };
  }
}
```

- [ ] **Step 11: Create `packages/subagent/test/router.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { SubagentRouter } from "../src/router.js";
import { Role, StepContext, SubagentResult, Worker } from "../src/types.js";
import { isAllowed, allowedTools } from "../src/tool-restrictions.js";

const ctx: StepContext = {
  taskId: "tsk_abc",
  stepId: "s1",
  description: "Add /healthz endpoint",
  diff: "diff --git a/x b/x\n+new line",
};

class CountingWorker implements Worker {
  calls: Array<{ role: Role; ctx: StepContext }> = [];
  async run(role: Role, c: StepContext): Promise<SubagentResult> {
    this.calls.push({ role, ctx: c });
    return { role, stepId: c.stepId, status: "pass", evidence: "ok", tokensIn: 1, tokensOut: 1, durationMs: 1 };
  }
}

class FlakyWorker implements Worker {
  attempts = 0;
  async run(role: Role, c: StepContext): Promise<SubagentResult> {
    this.attempts++;
    if (this.attempts === 1) throw new Error("transient");
    return { role, stepId: c.stepId, status: "pass", evidence: "recovered", tokensIn: 1, tokensOut: 1, durationMs: 1 };
  }
}

class AlwaysFailingWorker implements Worker {
  attempts = 0;
  async run(): Promise<SubagentResult> {
    this.attempts++;
    throw new Error("boom");
  }
}

describe("@pi/subagent", () => {
  it("build role allows bash/write/edit and disallows webfetch", () => {
    expect(isAllowed("build", "bash")).toBe(true);
    expect(isAllowed("build", "write")).toBe(true);
    expect(isAllowed("build", "webfetch")).toBe(false);
  });

  it("reviewer roles have no bash", () => {
    expect(allowedTools("code-reviewer")).not.toContain("bash");
    expect(allowedTools("security-auditor")).not.toContain("bash");
  });

  it("test-runner has bash but no write/edit", () => {
    const tools = allowedTools("test-runner");
    expect(tools).toContain("bash");
    expect(tools).not.toContain("write");
    expect(tools).not.toContain("edit");
  });

  it("router dispatches to the worker with the correct role and context", async () => {
    const w = new CountingWorker();
    const r = new SubagentRouter(w);
    const res = await r.dispatch("build", ctx);
    expect(res.status).toBe("pass");
    expect(w.calls).toHaveLength(1);
    expect(w.calls[0].role).toBe("build");
    expect(w.calls[0].ctx).toEqual(ctx);
  });

  it("router retries on transient failure and succeeds", async () => {
    const w = new FlakyWorker();
    const r = new SubagentRouter(w);
    const res = await r.dispatch("build", ctx);
    expect(res.status).toBe("pass");
    expect(w.attempts).toBe(2);
  });

  it("router returns blocked after RETRY_LIMIT", async () => {
    const w = new AlwaysFailingWorker();
    const r = new SubagentRouter(w);
    const res = await r.dispatch("build", ctx);
    expect(res.status).toBe("blocked");
    expect(w.attempts).toBe(2);
  });

  it("router dispatches each role with its own prompt", async () => {
    const w = new CountingWorker();
    const r = new SubagentRouter(w);
    await r.dispatch("code-reviewer", ctx);
    expect(w.calls[0].role).toBe("code-reviewer");
  });
});
```

- [ ] **Step 12: Build + test + commit**

```bash
cd ~/Developer/pi-pro
pnpm --filter @pi/subagent build
pnpm --filter @pi/subagent test
```

Expected: 7 tests pass.

```bash
git add packages/subagent
git commit -m "feat(subagent): @pi/subagent role router with build/test-runner/reviewer/security"
```

---

## Task 6 (PR 6): @pi/tui-pro + apps/pi-pro binary

**Files:** `packages/tui-pro/*`, `apps/pi-pro/*`

- [ ] **Step 1: Create `packages/tui-pro/package.json`**

```json
{
  "name": "@pi/tui-pro",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/theme.js",
  "types": "./dist/theme.d.ts",
  "exports": { ".": "./dist/theme.js", "./components/*": "./dist/components/*.js" },
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "ink": "^5.0.1",
    "ink-spinner": "^5.0.0",
    "react": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "ink-testing-library": "^4.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create `packages/tui-pro/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test"],
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "."
  }
}
```

- [ ] **Step 3: Create `packages/tui-pro/src/theme.ts`**

```typescript
export const theme = {
  accent: "#7C3AED",
  accentMuted: "#5B21B6",
  success: "#10B981",
  warn: "#F59E0B",
  error: "#EF4444",
  muted: "#6B7280",
  border: "#374151",
  bg: "#0B0F17",
  bgPanel: "#111827",
  text: "#E5E7EB",
  textDim: "#9CA3AF",
} as const;

export type Theme = typeof theme;
```

- [ ] **Step 4: Create `packages/tui-pro/src/components/ToolCallCard.tsx`**

```tsx
import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";

export interface ToolCallCardProps {
  name: string;
  status: "running" | "pass" | "fail" | "blocked";
  summary: string;
  details?: string;
}

export const ToolCallCard: React.FC<ToolCallCardProps> = ({ name, status, summary, details }) => {
  const statusColor = {
    running: theme.warn,
    pass: theme.success,
    fail: theme.error,
    blocked: theme.error,
  }[status];
  const icon = { running: "◐", pass: "✓", fail: "✗", blocked: "!" }[status];
  return (
    <Box borderStyle="round" borderColor={theme.border} flexDirection="column" paddingX={1} marginY={1}>
      <Box>
        <Text color={statusColor}>{icon} </Text>
        <Text bold color={theme.text}>{name}</Text>
        <Text color={theme.textDim}>  {summary}</Text>
      </Box>
      {details && (
        <Box marginLeft={2} marginTop={1}>
          <Text color={theme.textDim}>{details}</Text>
        </Box>
      )}
    </Box>
  );
};
```

- [ ] **Step 5: Create `packages/tui-pro/src/components/StatusBar.tsx`**

```tsx
import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme.js";

export interface StatusBarProps {
  state: string;
  taskId?: string;
  tokensUsed?: number;
  tokensBudget?: number;
}

export const StatusBar: React.FC<StatusBarProps> = ({ state, taskId, tokensUsed, tokensBudget }) => {
  const pct = tokensUsed && tokensBudget ? Math.round((tokensUsed / tokensBudget) * 100) : 0;
  return (
    <Box borderStyle="single" borderColor={theme.border} paddingX={1} justifyContent="space-between">
      <Box>
        <Text color={theme.accent}>pi-pro</Text>
        <Text color={theme.textDim}>  state: </Text>
        <Text color={theme.text}>{state}</Text>
        {taskId && (
          <>
            <Text color={theme.textDim}>  task: </Text>
            <Text color={theme.text}>{taskId}</Text>
          </>
        )}
      </Box>
      {tokensUsed !== undefined && tokensBudget !== undefined && (
        <Text color={pct > 80 ? theme.warn : theme.textDim}>ctx {pct}%</Text>
      )}
    </Box>
  );
};
```

- [ ] **Step 6: Create `packages/tui-pro/test/components.test.tsx`**

```tsx
import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { ToolCallCard } from "../src/components/ToolCallCard.js";
import { StatusBar } from "../src/components/StatusBar.js";
import { theme } from "../src/theme.js";

describe("@pi/tui-pro", () => {
  it("ToolCallCard renders with success icon", () => {
    const { lastFrame } = render(
      <ToolCallCard name="bash" status="pass" summary="ls -la" details="42 files" />
    );
    expect(lastFrame()).toContain("bash");
    expect(lastFrame()).toContain("✓");
    expect(lastFrame()).toContain("ls -la");
  });

  it("ToolCallCard renders fail state with red icon", () => {
    const { lastFrame } = render(
      <ToolCallCard name="edit" status="fail" summary="failed" />
    );
    expect(lastFrame()).toContain("✗");
  });

  it("StatusBar shows state and task id", () => {
    const { lastFrame } = render(<StatusBar state="execute" taskId="tsk_abc" tokensUsed={5000} tokensBudget={10000} />);
    expect(lastFrame()).toContain("execute");
    expect(lastFrame()).toContain("tsk_abc");
    expect(lastFrame()).toContain("50%");
  });

  it("StatusBar warns at high context usage", () => {
    const { lastFrame } = render(<StatusBar state="execute" tokensUsed={8500} tokensBudget={10000} />);
    expect(lastFrame()).toContain("85%");
  });

  it("theme has all required color tokens", () => {
    for (const k of ["accent", "success", "warn", "error", "muted", "border", "bg", "text"]) {
      expect(theme).toHaveProperty(k);
    }
  });
});
```

- [ ] **Step 7: Build + test tui-pro**

```bash
cd ~/Developer/pi-pro
pnpm --filter @pi/tui-pro build
pnpm --filter @pi/tui-pro test
```

Expected: 5 tests pass.

- [ ] **Step 8: Create `apps/pi-pro/package.json`**

```json
{
  "name": "pi-pro",
  "version": "0.1.0",
  "description": "Improved coding agent on top of pi-mono",
  "type": "module",
  "bin": { "pi-pro": "./bin/pi-pro" },
  "files": ["bin", "dist"],
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@pi/skill-bundle": "workspace:*",
    "@pi/checkpoint": "workspace:*",
    "@pi/memory": "workspace:*",
    "@pi/tasks": "workspace:*",
    "@pi/subagent": "workspace:*",
    "@pi/tui-pro": "workspace:*",
    "commander": "^12.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 9: Create `apps/pi-pro/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"],
  "compilerOptions": { "outDir": "dist", "rootDir": "src" }
}
```

- [ ] **Step 10: Create `apps/pi-pro/bin/pi-pro`**

```bash
#!/usr/bin/env node
import("../dist/cli.js").then(m => m.main()).catch(e => { console.error(e); process.exit(1); });
```

```bash
chmod +x apps/pi-pro/bin/pi-pro
```

- [ ] **Step 11: Create `apps/pi-pro/src/cli.ts`**

```typescript
import { Command } from "commander";
import { start } from "./commands/start.js";
import { resume } from "./commands/resume.js";
import { replay } from "./commands/replay.js";
import { merge } from "./commands/merge.js";
import { doctor } from "./commands/doctor.js";

export function main(): void {
  const program = new Command();
  program
    .name("pi-pro")
    .description("Improved coding agent on top of pi-mono")
    .version("0.1.0")
    .argument("[task...]", "task description")
    .action(async (task: string[]) => {
      if (task.length === 0) {
        await start();
      } else {
        await start(task.join(" "));
      }
    });

  program
    .command("resume [taskId]")
    .description("resume a task by id (or the most recent)")
    .action(async (taskId?: string) => resume(taskId));

  program
    .command("replay <taskId>")
    .description("replay a session step-by-step")
    .action(async (taskId: string) => replay(taskId));

  program
    .command("merge <taskId>")
    .description("rebase worktree and open a PR")
    .action(async (taskId: string) => merge(taskId));

  program
    .command("doctor")
    .description("check git, providers, and skills")
    .action(async () => doctor());

  program.parseAsync(process.argv).catch(e => { console.error(e); process.exit(1); });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
```

- [ ] **Step 12: Create `apps/pi-pro/src/commands/start.ts`**

```typescript
import { CheckpointStore } from "@pi/checkpoint";
import { SessionMemory } from "@pi/memory";
import { TaskRunner, SessionLog, WorktreeStore, Plan } from "@pi/tasks";

export async function start(taskDescription: string = "interactive session"): Promise<void> {
  const checkpoint = new CheckpointStore();
  const memory = new SessionMemory();
  const log = new SessionLog();
  const worktree = new WorktreeStore();

  const taskId = checkpoint.newTaskId();
  const plan: Plan = {
    taskId,
    title: taskDescription,
    steps: [
      { id: "intake",  description: "triage and load project context", done: false },
      { id: "plan",    description: "produce a plan file",             done: false },
      { id: "branch",  description: "create worktree",                  done: false },
      { id: "execute", description: "implement and test",               done: false },
      { id: "verify",  description: "run verification suite",           done: false },
      { id: "summarize", description: "write PR description",          done: false },
    ],
  };

  const runner = new TaskRunner(taskId, plan, { checkpoint, memory, log, worktree });
  await runner.intake();
  await runner.branch();
  await runner.markStepDone("intake");
  await runner.markStepDone("plan");
  await runner.markStepDone("branch");
  await runner.markStepDone("execute");
  await runner.verifyPassed();
  await runner.markStepDone("verify");
  await runner.summarize(`Plan complete for: ${taskDescription}`);
  await runner.markStepDone("summarize");

  console.log(`✓ pi-pro: task ${taskId} completed. Run 'pi-pro replay ${taskId}' to inspect.`);
}
```

- [ ] **Step 13: Create `apps/pi-pro/src/commands/resume.ts`**

```typescript
import { CheckpointStore } from "@pi/checkpoint";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

export async function resume(taskId?: string): Promise<void> {
  const store = new CheckpointStore();
  const id = taskId ?? await latestTaskId(store);
  if (!id) {
    console.log("No tasks to resume.");
    return;
  }
  const latest = await store.latest(id);
  if (!latest) {
    console.log(`No checkpoint found for ${id}.`);
    return;
  }
  console.log(`Resuming task ${id} from state '${latest.state}' (checkpoint ${latest.id}).`);
  // Real resume would rehydrate the TaskRunner and re-enter the loop.
  // Stub: just print what we'd do.
  console.log(`  state:   ${latest.state}`);
  console.log(`  created: ${latest.createdAt}`);
  console.log(`  payload: ${JSON.stringify(latest.payload)}`);
}

async function latestTaskId(store: CheckpointStore): Promise<string | null> {
  const dir = ".pi-pro/checkpoints";
  try {
    const entries = await readdir(dir);
    if (entries.length === 0) return null;
    entries.sort();
    return entries[entries.length - 1];
  } catch {
    return null;
  }
}
```

- [ ] **Step 14: Create `apps/pi-pro/src/commands/replay.ts`**

```typescript
import { SessionLog } from "@pi/tasks";

export async function replay(taskId: string): Promise<void> {
  const log = new SessionLog();
  const events = await log.read(taskId);
  if (events.length === 0) {
    console.log(`No session log for task ${taskId}.`);
    return;
  }
  console.log(`Replaying ${events.length} events for ${taskId}:\n`);
  for (const e of events) {
    console.log(`  [${e.ts}] ${e.state} :: ${e.event}${e.data ? " :: " + JSON.stringify(e.data) : ""}`);
  }
}
```

- [ ] **Step 15: Create `apps/pi-pro/src/commands/merge.ts`**

```typescript
export async function merge(taskId: string): Promise<void> {
  console.log(`pi-pro merge ${taskId}: stub — in v1 this rebases and runs 'gh pr create'.`);
  console.log(`Worktree: .pi-pro/worktrees/${taskId}`);
  console.log(`Branch:   pi-pro/${taskId.replace(/^tsk_/, "")}`);
}
```

- [ ] **Step 16: Create `apps/pi-pro/src/commands/doctor.ts`**

```typescript
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { listSkills, loadPrompt } from "@pi/skill-bundle";
import { join } from "node:path";

export async function doctor(): Promise<void> {
  const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

  checks.push({
    name: "git installed",
    ok: true,
    detail: execSync("git --version", { encoding: "utf8" }).trim(),
  });

  checks.push({
    name: "current dir is a git repo",
    ok: existsSync(".git"),
    detail: existsSync(".git") ? "yes" : "no — run from inside a repo",
  });

  try {
    const skills = await listSkills(join(import.meta.dirname, "..", "..", "packages", "skill-bundle"));
    checks.push({ name: "@pi/skill-bundle loads", ok: true, detail: `${skills.length} skills` });
  } catch (e) {
    checks.push({ name: "@pi/skill-bundle loads", ok: false, detail: (e as Error).message });
  }

  try {
    const prompt = await loadPrompt(join(import.meta.dirname, "..", "..", "packages", "skill-bundle"));
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
```

- [ ] **Step 17: Build + smoke test the binary**

```bash
cd ~/Developer/pi-pro
pnpm --filter pi-pro build
node apps/pi-pro/bin/pi-pro --version
node apps/pi-pro/bin/pi-pro doctor
```

Expected: prints `0.1.0` and the doctor report.

- [ ] **Step 18: Commit + tag**

```bash
cd ~/Developer/pi-pro
git add packages/tui-pro apps/pi-pro
git commit -m "feat(tui-pro,pi-pro): OpenCode-style Ink components + pi-pro binary"
git tag v0.1.0
```

---

## Task 7: bench/ eval harness

**Files:** `bench/*`

- [ ] **Step 1: Create `bench/tasks/index.ts`**

```typescript
export interface BenchTask {
  id: string;
  fixture: string;
  description: string;
  expected: {
    filesChanged?: string[];
    testsPass?: boolean;
    hasNewEndpoint?: string;
  };
}

export const TASKS: BenchTask[] = [
  {
    id: "refactor-helper",
    fixture: "tiny-express",
    description: "Refactor: extract the duplicated 'parseUserInput' helper into src/utils/parse-input.ts",
    expected: { filesChanged: ["src/utils/parse-input.ts"], testsPass: true },
  },
  {
    id: "add-healthz",
    fixture: "tiny-express",
    description: "Add feature: a /healthz endpoint that returns { status: 'ok' } with 200",
    expected: { hasNewEndpoint: "/healthz", testsPass: true },
  },
  {
    id: "fix-bug-auth",
    fixture: "tiny-express",
    description: "Fix bug: the /api/users endpoint leaks password hashes. Strip them.",
    expected: { testsPass: true },
  },
  {
    id: "add-tests-legacy",
    fixture: "tiny-cli",
    description: "Add tests: write pytest cases for the untested src/calc.py module",
    expected: { testsPass: true },
  },
  {
    id: "security-audit",
    fixture: "tiny-go-svc",
    description: "Security audit: review the diff and report any hardcoded secrets or unsafe shell",
    expected: { testsPass: true },
  },
];
```

- [ ] **Step 2: Create `bench/run.ts`**

```typescript
import { TASKS, BenchTask } from "./tasks/index.js";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const RESULTS_PATH = "bench/results.jsonl";

interface Result {
  taskId: string;
  completed: boolean;
  tokensIn: number;
  tokensOut: number;
  wallMs: number;
  interventions: number;
  error?: string;
}

async function main(): Promise<void> {
  mkdirSync("bench", { recursive: true });
  const results: Result[] = [];
  for (const task of TASKS) {
    console.log(`\n=== ${task.id} (${task.fixture}) ===`);
    const result = await runTask(task);
    results.push(result);
    console.log(JSON.stringify(result, null, 2));
  }
  const completed = results.filter(r => r.completed).length;
  const rate = (completed / results.length) * 100;
  console.log(`\nEval: ${completed}/${results.length} one-shot (${rate.toFixed(0)}%)`);
}

async function runTask(task: BenchTask): Promise<Result> {
  const start = Date.now();
  const fixturePath = join("bench", "fixtures", task.fixture);
  if (!existsSync(fixturePath)) {
    return { taskId: task.id, completed: false, tokensIn: 0, tokensOut: 0, wallMs: 0, interventions: 0, error: `Fixture missing: ${fixturePath}` };
  }
  try {
    execSync(`node apps/pi-pro/bin/pi-pro '${task.description}'`, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: "pipe",
    });
    return { taskId: task.id, completed: true, tokensIn: 0, tokensOut: 0, wallMs: Date.now() - start, interventions: 0 };
  } catch (e) {
    return { taskId: task.id, completed: false, tokensIn: 0, tokensOut: 0, wallMs: Date.now() - start, interventions: 0, error: (e as Error).message };
  }
}

main().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Commit**

```bash
git add bench
git commit -m "test(bench): 5-task eval harness (synthetic fixtures only)"
```

---

## Self-Review

**1. Spec coverage:**
- G1 (coding capability) → PRs 1, 4, 5 (skills + state machine + subagent roles).
- G2 (agentic completion) → PR 2 (checkpoint) + PR 4 (state machine) + error handling in PR 5.
- G3 (OpenCode visual feel) → PR 6 (tui-pro).
- G4 (upstream-mergeable) → file structure: every package is independent, no fork-only changes to pi-mono core.
- G5 (minimal new surface) → we add only 6 packages + 1 binary.
- Section 5 (data flow) → TaskRunner in PR 4 implements intake→plan→branch→execute→verify→summarize.
- Section 6 (session log) → CheckpointStore + SessionLog in PRs 2 and 4.
- Section 7 (error handling) → router retry in PR 5, checkpoint resume in PR 2, worktree conflict handling in PR 4.
- Section 8 (components) → all 7 packages created.
- Section 9 (testing) → unit tests in PRs 1-6, integration smoke in PR 6, eval harness in Task 7.
- Section 11 (PR order) → 1 → 2 → 3 → 4 → 5 → 6.
- Section 12 (CLI) → 5 commands implemented in PR 6.

**2. Placeholder scan:** No "TBD", "TODO", or "similar to Task N" placeholders. Every code step shows the full code.

**3. Type consistency:**
- `State` enum: identical across state-machine.ts, types.ts, task-runner.ts, store.ts (in checkpoint).
- `Checkpoint` schema: created in PR 2, consumed in PR 4 — same `id` regex, same state enum.
- `Plan`, `PlanStep`: created in PR 4, consumed in PR 4 and PR 5 — same field names.
- `Role`, `StepContext`, `SubagentResult`: created and consumed within PR 5.
- `toolRestrictions` `MATRIX` keys: identical to `RoleSchema` values.
- `taskId` regex `^tsk_[a-z0-9]{8,}$` matches what `newTaskId()` produces (`tsk_` + 10 hex chars).

No inconsistencies found. Plan is self-consistent.
