# Workflow reference — Universal PRD

## Operation map (MCP ↔ CLI)

| Goal | MCP tool | CLI |
|---|---|---|
| Open/init | `prd_initialize` | `universal-prd init` |
| Inspect | `prd_inspect_workspace` | `universal-prd inspect` |
| Read | `prd_get_spec` | `universal-prd get --section <name>` |
| Edit | `prd_update_spec` | (use MCP or edit `.prd/spec.json` then `validate`) |
| Validate | `prd_validate` | `universal-prd validate` |
| Profiles | `prd_list_profiles` | `universal-prd profiles` |
| Preview | `prd_export_preview` | `universal-prd export --preview` |
| Apply | `prd_export_apply` | `universal-prd export --authorize <paths>` |
| Status | `prd_status` | `universal-prd status` |

## Discovery question bank (ask only unanswered ones)

- What problem does this solve, for whom, and how will we know it worked (metrics)?
- Who are the roles? What can each role do / not do?
- What is explicitly out of scope (non-goals)?
- Functional: key workflows end-to-end? Entities and their lifecycle?
- Non-functional: performance, reliability, offline, accessibility, security/privacy?
- Constraints: stack, hosting, integrations, deadlines, licensing?
- Failure modes: what must never happen? What happens offline / on error?

## UI/UX discovery bank (run fully when the project has or needs any interface)

Ask in small batches; record answers as requirements, not chat memory.

- **Surfaces & devices**: web, mobile, desktop, or several? Viewports/breakpoints? Touch, mouse, keyboard, or all?
- **User context**: low light or glare, one-handed mobile use, motion sensitivity (reduced-motion needs)? Screen-reader or other assistive-tech users? Languages?
- **Brand**: existing identity (colors, fonts, logo) or greenfield? Designs the user admires (candidates for `hallmark study`)? Anti-references (looks to avoid)?
- **Information architecture**: nav structure, key screens, content hierarchy, what lives one tap/click away?
- **Visual direction**: light/dark/both? Density? Tone (playful, serious, premium, utilitarian)? Motion level? Imagery (photo, illustration, icon, 3D)?
- **Accessibility floor**: WCAG target (state it explicitly)? Contrast minimums? Focus order and visible focus? Full keyboard flows? Touch target sizes? Reduced-motion fallback?
- **Every screen, five states**: loading, empty, error, offline, success — what does each look like for each key screen? Missing states are the #1 source of thin UI requirements.
- **Acceptance per screen**: turn each answer into testable acceptance criteria on the requirement (layout, content, states, breakpoints).
- **Design-system ownership**: who writes `DESIGN_SYSTEM.md`, and does the `hallmark` skill implement the UI (recommended when installed)? Record as a `user_confirmed` decision.

## Counter-questions (challenge the brief, don't just transcribe it)

Ask at most 2–3 per round. Each carries a default recommendation the user can accept with one word.

- "What should this explicitly NOT do?" (forces non-goals; record them)
- "Walk me through the failure: what exactly does the user see when X breaks or is offline?"
- "Who is harmed, and how badly, if this is wrong, slow, or down for an hour?"
- "What are you assuming about the user's device, network, ability, or attention that might be false?"
- "If you could only ship one screen or one workflow, which one — and what gets cut?"
- "What existing thing does this replace, and what behavior must be preserved?"
- Record declined challenges as `rejected` alternatives in `decisions` (why-not documentation is as valuable as why).

## Context upkeep (graft)

After any code change in implementation work, refresh the repo context graph with `graft build` (structural pass, no key) or at least `graft check` for drift. In OpenCode the `graft-rebuild` file-hook plugin automates this when installed; in every other host, do it yourself at the end of each work block. Never let the graph drift across sessions.

## Provenance transitions

- `agent_inferred → user_confirmed`: only via explicit user confirmation (recorded in `decisions`).
- `unresolved → confirmed`: via `resolve-question` with a resolution string.
- `blocking` findings stay `open` until fixed or formally waived by the user.
