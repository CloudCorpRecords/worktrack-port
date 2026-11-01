/**
 * worktrack-port types.
 *
 * A core subset of the Atlassian remote MCP server surface: Jira issue
 * and project operations plus Confluence content operations against
 * the Atlassian REST APIs. HTTP access is described by a minimal
 * response surface so tests can inject a fake fetch.
 */

export interface HttpResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export type FetchFn = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    redirect?: string;
  },
) => Promise<HttpResponse>;

/** Resolved Atlassian credentials: Basic-auth identity plus site base. */
export interface Credentials {
  email: string;
  token: string;
  base: string;
}

export interface SearchIssuesOptions {
  jql: string;
  max_results?: number;
}

export interface GetIssueOptions {
  issue_key: string;
}

export interface CreateIssueOptions {
  project_key: string;
  summary: string;
  description?: string;
  issue_type?: string;
}

export interface UpdateIssueOptions {
  issue_key: string;
  summary?: string;
  description?: string;
}

export interface AddCommentOptions {
  issue_key: string;
  body: string;
}

export interface ListProjectsOptions {
  // No arguments.
  [key: string]: never;
}

export interface GetProjectOptions {
  project_key: string;
}

export interface SearchContentOptions {
  query: string;
  limit?: number;
}

export interface GetPageOptions {
  page_id: string;
}

export interface CreatePageOptions {
  space_key: string;
  title: string;
  content: string;
}

export interface UpdatePageOptions {
  page_id: string;
  title: string;
  content: string;
  version: number;
}

export interface ListSpacesOptions {
  // No arguments.
  [key: string]: never;
}
