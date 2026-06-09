export interface WebfetchResult {
  status: number;
  body: string;
  contentType?: string;
}

export interface WebfetchTool {
  name: "webfetch";
  description: string;
  input_schema: { type: "object"; properties: { url: { type: "string" } }; required: ["url"] };
  execute(input: { url: string }): Promise<WebfetchResult>;
}

export function createWebfetchTool(): WebfetchTool {
  return {
    name: "webfetch",
    description: "Fetch a URL via HTTP GET. Returns status code and body text. Use sparingly — pay attention to the agent's context budget.",
    input_schema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
    async execute({ url }) {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      return {
        status: res.status,
        body: await res.text(),
        contentType: res.headers.get("content-type") ?? undefined,
      };
    },
  };
}
