# Listing Invisi-Rolls on foundryvtt.com

The module is installable today from its manifest URL; the package page only makes it
findable in Foundry's setup screen. The roadmap tracks this as one item that waits on
Lewis, because it needs a credential. Everything else is below, ready to paste.

## What the site needs

Create the package at <https://foundryvtt.com/admin/packages/> (log in with the account
that will own it), then paste this as the manifest URL:

```
https://github.com/LewisIsWorking/invisi-rolls/releases/latest/download/module.json
```

The site reads title, description, version, compatibility, authors and links from that
manifest, so nothing there is retyped by hand and a release updates the listing by itself.
If a field looks wrong on the page, fix it in `module.json` in this repo and cut a
release, not in the site's form.

## The step that needs the token

The release workflow already publishes to the package API; it only needs the credential:

1. On the package page, generate its release token.
2. Add it to this repository as the `FOUNDRY_RELEASE_TOKEN` secret.

Until that secret exists the publish step warns and skips (exit 0), so a release still
ships its GitHub assets and the module stays installable.

## Check after the first release

- Setup, Add-on Modules, Install Module, search "Invisi-Rolls": the version matches the
  release.
- The compatibility badge shows the verified Foundry build, not "Compatibility Risk".
- `verify-foundry.yml`'s daily run stays green (it fetches the same manifest the site
  reads, so a broken listing shows up in Actions too).
