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
- [x] foundryvtt.com package listing (delivered: the page lists v0.4.5 verified
  for Foundry 14.370, the FOUNDRY_RELEASE_TOKEN secret is set, and the
  2026-11-14 release run published to foundryvtt.com successfully; the checks
  live in docs/PACKAGE-LISTING.md).
- [ ] Tokenless dry-run for the foundryvtt publish step (local branch
  opencode/modules/foundry-dryrun ready: DRY_RUN=true validates the release
  body with no token; tick when its PR merges).
- [ ] Daily releases-page fetch times out instead of hanging the workflow
  (local branch opencode/modules/bump-timeout ready; tick when its PR merges).
- [ ] Publish step warns and skips with no release token (local branch
  opencode/modules/publish-skip ready; tick when its PR merges).
- [ ] Workflow jobs time out instead of hanging for hours (local branch
  opencode/modules/workflow-timeouts ready; tick when its PR merges).
- [ ] Unit-cover the GM-local message lifecycle (local branch
  opencode/modules/localmsg-tests ready; tick when its PR merges).
- [ ] Guard module.json against a wrong repository, a manifest or download
  URL off releases/latest, or a dropped socket flag (local branch
  opencode/modules/manifest-guard ready; tick when its PR merges).
- [ ] Test the release stamp that rewrites version, manifest and download, so
  a stray tag or a missing VERSION cannot ship (local branch
  opencode/modules/stamp-tests ready; tick when its PR merges).
- [ ] Guard the packaging step: stamped before zipped, zip carries dist and
  lang, a re-run overwrites (local branch
  opencode/modules/release-workflow-tests ready; tick when its PR merges).
- [ ] Prove the em-dash guard still catches escapes, so a narrowed escape or
  skip list cannot pass CI (local branch opencode/modules/emdash-guard-tests
  ready; tick when its PR merges).
- [ ] Notice a new Foundry, PF2e or SF2e release without a person looking: a
  daily workflow compares them with docs/upstream.json and opens one issue
  (local branch opencode/modules/upstream-watch ready; tick when its PR
  merges).
- [ ] Guard the verified-foundry bump's build selection, so a regex or sort
  change cannot ship a stale or wrong-major badge (local branch
  opencode/modules/verified-bump-tests ready; tick when its PR merges).
- [ ] Guard the foundryvtt publish step's release body and install URLs, so a
  wrong tag, a missing compatibility field or a URL pointing at another repo
  cannot ship unnoticed (local branch opencode/modules/publish-tests ready;
  tick when its PR merges).
