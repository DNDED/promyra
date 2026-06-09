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
