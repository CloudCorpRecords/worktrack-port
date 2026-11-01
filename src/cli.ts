#!/usr/bin/env node
/**
 * worktrack-port CLI.
 *   worktrack-port <tool-name> '<json args>'
 *   worktrack-port mcp
 * Requires ATLASSIAN_EMAIL, ATLASSIAN_API_TOKEN and ATLASSIAN_SITE_URL.
 * Exit codes: 0 success, 1 error, 2 usage.
 */
import { callTool, credentialsFromEnv, VERSION } from "./atlassian.js";
import type { FetchFn } from "./types.js";

const TOOL_NAMES = [
  "search_issues", "get_issue", "create_issue", "update_issue",
  "add_comment", "list_projects", "get_project", "search_content",
  "get_page", "create_page", "update_page", "list_spaces",
];

function usage(): never {
  console.error(`Usage:
  worktrack-port <tool> '<json args>'   tools: ${TOOL_NAMES.join(", ")}
  worktrack-port mcp
  worktrack-port --version`);
  process.exit(2);
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--version" || cmd === "-v") { console.log(VERSION); return; }
  if (cmd === "mcp") { await import("./mcp.js"); return; }
  if (!cmd || !TOOL_NAMES.includes(cmd)) usage();
  let args: Record<string, unknown> = {};
  const raw = rest.join(" ").trim();
  if (raw) {
    try {
      args = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      console.error("error: args must be a JSON object");
      process.exit(1);
    }
  }
  try {
    const fetchFn = globalThis.fetch as unknown as FetchFn;
    const out = await callTool(fetchFn, credentialsFromEnv(), cmd, args);
    console.log(typeof out === "string" ? out : JSON.stringify(out, null, 2));
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
void main();
