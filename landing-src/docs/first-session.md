---
title: First session
description: A guided tour of the dashboard — from a blank workspace to your first Claude session, running and monitored.
eyebrow: Getting Started
permalink: /docs/first-session/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux is already running (if not, see [Quickstart](/purplemux/docs/quickstart/)). This page walks through what the UI actually does so the first few minutes feel less abstract.

## The dashboard

When you open `http://localhost:8022` you land on a **workspace**. Think of a workspace as a folder of related tabs — one for the project you're Claude-coding, another for the docs you're writing, another for ad-hoc shell work.

The layout:

- **Left sidebar** — workspaces and sessions, Claude status badges, rate-limit widget, notes, stats
- **Main area** — panes inside the current workspace; each pane can have multiple tabs
- **Top bar** — workspace name, split controls, settings

Toggle the sidebar any time with <kbd>⌘B</kbd>. Switch Workspace/Sessions mode in the sidebar with <kbd>⌘⇧B</kbd>.

## Create a workspace

First run gives you one default workspace. To add another:

1. Click **+ New workspace** at the top of the sidebar (<kbd>⌘N</kbd>).
2. Name it and pick a default directory — this is where new tabs' shells start.
3. Hit Enter. The empty workspace opens.

You can reorder and rename workspaces later by dragging in the sidebar.

## Open your first tab

A workspace starts empty. Add a tab with <kbd>⌘T</kbd> or the **+** button on the tab bar.

Pick a **template**:

- **Terminal** — a blank shell. Good for `vim`, `docker`, scripts.
- **Claude** — starts with `claude` already running in the shell.

{% call callout('tip', 'Templates are just shortcuts') %}
Under the hood every tab is a regular shell. The Claude template is just "open a terminal and run `claude`". If you run `claude` manually in a Terminal tab later, purplemux notices and starts surfacing its status the same way.
{% endcall %}

## Read the session status

Look at the **sidebar session row** for your tab. You'll see one of these indicators:

| State | Meaning |
|---|---|
| **Idle** (gray) | Claude is waiting for your input. |
| **Busy** (purple spinner) | Claude is working — reading files, running tools. |
| **Needs input** (amber) | Claude hit a permission prompt or asked a question. |
| **Review** (blue) | Work done, Claude stopped; there's something to check. |

Transitions are near-instant. See [Session status](/purplemux/docs/session-status/) for how this is detected.

## Respond to a permission prompt

When Claude asks to run a tool or edit a file, purplemux **intercepts the prompt** and shows it inline in the session view. You can:

- Click **1 · Yes** / **2 · Yes, always** / **3 · No**, or
- Press the number keys on your keyboard, or
- Ignore it and answer on your phone — mobile Web Push fires the same alert.

The Claude CLI never actually blocks on the intercepted prompt; purplemux pipes your answer back.

## Split and switch

Once you have a tab running, try:

- <kbd>⌘D</kbd> — split the current pane to the right
- <kbd>⌘⇧D</kbd> — split downward
- <kbd>⌘⌥←/→/↑/↓</kbd> — move focus between splits
- <kbd>⌘⇧[</kbd> / <kbd>⌘⇧]</kbd> — previous / next tab

Full list on the [Keyboard shortcuts](/purplemux/docs/keyboard-shortcuts/) page.

## Save and restore

Close the browser. Your tabs don't go anywhere — tmux holds them open on the server. Refresh in an hour (or a week) and purplemux restores the exact layout, including split ratios and working directories.

Even a server reboot is recoverable: on restart, purplemux reads the saved layout from `~/.purplemux/workspaces.json`, relaunches shells in the right directories, and reattaches Claude sessions where possible.

## Reach it from your phone

Run:

```bash
tailscale serve --bg 8022
```

On your phone, open `https://<machine>.<tailnet>.ts.net`, tap **Share → Add to Home Screen**, and grant notification permission. You now get push alerts for **needs-input** and **review** states even when the tab is closed.

Full walkthrough: [PWA setup](/purplemux/docs/pwa-setup/) · [Web Push](/purplemux/docs/web-push/) · [Tailscale](/purplemux/docs/tailscale/).

## What's next

- **[Keyboard shortcuts](/purplemux/docs/keyboard-shortcuts/)** — every binding in one table.
- **[Browser support](/purplemux/docs/browser-support/)** — compatibility matrix, especially iOS Safari 16.4+.
- Explore the sidebar: **Notes** (<kbd>⌘⇧E</kbd>) for the AI daily report, **Stats** (<kbd>⌘⇧U</kbd>) for usage analytics.
