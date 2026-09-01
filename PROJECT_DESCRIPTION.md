# Snugget Canvas — Multiplayer Agents on a Shared Canvas

## Description

The best work tools of the last two decades won by going multiplayer: Google
Docs replaced Word, and Figma beat Photoshop, by turning solo tools into places
where teams do their best work together. AI hasn't had that moment yet — working
with a coding agent or an AI agent is still single-player, an answer in a box
only you can see, and the best you can do for a teammate is send a read-only
transcript. Snugget Canvas solves this by putting browsers, coding agents, and
AI agents as live windows on one shared, infinite pan/zoom canvas, so anyone on
a team can drop into the same running agent session to watch it work, redirect
it, queue its next steps, and hand it off — the way they'd work with any other
teammate.

## The problem

Agents now run tasks that take hours, days, or weeks — refactors, migrations,
research, drafting. Work at that scale was never meant to be done alone; it pulls
in many people across a company, each dropping in when their piece matters. But
today every one of those sessions is a private thread. You open a chat, type a
prompt, get an answer only you can see, and the moment a teammate needs in, all
you can share is a transcript they can't touch. The most powerful new tool a
team has is the one thing they still each use by themselves.

## What Snugget Canvas is

Snugget Canvas is a shared, infinite pan/zoom canvas ("desktop") that holds live,
fully interactive windows — not static frames. It is deliberately scoped to three
kinds of window:

- **Browsers** — real, interactive web pages (the ticket, the staging site, the
  dashboard, the docs) running right on the canvas.
- **Coding agents** — Claude Code sessions running against a real project
  directory, streaming their work live.
- **AI agents** — chat-style agents working a task alongside the rest of the
  canvas.

A team lays these out around a problem — the agent next to the site it's changing
next to the ticket it's closing — and shares the whole arrangement at once.
Joining a project means joining that canvas, not clicking a link.

## Multiplayer by default

The canvas is the shared room. Sharing a project puts teammates on the same
canvas, seeing the same windows in the same places, able to act on them.

- **Shared live agent sessions.** A running coding or AI agent is a window
  anyone in the project can open and watch stream in real time — reasoning,
  running commands, editing files as it happens, not a transcript after the fact.
- **Redirect and hand off.** Any collaborator can send the agent a new
  instruction, answer a question it's blocked on, or take over while a teammate
  steps away. The session keeps running; control moves between people like it
  would between humans pairing.
- **Queued follow-ups (prompt chains).** Each agent window has an ordered queue
  of follow-up prompts that fire as it finishes each task, or immediately if it's
  idle. A teammate can line up the next three steps while the agent works the
  first — the plan becomes a shared, visible artifact instead of living in one
  person's head.
- **Shared browsing context.** The browser windows next to the agent give
  everyone who drops in the same picture of what the work is actually against.

## Why the canvas is the right surface

Long-running agent work is inherently multi-window and multi-person. You're never
just reading agent output — you're checking the site, the ticket, the logs. A
canvas lets a team lay all of that out once and share it, so joining a session
means joining a workspace. Anywhere a team already crowds around one problem —
a deal, a ticket, a contract, a model, a campaign — there should be a shared
canvas with a multiplayer agent on it that they all touch.

## Status

Snugget Canvas exists today as a single-player Electron app with the infinite
canvas, live browser windows, coding-agent windows, and per-agent prompt chains
built and working. The scope is being narrowed to browsers, coding agents, and
AI agents, and the multi-user layer — shared projects, real-time canvas sync,
live shared agent sessions, presence, and hand-off — is the focus of this work.
