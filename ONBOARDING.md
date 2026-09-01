> # SUPERSEDED: DO NOT FOLLOW
>
> This document tells a new developer to edit files directly on the production
> server and describes changes going live in about two seconds. That workflow
> is retired and now contradicts the operating contract.
>
> - Never SSH-edit production source. It is overwritten by the next deploy.
>   `AGENTS.md` sections 3 and 14.
> - The server runs a production build. There is no HMR and nothing is live in
>   two seconds. A release is required.
> - It also names `mo.legenex.com`, which is no longer a Plesk domain.
>
> **Current onboarding: `README.md`, then `AGENTS.md`, then `docs/STATE.md`.**
>
> Retained as the historical record of how the team was originally onboarded.

---

# Welcome to LegalOS — chat with Claude, changes go live in seconds

You're going to edit our live site by chatting with Claude in VS Code. **No local setup. No clone. No Docker. No Node.** You prompt Claude → Claude edits the file on our server → live site reflects the change in ~2 seconds.

Total time on YOUR side: about 5 minutes (mostly waiting on Claude).

---

## Before you start — get one thing from Morne

Get this via **Signal** or **1Password** (NOT email/Slack):

- **Morne's Signal handle** — you'll send him your SSH public key during setup so he can authorize your machine to talk to the server.

That's all. No `.env`, no passwords, no anything else.

---

## Step 1 — Install VS Code

Skip if you already have it.

- Go to https://code.visualstudio.com/
- Download for your OS, run the installer, accept defaults.

---

## Step 2 — Install the Claude Code extension

1. Open VS Code.
2. Click **Extensions** in the left sidebar (or **Ctrl+Shift+X** / **Cmd+Shift+X**).
3. Search: **Claude Code**
4. Click **Install** on the one by **Anthropic**.

---

## Step 3 — Open Claude Code chat

Click the Claude icon in VS Code's left sidebar. If asked to sign in, follow the prompt — it'll open your browser, sign in with your Claude.ai account, come back.

The chat panel is now open.

---

## Step 4 — Paste this into Claude

Copy this entire block (triple-click → Ctrl+C), paste into the Claude chat, press Enter:

```
Fetch https://mo.legenex.com/teammate-init.txt and follow it step by step to set me up to edit the LegalOS project from this Claude. Use TodoWrite to track progress.
```

---

## Step 5 — Follow Claude's instructions

Claude will:

1. **Check if you have an SSH key.** Generate one if you don't.
2. **Add an SSH config entry** so connecting to our server is just `ssh legalos`.
3. **Show you your public key** (a long line that starts with `ssh-ed25519 ...`). Copy it.

Then YOU do this manually:

4. **Send the public key to Morne via Signal** with the message: "Please add this to authorized_keys."

   Wait for him to confirm. Tell Claude: "Morne added my key, continue."

5. **Claude tests the connection.** When it works, Claude says "you're ready."

Total time for setup: **~5 minutes** (most of it waiting for Morne to authorize you).

---

## Step 6 — Edit by chatting

Once Claude says "ready," just describe what you want to change:

- "Change the home page heading to 'New Tagline'"
- "Make the primary buttons darker"
- "Add a 'pricing' link in the navigation"
- "Fix the typo on /privacy where it says 'recieve'"

Claude will SSH to the server, edit the file, and tell you: **"Live at https://mo.legenex.com in ~2 seconds — hard-refresh."**

---

## Step 7 — Save your work to git (periodically)

Saves are already live. But to preserve history (so we can rollback / track who changed what), commit periodically. End of day, after a meaningful feature, etc.

Just say:

```
commit
```

Claude will show you what's changed since the last commit, ask for a message, then push to GitHub.

---

## Things to know

### You can't break the local site because there is no local site
Saves go directly to our production server. If you make a typo, the live site shows an error overlay until you save the file again with the fix. So **save twice** if needed — fix the typo, save again, site recovers in ~2 seconds.

### Coordinate with Morne
Both of you are editing the **same live server**. Before touching big files, ping in Signal: "I'm editing the domains page, ~15 min." Last save wins — two people editing the same file silently overwrite each other.

### Things you must NOT do
- Don't ask Claude to edit `.env` unless Morne explicitly tells you to. Wrong values break the live site.
- Don't ask Claude to run `docker compose down` or `systemctl stop legalos-dev` — those break the running site.
- Don't ask Claude to use `npm install` — this project uses **pnpm**.

### Things that don't hot-reload automatically
Most changes are live on save. These require a small extra command Claude will run:

| What changed | Claude needs to run |
|---|---|
| New pnpm package | `pnpm install` + `systemctl restart legalos-dev` |
| Payload collection field | `pnpm payload migrate:create <name>` + `pnpm payload migrate` |
| `.env` was edited | `systemctl restart legalos-dev` |
| Dev server is stuck | `systemctl restart legalos-dev` |

If any of these confuse you, just describe what's happening to Claude — it'll figure out the right command.

---

## Quick reference

| Question | Answer |
|---|---|
| Where do I edit code? | In VS Code, by telling Claude what to change |
| How fast does my change go live? | ~2 seconds after Claude says "live at..." |
| Where's the live site? | https://mo.legenex.com |
| Where's the admin? | https://mo.legenex.com/admin |
| What if Claude can't fix something? | Screenshot the issue and Signal Morne |
| How do I save my work to git? | Say "commit" in chat |
| Did I do something dangerous? | If you didn't ask Claude to edit `.env`, `docker compose down`, or use `npm` — probably not |
