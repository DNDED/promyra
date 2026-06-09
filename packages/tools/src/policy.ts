export type PolicyKind = "dangerous-shell" | "secret";

export interface PolicyViolation {
  kind: PolicyKind;
  message: string;
  matched?: string;
}

const DANGEROUS_SHELL_PATTERNS: Array<{ re: RegExp; desc: string }> = [
  { re: /\brm\s+(-[a-zA-Z]*[rRfF][a-zA-Z]*\s+|\s+)-?[a-zA-Z]*\s*\/(\s*$|\s*\*)/, desc: "rm -rf of root" },
  { re: /\brm\s+(-[a-zA-Z]*[rRfF][a-zA-Z]*\s+|\s+)-?[a-zA-Z]*\s*~(\s|$)/, desc: "rm -rf of home directory" },
  { re: /\b(curl|wget)\b[^\n]*\|\s*(sh|bash|zsh|ksh)\b/, desc: "piping remote download into a shell" },
  { re: />\s*\/etc\//, desc: "writing to /etc" },
  { re: />\s*\/usr\//, desc: "writing to /usr" },
  { re: /\bsudo\b/, desc: "using sudo" },
  { re: /\bchmod\s+(-[a-zA-Z]+\s+)?777\s+\/(usr|etc|bin|sbin)/, desc: "chmod 777 on system path" },
];

export function isSafeBashCommand(cmd: string): PolicyViolation | null {
  for (const { re, desc } of DANGEROUS_SHELL_PATTERNS) {
    if (re.test(cmd)) {
      return { kind: "dangerous-shell", message: `Blocked: ${desc}. Command: ${truncate(cmd, 80)}` };
    }
  }
  return null;
}

const SECRET_PATTERNS: Array<{ re: RegExp; desc: string }> = [
  { re: /\bAKIA[0-9A-Z]{16}\b/, desc: "AWS access key ID" },
  { re: /\bghp_[0-9a-zA-Z]{30,}\b/, desc: "GitHub personal access token" },
  { re: /\bsk-(live|test)-[0-9a-zA-Z]{16,}\b/, desc: "Stripe-style API key" },
  { re: /(api[_-]?key|secret|password|token)\s*[:=]\s*["']([^"'\\]{12,})["']/i, desc: "hardcoded secret value" },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, desc: "PEM private key block" },
];

export function scanForSecrets(content: string): PolicyViolation[] {
  const out: PolicyViolation[] = [];
  for (const { re, desc } of SECRET_PATTERNS) {
    if (re.test(content)) {
      out.push({ kind: "secret", message: `Detected ${desc}` });
    }
  }
  return out;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "..." : s;
}
