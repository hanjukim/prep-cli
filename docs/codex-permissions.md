# The Codex permission file

This is the file prep writes at `.codex/config.toml`:

```
# .codex/config.toml
default_permissions = "project-edit"
approval_policy = "on-request"

[permissions.project-edit]
extends = ":workspace"

[permissions.project-edit.filesystem.":workspace_roots"]
".env" = "deny"
".env.*" = "deny"
"**/.env" = "deny"
"**/.env.*" = "deny"
"**/*.pem" = "deny"
"**/*.key" = "deny"
"**/*.p12" = "deny"
"**/*.pfx" = "deny"
"**/id_rsa*" = "deny"
"**/id_ed25519*" = "deny"
"**/credentials.json" = "deny"
"secrets" = "deny"

[permissions.project-edit.filesystem]
"~/.ssh" = "deny"
"~/.aws" = "deny"
"~/.gnupg" = "deny"
"~/.config/gh" = "deny"
"~/.netrc" = "deny"
```

The correspondence with the Claude Code side runs like this.

- Claude defaultMode: acceptEdits → Codex `extends = ":workspace"` plus
  `approval_policy = "on-request"`.
    - Edits inside the working folder are allowed automatically.
    - Access outside the working folder, and any escalation, asks for approval.

- Claude deny: Read(...) → `"..." = "deny"` under filesystem. The conversion is
  mechanical — strip a leading `./` and the path becomes a key in the
  `":workspace_roots"` table, a path starting with `~` becomes a key in the
  filesystem table, and a trailing `/**` is dropped. This is the rule prep
  applies when it writes the file, and the values come from one place only:
  `ALWAYS_DENY` in `presets.ts`.
- Claude deny: Bash(...) → no corresponding key. Codex separates filesystem
  access from command approval, so `rm -rf`, `git push --force`,
  `git reset --hard`, `env`, and `printenv` do not carry over into the Codex
  file. Picking a key that merely looks similar would make one baseline mean
  different things in the two harnesses.
- Claude ask: WebFetch → no exact one-to-one key. Codex separates a command's
  network permission from web tool approval. Keep the default network block in
  place and, where it is needed, add only the allowed domains.

Caution: this arrangement must not be combined with an existing `sandbox_mode`
setting. If even one is present, Codex gives its old sandbox settings
precedence. Also, in an environment running a managed permission policy — as is
the case today — project settings cannot widen permissions beyond the host
policy. This follows the Codex permission profile documentation
(https://learn.chatgpt.com/docs/permissions.md) and the config file reference
(https://learn.chatgpt.com/docs/config-file/config-reference.md).
