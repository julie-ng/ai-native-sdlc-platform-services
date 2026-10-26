# Git workflow

## Branches and worktrees

- Determine the remote default branch and fetch it before creating an independent task branch. Branch from that fetched remote branch, not the current checkout or another task branch.
- Use your own `agent/` branch and isolated worktree. Preserve the human's uncommitted changes and other agents' checkouts. Establish ownership before concurrent writes.
- Target pull requests at the remote default branch. Stack branches or PRs only when explicitly requested, stating the dependency.
- Before a review-ready push or handoff, fetch the default branch and rebase if it advanced. Do not merge the default branch into a task branch.
- Resolve routine conflicts while preserving both sides' intent. Ask when resolution requires a product or design decision; conflict count alone is not a reason to stop.

## Agent identity in the configured dev container

- Find the read-only environment and GPG mounts in the original workspace's local `.devcontainer/devcontainer.json`. In a worktree, locate that workspace through `git worktree list`. Do not copy host-specific mount paths or credential values into documentation.
- Load the agent environment without printing its values. Use `GIT_USER_NAME` and `GIT_USER_EMAIL` for the agent identity, and import the mounted agent GPG key. Do not use the human's signing key.
- Confirm `extensions.worktreeConfig=true`. Set `user.name`, `user.email`, `user.signingkey`, and `commit.gpgsign=true` with `git config --worktree`; check effective settings once. Leave the human's shared identity unchanged.
- Authenticate as `GITHUB_USERNAME` using `GITHUB_PAT`. Export `GH_TOKEN="$GITHUB_PAT"` for `gh`; use `gh auth setup-git` for HTTPS Git authentication. Never place the token in a remote URL.
- For host/container ownership mismatches, trust only this known checkout using `git -c safe.directory="$PWD" ...` or its exact global `safe.directory` entry.
- These mounts are a local convenience, not a prerequisite for understanding or building the repository. If agent credentials are unavailable, continue permitted local work and report delivery limitations; do not substitute a personal identity.

## Commits and delivery

- Creating task branches/worktrees, signed commits, and normal pushes to the agent's own branch is authorized. Session-specific delivery instructions take precedence.
- Commit coherent changes at meaningful checkpoints and before handoff. Use atomic Conventional Commits (`type(scope): description`). Push at review-ready milestones or session end, not after each intermediate edit.
- Keep the configured agent as author. Codex commits require a `Co-Authored-By: Codex <codex@users.noreply.github.com>` trailer; include the actual model/version when known, without guessing. Claude trailers are allowed and should identify the actual model/version.
- Amends, rebases, squashes, and rewriting published history on the agent's own non-protected branch are authorized when they improve history. Sign rewritten commits and use `--force-with-lease`; inspect remote changes if the lease fails.
- After a prerequisite PR merges, retarget dependent PRs to the default branch and verify the resulting base, commits, and diff.
- Never delete branches outside `agent/`. Ask before deleting any `agent/` branch, locally or remotely. Permission to rewrite history is not permission to delete a branch.
- Never push or merge into protected branches or change branch protections. Harness escalation is authorized for the Git operations above where required; it does not bypass harness restrictions.
- At handoff, state the branch/worktree and whether changes are uncommitted, committed locally, or pushed. Explain any deferred push.

## Issues and pull requests

- Use the [issue templates](../.github/ISSUE_TEMPLATE/) and the [pull request template](../.github/pull_request_template.md). GitHub applies templates only in the web UI; `gh` and the API accept any body. Read the template file and follow its headings in order.
- Delete sections that do not apply. Remove the HTML comments and leave no placeholder text.
- Start every issue with a one-line TL;DR that lets a human tell tickets apart in a list. It is a label, not a summary.
- Issues define scope for independent work. State what is out of scope, write acceptance criteria that can be verified, and list decisions for the human architect under open questions instead of making them.
- Title pull requests as Conventional Commits and target the default branch. Link the issue with `Closes #N`.
- Under Verification, list only commands actually run with their results, and name checks that were not run with the reason.
- Prefer bullets to paragraphs. A bullet may take two or three sentences, but do not repeat the diff or commit messages.
- End the pull request description with an agent attribution line that names the agent and the actual model and version, for example "Claude (Sonnet 5.5)", not just "Claude". Do not guess the model.
