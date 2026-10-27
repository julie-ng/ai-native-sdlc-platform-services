# Git workflow

## Rules and security

- Work in an isolated worktree on your own `agent/` branch. Never edit, commit, push, or merge directly into `main` or another protected branch, or bypass or change branch protections.
- Use native `git` and authenticated `gh` for repository and GitHub operations. Codex must not use GitHub MCP tools or the GitHub connector; other MCP tools and connectors are unaffected.
- Keep credentials out of files, command output, logs, and commits. In the dev container, follow the [credential setup instructions](./dev-container/git-setup-user-gpg-key.md).
- Instructions, command filters, and session UIs do not establish security boundaries. Credit isolation only to named OS-level controls; distinguish mitigations from guarantees.

## Branches and worktrees

- Determine and fetch the remote default branch before creating a task branch; branch from that fetched reference. Preserve the human's uncommitted changes and other agents' checkouts, and establish ownership before concurrent writes.
- Fetch the default branch before a review-ready push or handoff; rebase if it advanced. Do not merge it into the task branch.
- Resolve routine conflicts while preserving both sides' intent. Ask when resolution requires a product or design decision, regardless of conflict count.
- Stack branches or PRs only when explicitly requested, and state the dependency.
- Never delete branches outside `agent/`. Ask before deleting any local or remote `agent/` branch; permission to rewrite history does not authorize deletion.

## Commits and delivery

- Task branches, worktrees, signed commits, and normal pushes to your own branch are authorized, subject to session-specific instructions. Harness escalation may be used for these operations but does not bypass harness restrictions.
- Commit coherent changes at meaningful checkpoints and before handoff, using atomic Conventional Commits (`type(scope): description`). Push at review-ready milestones or session end.
- Keep the configured agent as author. Codex commits require `Co-Authored-By: Codex <codex@users.noreply.github.com>`. Include the actual model/version when known; Claude trailers are allowed and should identify the actual model/version. Do not guess.
- Amends, rebases, squashes, and published-history rewrites on your own non-protected branch are authorized when they improve history. Sign rewritten commits, push with `--force-with-lease`, and inspect remote changes if the lease fails.
- At handoff, state the branch and worktree, whether changes are uncommitted, committed locally, or pushed, and why any push was deferred.

## Issues

- Read and follow the applicable [issue template](../../.github/ISSUE_TEMPLATE/), keeping its headings in order. Remove inapplicable sections, HTML comments, and placeholders.
- Begin with a one-line TL;DR that distinguishes the ticket in a list; treat it as a label rather than a summary.
- Define scope, exclusions, and verifiable acceptance criteria. Put decisions for the human architect under open questions.

## Pull requests

- Read and follow the [PR template](../../.github/pull_request_template.md), keeping its headings in order. Remove inapplicable sections, HTML comments, and placeholders.
- Use a Conventional Commit title, target the remote default branch, and link the issue with `Closes #N`.
- Prefer bullets; explain what reviewers need without repeating the diff or commit messages.
- Under Verification, list commands actually run and their results. Identify checks not run and why.
- End with the agent's name and actual model/version, for example "Claude (Sonnet 5.5)". Do not guess.
- After a prerequisite PR merges, retarget dependent PRs to the default branch and verify their base, commits, and diff.
