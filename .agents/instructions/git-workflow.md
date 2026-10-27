# Git workflow

## Rules and security

- Work in an isolated worktree on your own task branch. Never edit, commit, push, or merge directly into `main` or another protected branch unless explicitly instructed. Never bypass or change branch protections.
- Task branches, worktrees, signed commits, and pushes to your own branch are authorized unless session instructions say otherwise.
- Use native `git` and authenticated `gh` for repository and GitHub operations. Codex must not use GitHub MCP tools or the GitHub connector; other MCP tools and connectors are unaffected.
- Keep credentials out of files, command output, logs, and commits.
- Instructions, command filters, and session UIs guide behavior. Name the OS controls or GitHub permissions and rulesets that enforce restrictions; distinguish mitigations from guarantees.
- Do not push changes to `.github/workflows/`.

### Remote restrictions

GitHub enforces these restrictions on the agent identity; they do not prevent local edits or commits. Follow them locally unless explicitly instructed otherwise.

- Pushes are limited to `agent/**/*`, `claude/**/*`, and `codex/**/*`.
- The agent cannot push to remote `main` or merge PRs.
- Workflow updates are limited by the agent token's permissions; see [credential setup](./dev-container/git-setup-user-gpg-key.md).

## Branches and worktrees

- Create task branches from `origin/main` using the `agent/` prefix. Use `claude/` or `codex/` only when instructed.
- If working on an issue, include issue id in branch, e.g. `agent/11-short-name`.
- Preserve others' work and agree on ownership before concurrent edits.
- Before a review-ready push or handoff, fetch and rebase onto `origin/main` if it advanced. Do not merge `main` into task branches.
- Resolve routine conflicts; ask when a product or design decision is needed.
- Stack branches or PRs only when requested, and state the dependency.
- Ask before deleting any local or remote `agent/` branch; permission to rewrite history does not authorize deletion.

## Commits and delivery

- Commit coherent changes at meaningful checkpoints and before handoff, using atomic Conventional Commits (`type(scope): description`). Push at review-ready milestones or session end.
- Keep the configured agent as author. Codex commits require `Co-Authored-By: Codex <codex@users.noreply.github.com>`. Include the actual model/version when known; Claude trailers are allowed and should identify the actual model/version. Do not guess.
- Amends, rebases, squashes, and published-history rewrites on your own non-protected branch are authorized when they improve history. Sign rewritten commits, push with `--force-with-lease`, and inspect remote changes if the lease fails.
- At handoff, state the branch and worktree, whether changes are uncommitted, committed locally, or pushed, and why any push was deferred.

## Issues

- Read and follow the applicable [issue template](../../.github/ISSUE_TEMPLATE/), keeping its headings in order. Remove inapplicable sections, HTML comments, and placeholders.
- Begin with a one-line TL;DR that human uses to quickly distinguish the ticket in a list; treat it as a label rather than a summary.
- Define scope, exclusions, and verifiable acceptance criteria. Put decisions for the human architect under open questions.

## Pull requests

- Read and follow the [PR template](../../.github/pull_request_template.md), keeping its headings in order. Remove inapplicable sections, HTML comments, and placeholders.
- Use a Conventional Commit title, target `main`, and link the issue with `Closes #N`.
- Prefer bullets; explain what reviewers need without repeating the diff or commit messages.
- Under Verification, list commands actually run and their results. Identify checks not run and why.
- End with the agent's name and actual model/version, for example "Claude (Sonnet 5.5)". Do not guess.
- After a prerequisite PR merges, retarget dependent PRs to `main` and verify their base, commits, and diff.
- If a human asks you to review the comments on a PR, make sure you respond to the comments in GitHub too.
