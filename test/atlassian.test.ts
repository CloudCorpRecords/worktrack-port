import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addComment,
  basicAuthHeader,
  createIssue,
  createPage,
  credentialsFromEnv,
  getIssue,
  getPage,
  getProject,
  listProjects,
  listSpaces,
  searchContent,
  searchIssues,
  textToAdf,
  updateIssue,
  updatePage,
} from "../src/atlassian.js";
import type { Credentials, FetchFn, HttpResponse } from "../src/types.js";

interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

function fakeFetch(steps: Array<{ match: string; payload: unknown; status?: number; rawText?: string }>) {
  const calls: Recorded[] = [];
  const fn: FetchFn = async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, method: init?.method ?? "GET", headers: init?.headers ?? {}, body });
    const step = steps.find((s) => url.includes(s.match)) ?? { match: "", payload: {} };
    const res: HttpResponse = {
      ok: (step.status ?? 200) < 300,
      status: step.status ?? 200,
      headers: { get: () => null },
      text: async () => step.rawText ?? (step.payload === null ? "" : JSON.stringify(step.payload)),
    };
    return res;
  };
  return { fn, calls };
}

const CREDS: Credentials = { email: "a@b.c", token: "tok", base: "https://example.atlassian.net" };
const EXPECTED_BASIC = `Basic ${Buffer.from("a@b.c:tok", "utf-8").toString("base64")}`;

describe("worktrack-port core", () => {
  it("names each missing env var in order: EMAIL, API_TOKEN, SITE_URL", () => {
    assert.throws(() => credentialsFromEnv({}), /ATLASSIAN_EMAIL environment variable is required/);
    assert.throws(
      () => credentialsFromEnv({ ATLASSIAN_EMAIL: "a@b.c" }),
      /ATLASSIAN_API_TOKEN environment variable is required/,
    );
    assert.throws(
      () => credentialsFromEnv({ ATLASSIAN_EMAIL: "a@b.c", ATLASSIAN_API_TOKEN: "tok" }),
      /ATLASSIAN_SITE_URL environment variable is required/,
    );
    const creds = credentialsFromEnv({
      ATLASSIAN_EMAIL: " a@b.c ",
      ATLASSIAN_API_TOKEN: " tok ",
      ATLASSIAN_SITE_URL: "https://example.atlassian.net/",
    });
    assert.deepEqual(creds, CREDS);
  });

  it("builds the Basic auth header as base64(email:token)", () => {
    assert.equal(basicAuthHeader(CREDS), EXPECTED_BASIC);
    assert.equal(EXPECTED_BASIC, "Basic YUBiLmM6dG9r");
  });

  it("textToAdf wraps plain text in the exact ADF shape", () => {
    assert.deepEqual(textToAdf("hello"), {
      type: "doc",
      version: 1,
      content: [
        { type: "paragraph", content: [{ type: "text", text: "hello" }] },
      ],
    });
  });

  it("search_issues encodes the JQL and maxResults", async () => {
    const { fn, calls } = fakeFetch([{ match: "/rest/api/3/search", payload: { issues: [] } }]);
    await searchIssues(fn, CREDS, { jql: "project = ABC ORDER BY created DESC", max_results: 5 });
    assert.equal(calls[0].method, "GET");
    assert.equal(calls[0].headers.Authorization, EXPECTED_BASIC);
    assert.ok(calls[0].url.startsWith("https://example.atlassian.net/rest/api/3/search?jql="));
    assert.ok(calls[0].url.includes(encodeURIComponent("project = ABC ORDER BY created DESC")));
    assert.ok(calls[0].url.includes("maxResults=5"));
    await searchIssues(fn, CREDS, { jql: "assignee = currentUser()" });
    assert.ok(!calls[1].url.includes("maxResults"));
  });

  it("get_issue gets /rest/api/3/issue/{key}", async () => {
    const { fn, calls } = fakeFetch([{ match: "/issue/ABC-1", payload: { key: "ABC-1" } }]);
    const out = (await getIssue(fn, CREDS, { issue_key: "ABC-1" })) as Record<string, unknown>;
    assert.equal(out.key, "ABC-1");
    assert.equal(calls[0].url, "https://example.atlassian.net/rest/api/3/issue/ABC-1");
  });

  it("create_issue posts fields with default Task type and ADF description", async () => {
    const { fn, calls } = fakeFetch([{ match: "/rest/api/3/issue", payload: { key: "ABC-2" } }]);
    await createIssue(fn, CREDS, { project_key: "ABC", summary: "Bug", description: "it broke" });
    assert.equal(calls[0].method, "POST");
    assert.deepEqual(calls[0].body, {
      fields: {
        project: { key: "ABC" },
        summary: "Bug",
        issuetype: { name: "Task" },
        description: textToAdf("it broke"),
      },
    });
    await createIssue(fn, CREDS, { project_key: "ABC", summary: "Story", issue_type: "Story" });
    const fields = (calls[1].body as Record<string, unknown>).fields as Record<string, unknown>;
    assert.deepEqual(fields.issuetype, { name: "Story" });
    assert.ok(!("description" in fields));
  });

  it("update_issue sends provided fields only and maps a 204 to {status:204}", async () => {
    const { fn, calls } = fakeFetch([{ match: "/issue/ABC-1", payload: null, status: 204, rawText: "" }]);
    const out = (await updateIssue(fn, CREDS, { issue_key: "ABC-1", summary: "New" })) as Record<string, unknown>;
    assert.deepEqual(out, { status: 204 });
    assert.equal(calls[0].method, "PUT");
    assert.deepEqual(calls[0].body, { fields: { summary: "New" } });
    await updateIssue(fn, CREDS, { issue_key: "ABC-1", description: "d" });
    assert.deepEqual(calls[1].body, { fields: { description: textToAdf("d") } });
  });

  it("add_comment posts the body as ADF", async () => {
    const { fn, calls } = fakeFetch([{ match: "/comment", payload: { id: "c1" } }]);
    await addComment(fn, CREDS, { issue_key: "ABC-1", body: "looks good" });
    assert.equal(calls[0].method, "POST");
    assert.equal(calls[0].url, "https://example.atlassian.net/rest/api/3/issue/ABC-1/comment");
    assert.deepEqual(calls[0].body, { body: textToAdf("looks good") });
  });

  it("list_projects and get_project hit /rest/api/3/project", async () => {
    const { fn, calls } = fakeFetch([
      { match: "/project/ABC", payload: { key: "ABC" } },
      { match: "/project", payload: [{ key: "ABC" }] },
    ]);
    await listProjects(fn, CREDS);
    assert.equal(calls[0].method, "GET");
    assert.equal(calls[0].url, "https://example.atlassian.net/rest/api/3/project");
    const proj = (await getProject(fn, CREDS, { project_key: "ABC" })) as Record<string, unknown>;
    assert.equal(proj.key, "ABC");
    assert.equal(calls[1].url, "https://example.atlassian.net/rest/api/3/project/ABC");
  });

  it("search_content encodes the whole CQL and the limit", async () => {
    const { fn, calls } = fakeFetch([{ match: "/content/search", payload: { results: [] } }]);
    await searchContent(fn, CREDS, { query: "release notes", limit: 3 });
    assert.equal(calls[0].method, "GET");
    const expectedCql = encodeURIComponent('text~"release notes"');
    assert.equal(calls[0].url, `https://example.atlassian.net/wiki/rest/api/content/search?cql=${expectedCql}&limit=3`);
    await searchContent(fn, CREDS, { query: "x" });
    assert.ok(!calls[1].url.includes("limit"));
  });

  it("get_page expands body.storage", async () => {
    const { fn, calls } = fakeFetch([{ match: "/content/99", payload: { id: "99" } }]);
    await getPage(fn, CREDS, { page_id: "99" });
    assert.equal(calls[0].url, "https://example.atlassian.net/wiki/rest/api/content/99?expand=body.storage");
  });

  it("create_page posts the storage-format body", async () => {
    const { fn, calls } = fakeFetch([{ match: "/wiki/rest/api/content", payload: { id: "100" } }]);
    await createPage(fn, CREDS, { space_key: "ENG", title: "Spec", content: "<p>hi</p>" });
    assert.equal(calls[0].method, "POST");
    assert.deepEqual(calls[0].body, {
      type: "page",
      title: "Spec",
      space: { key: "ENG" },
      body: { storage: { value: "<p>hi</p>", representation: "storage" } },
    });
  });

  it("update_page puts title, version number and storage body", async () => {
    const { fn, calls } = fakeFetch([{ match: "/content/99", payload: { id: "99" } }]);
    await updatePage(fn, CREDS, { page_id: "99", title: "Spec v2", content: "<p>v2</p>", version: 4 });
    assert.equal(calls[0].method, "PUT");
    assert.equal(calls[0].url, "https://example.atlassian.net/wiki/rest/api/content/99");
    assert.deepEqual(calls[0].body, {
      type: "page",
      title: "Spec v2",
      version: { number: 4 },
      body: { storage: { value: "<p>v2</p>", representation: "storage" } },
    });
  });

  it("list_spaces gets /wiki/rest/api/space", async () => {
    const { fn, calls } = fakeFetch([{ match: "/space", payload: { results: [] } }]);
    await listSpaces(fn, CREDS);
    assert.equal(calls[0].method, "GET");
    assert.equal(calls[0].url, "https://example.atlassian.net/wiki/rest/api/space");
    assert.equal(calls[0].headers.Authorization, EXPECTED_BASIC);
  });

  it("surfaces upstream error status and message", async () => {
    const { fn } = fakeFetch([{ match: "/search", payload: { message: "Bad JQL" }, status: 400 }]);
    await assert.rejects(
      () => searchIssues(fn, CREDS, { jql: "nonsense (" }),
      /Atlassian API error 400: Bad JQL/,
    );
    const { fn: fn2 } = fakeFetch([{ match: "/issue", payload: { errorMessages: ["Issue does not exist"] }, status: 404 }]);
    await assert.rejects(
      () => getIssue(fn2, CREDS, { issue_key: "NOPE-1" }),
      /Atlassian API error 404: Issue does not exist/,
    );
  });
});
