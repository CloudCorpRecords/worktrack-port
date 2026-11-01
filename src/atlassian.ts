/**
 * worktrack-port core: a 12-tool core subset of the Atlassian remote
 * MCP server surface, implemented clean-room against the public
 * Atlassian REST APIs (Jira: {site}/rest/api/3, Confluence:
 * {site}/wiki/rest/api).
 *
 * Auth: HTTP Basic with ATLASSIAN_EMAIL + ATLASSIAN_API_TOKEN; the
 * site base comes from ATLASSIAN_SITE_URL (e.g.
 * https://example.atlassian.net). Missing variables are errors naming
 * the variable, checked in the order EMAIL, API_TOKEN, SITE_URL. All
 * HTTP goes through an injected FetchFn so the wire behaviour is fully
 * testable offline.
 *
 * Note: the original Atlassian MCP server is a hosted remote server
 * (OAuth surface); this rebuild is a REST-compatible client for the
 * same upstream APIs and does not reproduce the hosted OAuth surface.
 */
import type {
  AddCommentOptions,
  CreateIssueOptions,
  CreatePageOptions,
  Credentials,
  FetchFn,
  GetIssueOptions,
  GetPageOptions,
  GetProjectOptions,
  SearchContentOptions,
  SearchIssuesOptions,
  UpdateIssueOptions,
  UpdatePageOptions,
} from "./types.js";

export const VERSION = "0.1.0";

export function credentialsFromEnv(
  env: Record<string, string | undefined> = process.env,
): Credentials {
  const emailRaw = env.ATLASSIAN_EMAIL;
  const email = typeof emailRaw === "string" ? emailRaw.trim() : "";
  if (!email) {
    throw new Error("ATLASSIAN_EMAIL environment variable is required");
  }
  const tokenRaw = env.ATLASSIAN_API_TOKEN;
  const token = typeof tokenRaw === "string" ? tokenRaw.trim() : "";
  if (!token) {
    throw new Error("ATLASSIAN_API_TOKEN environment variable is required");
  }
  const baseRaw = env.ATLASSIAN_SITE_URL;
  const base = typeof baseRaw === "string" ? baseRaw.trim() : "";
  if (!base) {
    throw new Error("ATLASSIAN_SITE_URL environment variable is required");
  }
  return { email, token, base: base.replace(/\/+$/, "") };
}

export function basicAuthHeader(creds: Credentials): string {
  return `Basic ${Buffer.from(`${creds.email}:${creds.token}`, "utf-8").toString("base64")}`;
}

/** Convert plain text to an Atlassian Document Format (ADF) document. */
export function textToAdf(text: string): Record<string, unknown> {
  return {
    type: "doc",
    version: 1,
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  };
}

interface RequestSpec {
  method: string;
  url: string;
  body?: unknown;
}

async function atlassianRequest(
  fetchFn: FetchFn,
  creds: Credentials,
  spec: RequestSpec,
): Promise<unknown> {
  const res = await fetchFn(spec.url, {
    method: spec.method,
    headers: {
      Authorization: basicAuthHeader(creds),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: spec.body === undefined ? undefined : JSON.stringify(spec.body),
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (typeof parsed.message === "string") detail = parsed.message;
      else if (Array.isArray(parsed.errorMessages) && parsed.errorMessages.length) {
        detail = parsed.errorMessages.map(String).join("; ");
      }
    } catch {
      // Keep the raw body as the detail.
    }
    throw new Error(`Atlassian API error ${res.status}: ${detail}`);
  }
  if (!text) return { status: res.status };
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function query(params: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

const enc = encodeURIComponent;

function jiraBase(creds: Credentials): string {
  return `${creds.base}/rest/api/3`;
}

function confluenceBase(creds: Credentials): string {
  return `${creds.base}/wiki/rest/api`;
}

// ---------------------------------------------------------------- Jira

export async function searchIssues(
  fetchFn: FetchFn, creds: Credentials, opts: SearchIssuesOptions,
): Promise<unknown> {
  return atlassianRequest(fetchFn, creds, {
    method: "GET",
    url: `${jiraBase(creds)}/search${query({ jql: opts.jql, maxResults: opts.max_results })}`,
  });
}

export async function getIssue(
  fetchFn: FetchFn, creds: Credentials, opts: GetIssueOptions,
): Promise<unknown> {
  return atlassianRequest(fetchFn, creds, {
    method: "GET",
    url: `${jiraBase(creds)}/issue/${enc(opts.issue_key)}`,
  });
}

export async function createIssue(
  fetchFn: FetchFn, creds: Credentials, opts: CreateIssueOptions,
): Promise<unknown> {
  const fields: Record<string, unknown> = {
    project: { key: opts.project_key },
    summary: opts.summary,
    issuetype: { name: opts.issue_type ?? "Task" },
  };
  if (opts.description !== undefined) fields.description = textToAdf(opts.description);
  return atlassianRequest(fetchFn, creds, {
    method: "POST",
    url: `${jiraBase(creds)}/issue`,
    body: { fields },
  });
}

export async function updateIssue(
  fetchFn: FetchFn, creds: Credentials, opts: UpdateIssueOptions,
): Promise<unknown> {
  const fields: Record<string, unknown> = {};
  if (opts.summary !== undefined) fields.summary = opts.summary;
  if (opts.description !== undefined) fields.description = textToAdf(opts.description);
  return atlassianRequest(fetchFn, creds, {
    method: "PUT",
    url: `${jiraBase(creds)}/issue/${enc(opts.issue_key)}`,
    body: { fields },
  });
}

export async function addComment(
  fetchFn: FetchFn, creds: Credentials, opts: AddCommentOptions,
): Promise<unknown> {
  return atlassianRequest(fetchFn, creds, {
    method: "POST",
    url: `${jiraBase(creds)}/issue/${enc(opts.issue_key)}/comment`,
    body: { body: textToAdf(opts.body) },
  });
}

export async function listProjects(
  fetchFn: FetchFn, creds: Credentials,
): Promise<unknown> {
  return atlassianRequest(fetchFn, creds, {
    method: "GET",
    url: `${jiraBase(creds)}/project`,
  });
}

export async function getProject(
  fetchFn: FetchFn, creds: Credentials, opts: GetProjectOptions,
): Promise<unknown> {
  return atlassianRequest(fetchFn, creds, {
    method: "GET",
    url: `${jiraBase(creds)}/project/${enc(opts.project_key)}`,
  });
}

// ---------------------------------------------------------- Confluence

export async function searchContent(
  fetchFn: FetchFn, creds: Credentials, opts: SearchContentOptions,
): Promise<unknown> {
  const cql = `text~"${opts.query}"`;
  return atlassianRequest(fetchFn, creds, {
    method: "GET",
    url: `${confluenceBase(creds)}/content/search${query({ cql, limit: opts.limit })}`,
  });
}

export async function getPage(
  fetchFn: FetchFn, creds: Credentials, opts: GetPageOptions,
): Promise<unknown> {
  return atlassianRequest(fetchFn, creds, {
    method: "GET",
    url: `${confluenceBase(creds)}/content/${enc(opts.page_id)}?expand=body.storage`,
  });
}

export async function createPage(
  fetchFn: FetchFn, creds: Credentials, opts: CreatePageOptions,
): Promise<unknown> {
  return atlassianRequest(fetchFn, creds, {
    method: "POST",
    url: `${confluenceBase(creds)}/content`,
    body: {
      type: "page",
      title: opts.title,
      space: { key: opts.space_key },
      body: { storage: { value: opts.content, representation: "storage" } },
    },
  });
}

export async function updatePage(
  fetchFn: FetchFn, creds: Credentials, opts: UpdatePageOptions,
): Promise<unknown> {
  return atlassianRequest(fetchFn, creds, {
    method: "PUT",
    url: `${confluenceBase(creds)}/content/${enc(opts.page_id)}`,
    body: {
      type: "page",
      title: opts.title,
      version: { number: opts.version },
      body: { storage: { value: opts.content, representation: "storage" } },
    },
  });
}

export async function listSpaces(
  fetchFn: FetchFn, creds: Credentials,
): Promise<unknown> {
  return atlassianRequest(fetchFn, creds, {
    method: "GET",
    url: `${confluenceBase(creds)}/space`,
  });
}

/** Dispatch a tool call by name. Used by both the MCP server and the CLI. */
export async function callTool(
  fetchFn: FetchFn,
  creds: Credentials,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "search_issues":
      return searchIssues(fetchFn, creds, args as unknown as SearchIssuesOptions);
    case "get_issue":
      return getIssue(fetchFn, creds, args as unknown as GetIssueOptions);
    case "create_issue":
      return createIssue(fetchFn, creds, args as unknown as CreateIssueOptions);
    case "update_issue":
      return updateIssue(fetchFn, creds, args as unknown as UpdateIssueOptions);
    case "add_comment":
      return addComment(fetchFn, creds, args as unknown as AddCommentOptions);
    case "list_projects":
      return listProjects(fetchFn, creds);
    case "get_project":
      return getProject(fetchFn, creds, args as unknown as GetProjectOptions);
    case "search_content":
      return searchContent(fetchFn, creds, args as unknown as SearchContentOptions);
    case "get_page":
      return getPage(fetchFn, creds, args as unknown as GetPageOptions);
    case "create_page":
      return createPage(fetchFn, creds, args as unknown as CreatePageOptions);
    case "update_page":
      return updatePage(fetchFn, creds, args as unknown as UpdatePageOptions);
    case "list_spaces":
      return listSpaces(fetchFn, creds);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
