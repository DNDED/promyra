import { OpenCodeGoProvider } from "@pi/provider";

const REVIEW_MODEL = "qwen3.7-max";

export interface QualityScore {
  idiomatic: number;
  efficiency: number;
  safety: number;
  maintainability: number;
  edgeCases: number;
  total: number;
  explanation: string;
}

const QUALITY_PROMPT = `You are a code quality reviewer. Score the following code on 5 dimensions (0-5 each).

Review the code changes made by an AI agent. Judge ONLY the code quality, not whether the task was completed.

### Scoring Rubric

1. **Idiomatic patterns (0-5):** Does the code follow language conventions? Proper async/await? Correct import style? No anti-patterns?
2. **Efficiency (0-5):** Are algorithms correct? Appropriate data structures? No unnecessary O(n^2) operations?
3. **Safety (0-5):** No injection vectors? Input properly sanitized? No hardcoded secrets? Safe error handling?
4. **Maintainability (0-5):** Single responsibility? Clear naming? Modular structure? DRY principles?
5. **Edge cases (0-5):** Does it handle null/undefined/empty inputs? Boundary conditions? Unexpected cases?

### Output Format

Respond with EXACTLY this JSON format, nothing else:

{
  "scores": {
    "idiomatic": 4,
    "efficiency": 3,
    "safety": 5,
    "maintainability": 4,
    "edgeCases": 3
  },
  "total": 19,
  "explanation": "Brief one-line summary of strengths and weaknesses"
}
`;

export async function reviewCodeQuality(code: string, apiKey: string): Promise<QualityScore> {
  try {
    const provider = new OpenCodeGoProvider({
      apiKey,
      model: REVIEW_MODEL,
    });

    const messages = [
      { role: "system" as const, content: QUALITY_PROMPT },
      { role: "user" as const, content: `## Code to Review\n\n\`\`\`\n${code.slice(0, 6000)}\n\`\`\`` },
    ];

    let text = "";
    for await (const chunk of provider.complete(messages, { model: REVIEW_MODEL })) {
      if (chunk.type === "token") text += chunk.text;
    }

    const jsonMatch = text.match(/\{[\s\S]*"scores"[\s\S]*\}/);
    if (!jsonMatch) {
      return { idiomatic: 3, efficiency: 3, safety: 3, maintainability: 3, edgeCases: 3, total: 15, explanation: "Could not parse review response." };
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        idiomatic: parsed.scores.idiomatic ?? 3,
        efficiency: parsed.scores.efficiency ?? 3,
        safety: parsed.scores.safety ?? 3,
        maintainability: parsed.scores.maintainability ?? 3,
        edgeCases: parsed.scores.edgeCases ?? 3,
        total: parsed.total ?? 15,
        explanation: parsed.explanation ?? "",
      };
    } catch {
      return { idiomatic: 3, efficiency: 3, safety: 3, maintainability: 3, edgeCases: 3, total: 15, explanation: "Score parse failed." };
    }
  } catch {
    return { idiomatic: 3, efficiency: 3, safety: 3, maintainability: 3, edgeCases: 3, total: 15, explanation: "Reviewer model failed." };
  }
}
