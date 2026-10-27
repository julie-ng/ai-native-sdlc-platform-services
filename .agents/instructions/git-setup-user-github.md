## Configure git user and github credentials (dev container only)

If agent credentials are unavailable, continue permitted local work and report delivery limitations; do not substitute a personal identity.

### Repository ownership

- This dev container mounts only this repository, so `safe.directory '*'` is permitted. Run `git config --global --add safe.directory '*'` once unless already configured, then use plain `git` commands.

### Find config mount

- If in a worktree, locate that workspace through `git worktree list`.
- Find the read-only environment and GPG mounts in the original workspace's local `.devcontainer/devcontainer.json`, which has:
  - `.env.agent` - see file comments for details
  - `julieio-agent.private.asc` - used for signing commits
- Do not copy host-specific mount paths into documentation.

### Set git user

Based on `.env.agent`

- Confirm `extensions.worktreeConfig=true`.
- Set `user.name`, `user.email`, `user.signingkey`
- Set `commit.gpgsign=true` with `git config --worktree`; check effective settings once.
- Authenticate as `GITHUB_USERNAME` using `GITHUB_PAT`.
  - Export `GH_TOKEN="$GITHUB_PAT"` for `gh`;
  - use `gh auth setup-git` for HTTPS Git authentication.
  - Never place the token in a remote URL.

### Token permissions

- The agent PAT lacks `workflow` scope, which limits adding or updating GitHub Actions workflows. GitHub allows files whose path and contents already exist on another branch; see [GitHub's scope documentation](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps#available-scopes).
