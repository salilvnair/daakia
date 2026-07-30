# daakia-run — CI Collection Runner

Newman-style CLI that runs a Daakia (or Postman v2.1) collection from the command line. No VS Code needed — perfect for CI pipelines and git-native collection workflows.

## Quick start

```bash
# 1. In Daakia: Collections → ⋮ → Export → Daakia JSON  →  save into your repo (e.g. daakia/collections/)
# 2. Commit the file — collections are now versioned with your code
# 3. Run locally or in CI:
node cli/daakia-run.mjs daakia/collections/my-api.daakia.json --env daakia/env.ci.json
```

Exit code is `0` when every request passes (HTTP < 400), `1` otherwise — wire it straight into CI.

## Options

| Flag | Meaning |
|---|---|
| `--env <file>` | Variables for `{{var}}` / `${var}`. Accepts a plain `{"key":"value"}` map or a Daakia environment export |
| `--filter <text>` | Only run requests whose name contains the text |
| `--timeout <ms>` | Per-request timeout (default 30000) |
| `--bail` | Stop at the first failure |
| `--insecure` | Skip TLS certificate verification |
| `--json` | Machine-readable JSON report on stdout |

## GitHub Actions example

```yaml
- name: API smoke tests
  run: node cli/daakia-run.mjs daakia/collections/smoke.daakia.json --env daakia/env.ci.json --bail
```

## Notes

- Supports headers, query params, raw/urlencoded bodies, and bearer/basic/apikey auth from the Daakia request data.
- Pre-request/test scripts (`dk.*`) are not executed in v1 — pass/fail is based on HTTP status.
- Postman v2.1 collections are auto-detected and run with raw-body support.
