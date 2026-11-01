# worktrack-port — BUILD REPORT

Original: atlassian (Atlassian remote MCP server) → Rebuild:
worktrack-port. Tier C core subset. Local only, nothing pushed or
published.

## Scope
12 tools against the Atlassian REST APIs (Jira base {site}/rest/api/3,
Confluence base {site}/wiki/rest/api; site from ATLASSIAN_SITE_URL,
trailing slash stripped), Authorization: Basic
base64(ATLASSIAN_EMAIL:ATLASSIAN_API_TOKEN), all HTTP behind an
injectable FetchFn:
Jira — search_issues (GET /search with encoded jql + maxResults),
get_issue, create_issue (POST with fields; issue_type defaults to
"Task"; plain-text description converted to ADF), update_issue (PUT,
provided fields only; a 204 maps to {status: 204}), add_comment
(POST, body as ADF), list_projects, get_project.
Confluence — search_content (GET /content/search with the whole CQL
`text~"{query}"` URL-encoded, plus limit), get_page
(GET /content/{id}?expand=body.storage), create_page (POST storage
representation body), update_page (PUT with version number),
list_spaces.

Omitted groups (fixture `_source` lists them): Jira boards/sprints/
agile, workflows/transitions admin, users/groups admin, attachments,
dashboards/filters, service-desk; Confluence attachments, labels,
permissions, children/ancestors ops, blogposts, spaces create/delete.

Ground truth: schemas are docs-derived from the public Atlassian
Cloud REST API documentation (Jira REST API v3, Confluence REST API).
Fixture: harness/fixtures/atlassian-tools-original.json (labelled
core-subset). The original is a hosted remote MCP server over OAuth;
this rebuild is a REST-compatible client for the same upstream APIs
using HTTP Basic auth — the hosted OAuth surface is not reproduced.

## Verified (foreground, from disk)
- Tools: 12/12 — parity.json identical_tools = 12 = total.
- Unit tests: 15/15 pass (fake FetchFn; missing-env naming for each
  of the 3 vars in order, Basic header exactly
  base64("a@b.c:tok"), URL/method/body for every tool, ADF shape
  deep-equal, provided-fields-only update, 204 handling, upstream
  error status+message incl. errorMessages arrays).
- tsc: exit 0. dist/cli.js present; `node dist/cli.js --version`
  prints 0.1.0.
- Parity: harness/parity.py vs the fixture → PASS, parity_pct 100.0
  (parity-out/parity.json).
- Missing-env stdio check: tools/call search_issues with
  ATLASSIAN_EMAIL, ATLASSIAN_API_TOKEN and ATLASSIAN_SITE_URL all
  unset returned isError "ATLASSIAN_EMAIL environment variable is
  required" (the first variable, per the check order).
- server.json description 65 chars (≤100); OCI entry has no version
  field; npm entry carries version 0.1.0; Dockerfile label
  io.github.CloudCorpRecords/worktrack-port; full 19-file factory set
  present.

## Honest gaps
- No live Atlassian call was made — request/response behaviour is
  fake-fetch proven only.
- ADF conversion covers a single plain-text paragraph only (no
  multi-paragraph splitting, lists, or mentions).
- search_content builds a `text~"..."` CQL only; arbitrary CQL is not
  exposed in this subset.
- Lockfile is a copied fleet lockfile with identity fields edited —
  clean lockfile regeneration is REQUIRED before publish.
- mcpaudit / mcpvet / shipcheck not yet run — pre-publish gate.
- Hosted OAuth surface of the original remote server is not
  reproduced (see Scope).
