# Slice 0: Truthful docs

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align PARITY/README/API/PRODUCTION_STATUS with code after slices 1, 2, and 4. Do not claim full Bamboo parity.

**Architecture:** Documentation only. Last commit in the PR so checkboxes match landed behavior.

**Tech Stack:** Markdown.

## Global Constraints

- Do not mark email, India templates, T&A, hired→employee, embed, or custom-level builder as done
- Careers page/application: done; embed: not done
- Letter templates: done; issuance: done after slice 2; India templates: not done
- Regional allowlists: done for `regional_view`; custom levels / No Access / post-employment / multi-level: not done
- iCal: scoped to token owner’s employee visibility

## File Map

- Modify: `docs/PARITY.md`
- Modify: `README.md` (v2 stubs that say ATS/webhooks missing)
- Modify: `API.md` (stale “not implemented” where code exists; do not invent endpoints)
- Modify: `PRODUCTION_STATUS.md` (note current main + this round; not `dbed588`)

## Task 1: Edit docs after code is green

- [ ] Update hiring section: public careers + apply checked; embed unchecked; candidate tools notes/ratings checked (remove contradictory unchecked lines)
- [ ] Access levels: add checked “regional_view location/country allowlists (fail closed)”; keep custom builder unchecked
- [ ] Letters: issuance checked; India still unchecked
- [ ] iCalendar: note token feed is scoped
- [ ] Footer: this round is not full parity
- [ ] README “What’s Stubbed” remove claims that contradict main (webhooks exist, ATS exists)

No automated test. Review by reading the four files against the spec.
