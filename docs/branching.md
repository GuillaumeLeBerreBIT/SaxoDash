# Branches, checks and how a change reaches production

```
feature branch ──PR──► develop ──PR──► main ──push──► deploy to the homelab (Phase 4)
                 CI               CI
```

- **Work on a feature branch** made from `develop` (`git switch develop && git pull && git switch -c feat/thing`).
- **Open the pull request into `develop`.** CI runs; merge once it is green.
- **When `develop` holds something worth shipping**, open a pull request from `develop` into
  `main`. CI runs again, including a check that refuses any other source branch. Merging it
  is the release: a push to `main` deploys (once Phase 4 is in).
- `develop` is never deployed anywhere. It is the checkpoint where changes wait together.
- `main` stays the repository's default branch, so a clone or the README shows what runs in
  production. Pull requests therefore have to be pointed at `develop` by hand: GitHub
  proposes `main` by default, and the source-branch check fails such a PR.

## What CI checks (`.github/workflows/ci.yml`)

Runs on every pull request into `main` or `develop` and on every push to them, on GitHub's
machines, never on the homelab.

| Check (job name) | What it does |
|---|---|
| **Backend tests** | Postgres 17 and Redis as services, `makemigrations --check`, the full suite in parallel |
| **Frontend tests, lint and build** | `npm ci`, eslint, vitest, the production build, and a failure if it still points at `localhost:8000` |
| **Production images** | Builds both Dockerfiles; checks the backend image has `pg_dump` 17 and its static files; validates the proxy's Caddyfile and `deploy/compose.yaml` |
| **Only develop merges into main** | On a PR into `main`, fails unless it comes from this repository's `develop`; passes on any PR into `develop` |

No secret is used. Enable Banking's two settings are placeholders, and the Saxo token
encryption key is generated fresh on every run.

## Protecting the branches (GitHub settings, done once)

**1. One ruleset for both branches.** Repository → **Settings** → **Rules** → **Rulesets** →
**New ruleset** → **New branch ruleset**:

| Field | Value |
|---|---|
| Ruleset name | `main and develop` |
| Enforcement status | **Active** |
| Bypass list | leave empty, so nobody, you included, can push straight to these branches |
| Target branches | **Add target** → **Include by pattern** → `main`, then again → `develop` |
| Restrict deletions | ✓ |
| Require a pull request before merging | ✓, required approvals **0** (GitHub does not let you approve your own PR) |
| Require status checks to pass | ✓. **Add checks**: `Backend tests`, `Frontend tests, lint and build`, `Production images`, `Only develop merges into main`. The names only appear in the picker after CI has run once |
| Require branches to be up to date before merging | **leave off** (see below) |
| Block force pushes | ✓ |

Then click **Create**.

Why "up to date" is off: merging `develop` into `main` adds a merge commit that `develop`
does not have, so the next `develop` → `main` PR would always count as out of date.
"Update branch" would then have to push to `develop`, which the ruleset forbids. CI on a pull
request already tests the result of merging it, so the check adds little here.

**2. Fork pull requests.** Settings → **Actions** → **General** → **Fork pull request
workflows from outside collaborators** → **Require approval for all external contributors**.
The repository is public, and this stops a stranger's PR from running any workflow
unattended. The CI workflow runs on GitHub's machines with a read-only token either way,
and the deploy (Phase 4) never runs for a pull request.

## A change that skips develop

There is none, on purpose. A hotfix is a branch from `develop`, a PR into `develop`, then a
`develop` → `main` PR right after.
