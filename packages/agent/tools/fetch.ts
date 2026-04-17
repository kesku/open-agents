import { tool } from "ai";
import { z } from "zod";
import { getSandbox, shellEscape } from "./utils";

const TIMEOUT_MS = 30_000;
const MAX_BODY_LENGTH = 5_000;

const fetchInputSchema = z.object({
  url: z.string().url().describe("The URL to fetch"),
  method: z
    .enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"])
    .optional()
    .describe("HTTP method. Default: GET"),
  headers: z
    .record(z.string(), z.string())
    .optional()
    .describe("Optional HTTP headers as key-value pairs"),
  body: z
    .string()
    .optional()
    .describe("Optional request body (for POST/PUT/PATCH)"),
});

export const webFetchTool = tool({
  description: `Fetch a URL from the web.

USAGE:
- Make HTTP requests to external URLs
- Supports GET, POST, PUT, PATCH, DELETE, and HEAD methods
- Executes from inside the sandbox to use the repo's network context
- Returns the response status and body text
- Body is truncated to 5000 characters to avoid overwhelming context

EXAMPLES:
- Simple GET: url: "https://api.example.com/data"
- POST with JSON: url: "https://api.example.com/items", method: "POST", headers: {"Content-Type": "application/json"}, body: "{\\"name\\":\\"item\\"}"`,
  inputSchema: fetchInputSchema,
  execute: async (
    { url, method = "GET", headers, body },
    { experimental_context, abortSignal },
  ) => {
    const sandbox = await getSandbox(experimental_context, "web_fetch");
    const commandArgs = [
      "curl",
      "-sS",
      "-X",
      method,
      "--max-time",
      String(Math.ceil(TIMEOUT_MS / 1000)),
      "-w",
      shellEscape("\n%{http_code}"),
    ];

    if (headers) {
      for (const [key, value] of Object.entries(headers)) {
        commandArgs.push("-H", shellEscape(`${key}: ${value}`));
      }
    }

    if (method !== "GET" && method !== "HEAD" && body) {
      commandArgs.push("-d", shellEscape(body));
    }

    commandArgs.push(shellEscape(url));

    try {
      const result = await sandbox.exec(
        commandArgs.join(" "),
        sandbox.workingDirectory,
        TIMEOUT_MS,
        {
          signal: abortSignal,
        },
      );

      if (!result.success) {
        return {
          success: false,
          error: `Fetch failed: ${result.stderr || "Unknown error"}`,
        };
      }

      const output = result.stdout ?? "";
      const lastNewline = output.lastIndexOf("\n");
      const status =
        lastNewline === -1
          ? null
          : Number.parseInt(output.slice(lastNewline + 1), 10);
      let responseBody =
        lastNewline === -1 ? output : output.slice(0, lastNewline);

      const truncated = responseBody.length > MAX_BODY_LENGTH;
      if (truncated) {
        responseBody = responseBody.slice(0, MAX_BODY_LENGTH);
      }

      return {
        success: true,
        status: Number.isFinite(status) ? status : null,
        body: responseBody,
        truncated,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Fetch failed: ${message}`,
      };
    }
  },
});
