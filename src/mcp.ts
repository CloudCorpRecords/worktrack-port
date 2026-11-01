/**
 * worktrack-port MCP server. Core subset: 12 tools.
 *
 * Low-level Server API with explicit inputSchema literals (the
 * McpServer+zod path injects $schema/additionalProperties and breaks
 * parity). Zod still validates call args. The literals match the
 * labelled core-subset fixture exactly.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { callTool, credentialsFromEnv, VERSION } from "./atlassian.js";
import type { FetchFn } from "./types.js";

const ARG_SCHEMAS: Record<string, z.ZodTypeAny> = {
  search_issues: z.object({
    jql: z.string(),
    max_results: z.number().optional(),
  }),
  get_issue: z.object({ issue_key: z.string() }),
  create_issue: z.object({
    project_key: z.string(),
    summary: z.string(),
    description: z.string().optional(),
    issue_type: z.string().optional(),
  }),
  update_issue: z.object({
    issue_key: z.string(),
    summary: z.string().optional(),
    description: z.string().optional(),
  }),
  add_comment: z.object({
    issue_key: z.string(),
    body: z.string(),
  }),
  list_projects: z.object({}),
  get_project: z.object({ project_key: z.string() }),
  search_content: z.object({
    query: z.string(),
    limit: z.number().optional(),
  }),
  get_page: z.object({ page_id: z.string() }),
  create_page: z.object({
    space_key: z.string(),
    title: z.string(),
    content: z.string(),
  }),
  update_page: z.object({
    page_id: z.string(),
    title: z.string(),
    content: z.string(),
    version: z.number(),
  }),
  list_spaces: z.object({}),
};

export const TOOLS = [
  {
    name: "search_issues",
    description: "Search Jira issues with a JQL query.",
    inputSchema: {
      type: "object" as const,
      properties: {
        jql: { type: "string", description: "The JQL (Jira Query Language) query used to search for issues." },
        max_results: { type: "number", description: "Maximum number of issues to return." },
      },
      required: ["jql"],
    },
  },
  {
    name: "get_issue",
    description: "Get a Jira issue by its key.",
    inputSchema: {
      type: "object" as const,
      properties: { issue_key: { type: "string", description: "The key of the Jira issue to retrieve (e.g. PROJ-123)." } },
      required: ["issue_key"],
    },
  },
  {
    name: "create_issue",
    description: "Create a new Jira issue in a project.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project_key: { type: "string", description: "Key of the Jira project in which to create the issue." },
        summary: { type: "string", description: "Summary (title) of the new Jira issue." },
        description: { type: "string", description: "Description text for the new issue; converted to Atlassian Document Format." },
        issue_type: { type: "string", description: "Issue type name for the new issue (e.g. Task); defaults to Task when omitted." },
      },
      required: ["project_key", "summary"],
    },
  },
  {
    name: "update_issue",
    description: "Update fields on an existing Jira issue.",
    inputSchema: {
      type: "object" as const,
      properties: {
        issue_key: { type: "string", description: "The key of the Jira issue to update." },
        summary: { type: "string", description: "New summary for the issue; when omitted, the existing summary is left unchanged." },
        description: { type: "string", description: "New description text for the issue, converted to Atlassian Document Format; when omitted, the existing description is left unchanged." },
      },
      required: ["issue_key"],
    },
  },
  {
    name: "add_comment",
    description: "Add a comment to a Jira issue.",
    inputSchema: {
      type: "object" as const,
      properties: {
        issue_key: { type: "string", description: "The key of the Jira issue to comment on." },
        body: { type: "string", description: "Text of the comment to add; converted to Atlassian Document Format." },
      },
      required: ["issue_key", "body"],
    },
  },
  {
    name: "list_projects",
    description: "List all Jira projects on the site.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [] as string[],
    },
  },
  {
    name: "get_project",
    description: "Get a Jira project by its key.",
    inputSchema: {
      type: "object" as const,
      properties: { project_key: { type: "string", description: "The key of the Jira project to retrieve." } },
      required: ["project_key"],
    },
  },
  {
    name: "search_content",
    description: "Search Confluence content by text.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Text to search for in Confluence content." },
        limit: { type: "number", description: "Maximum number of search results to return." },
      },
      required: ["query"],
    },
  },
  {
    name: "get_page",
    description: "Get a Confluence page by its ID, including its storage-format body.",
    inputSchema: {
      type: "object" as const,
      properties: { page_id: { type: "string", description: "The ID of the Confluence page to retrieve." } },
      required: ["page_id"],
    },
  },
  {
    name: "create_page",
    description: "Create a new Confluence page in a space.",
    inputSchema: {
      type: "object" as const,
      properties: {
        space_key: { type: "string", description: "Key of the Confluence space in which to create the page." },
        title: { type: "string", description: "Title of the new Confluence page." },
        content: { type: "string", description: "Body of the new page in Confluence storage format." },
      },
      required: ["space_key", "title", "content"],
    },
  },
  {
    name: "update_page",
    description: "Update an existing Confluence page with a new version.",
    inputSchema: {
      type: "object" as const,
      properties: {
        page_id: { type: "string", description: "The ID of the Confluence page to update." },
        title: { type: "string", description: "New title for the Confluence page." },
        content: { type: "string", description: "New body of the page in Confluence storage format." },
        version: { type: "number", description: "Version number to assign to the updated page (the current version incremented by one)." },
      },
      required: ["page_id", "title", "content", "version"],
    },
  },
  {
    name: "list_spaces",
    description: "List all Confluence spaces on the site.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [] as string[],
    },
  },
];

function textResult(value: unknown) {
  return {
    content: [{
      type: "text" as const,
      text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
    }],
  };
}
function errorResult(err: unknown) {
  return {
    content: [{
      type: "text" as const,
      text: err instanceof Error ? err.message : String(err),
    }],
    isError: true,
  };
}

const server = new Server(
  { name: "worktrack-port", version: VERSION },
  { capabilities: { tools: {} } },
);
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const schema = ARG_SCHEMAS[name];
  if (!schema) throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  try {
    const creds = credentialsFromEnv();
    const parsed = schema.parse(args ?? {}) as Record<string, unknown>;
    const fetchFn = globalThis.fetch as unknown as FetchFn;
    return textResult(await callTool(fetchFn, creds, name, parsed));
  } catch (err) {
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}
void main();
