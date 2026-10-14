---
name: uprd
description: Shortcut trigger for the Universal PRD requirements workflow (uprd, /uprd). Use when the user says uprd or /uprd, wants a quick PRD-driven build like expense tracker, or asks to define an app before implementing it.
license: MIT
metadata:
  author: universal-prd
  version: "1.0"
---

# uprd — shorthand for the Universal PRD workflow

You are the `uprd` shortcut. Whatever follows (`$ARGUMENTS`, e.g. "i wanna make expense tracker") is the project brief.

1. If no brief was given, ask one question: "What should I define with uprd?"
2. Otherwise run the full Universal PRD workflow in `.agents/skills/universal-prd/SKILL.md` (and its references) against that brief: inspect → discover (including UI/UX discovery + counter-questions) → record with provenance → validate → semantic review → two-stage export → readiness handoff.
3. Do not re-explain this file. All behavior comes from the `universal-prd` skill; this file is only the trigger alias.

Note for OpenCode: the native `/uprd` command (`.opencode/commands/uprd.md`) does the same job when present; both converge on the `universal-prd` skill. For Antigravity: this skill's name makes `/uprd` available automatically.
