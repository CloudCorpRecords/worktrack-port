# worktrack-port

Jira issues and Confluence pages as MCP tools, talking to the
Atlassian REST APIs. worktrack-port is a clean-room rebuild of the
core surface of the Atlassian remote MCP server, under a new name:
the same tool names and wire behaviour, fresh code, no copied
branding. The original is a hosted remote MCP server; this rebuild is
a REST-compatible client for the same upstream APIs — the hosted
OAuth surface is not reproduced.

## Tools (core subset, 12)

Jira: `search_issues`, `get_issue`, `create_issue`, `update_issue`,
`add_comment`, `list_projects`, `get_project`.
Confluence: `search_content`, `get_page`, `create_page`,
`update_page`, `list_spaces`.

Not in this subset: Jira boards/sprints/agile, workflows and
transitions admin, users/groups admin, attachments, dashboards and
filters, service desk; Confluence attachments, labels, permissions,
children/ancestors operations, blogposts, and space create/delete.

Plain-text issue descriptions and comments are converted to
Atlassian Document Format (ADF) before they are sent.

## Setup

Create an Atlassian API token for your account, then set:

```bash
export ATLASSIAN_EMAIL=you@example.com
export ATLASSIAN_API_TOKEN=...
export ATLASSIAN_SITE_URL=https://your-site.atlassian.net
```

Without any one of them, every tool call fails with an error naming
the missing variable (checked in the order EMAIL, API_TOKEN,
SITE_URL).

## CLI

```bash
npx @reneturcios/worktrack-port search_issues '{"jql":"project = ABC"}'
npx @reneturcios/worktrack-port mcp        # stdio MCP server
```

Each tool name is a subcommand taking one JSON object argument.

## MCP client config

```json
{
  "mcpServers": {
    "worktrack-port": {
      "command": "npx",
      "args": ["-y", "@reneturcios/worktrack-port", "mcp"],
      "env": {
        "ATLASSIAN_EMAIL": "you@example.com",
        "ATLASSIAN_API_TOKEN": "...",
        "ATLASSIAN_SITE_URL": "https://your-site.atlassian.net"
      }
    }
  }
}
```

## Docker

```bash
docker run -i -e ATLASSIAN_EMAIL -e ATLASSIAN_API_TOKEN -e ATLASSIAN_SITE_URL ghcr.io/cloudcorprecords/worktrack-port
```

## Development

```bash
npm install
npm run build
npm test
```

## License

MIT
