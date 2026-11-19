# Invisi-Rolls roadmap

v0.4.5. Verified for Foundry 14.370. Live checks run in the C99 (PF2e) and C98 (SF2e)
test worlds on the VPS: 27 core checks, 13 PF2e card-button checks, 5 Dice So Nice
checks, plus the 345-check Creature Template Applier run in the same worlds.

## Standing watch

Whenever Foundry, the PF2e system, the SF2e system, or this module releases a new
version, re-run the live checks (`W=c99 DSN=1` then `W=c98 DSN=1` with the runner in
`~/.claude/scripts/foundry-c99-live/run-c99.sh`) and fix what breaks. Last full run:
2026-11-18, all green on Foundry 14.370, PF2e 8.7.1, SF2e 1.7.1, module v0.4.5.
The daily `verify-foundry.yml` workflow keeps the compatibility badge current.

## Known limits (not tracked: neither is fixable)

- Module sockets carry no sender, so a tampered client can fake a card's author.
- A player's own Invisi-Roll is evaluated in that player's browser (see README).

## Tracker

Owner: Foundry Modules (Invisi-Rolls and Templates)

- [x] Point the embed example at the latest library tarball instead of a pinned
  version (delivered with this roadmap).
- [x] Note the socket-sender limit in the README Limits section (delivered as a
  follow-up on this branch).
- [ ] foundryvtt.com package listing (waiting on Lewis: create the package page
  and add the FOUNDRY_RELEASE_TOKEN secret; until then the release workflow
  warns and skips the publish step).
- [ ] Tokenless dry-run for the foundryvtt publish step (local branch
  opencode/modules/foundry-dryrun ready: DRY_RUN=true validates the release
  body with no token; tick when its PR merges).
- [ ] Daily releases-page fetch times out instead of hanging the workflow
  (local branch opencode/modules/bump-timeout ready; tick when its PR merges).
