# invisi-rolls

## 0.2.0

### Minor Changes

- [#9](https://github.com/LewisIsWorking/invisi-rolls/pull/9) [`b8f2ab5`](https://github.com/LewisIsWorking/invisi-rolls/commit/b8f2ab5a71d276b488c51851fd2391aab8789175) Thanks [@LewisIsWorking](https://github.com/LewisIsWorking)! - A game system can now ship Invisi-Rolls built in: each release attaches a library package (invisi-rolls.tgz) with embedInvisiRolls, which runs on the system's own socket and flag scope and stands aside if the standalone module is active.

### Patch Changes

- [#7](https://github.com/LewisIsWorking/invisi-rolls/pull/7) [`ea3264e`](https://github.com/LewisIsWorking/invisi-rolls/commit/ea3264e74481e2fa474d5c2eacfa95901e5057a6) Thanks [@LewisIsWorking](https://github.com/LewisIsWorking)! - Verified on Foundry 14.368, and each release now publishes itself to foundryvtt.com.

## 0.1.3

### Patch Changes

- [#4](https://github.com/LewisIsWorking/invisi-rolls/pull/4) [`6f1e2fd`](https://github.com/LewisIsWorking/invisi-rolls/commit/6f1e2fdfeb32a2b8b4119b24897ed31e0a19a1bf) Thanks [@LewisIsWorking](https://github.com/LewisIsWorking)! - Keep what other modules add to a message in their own preCreate hooks, such as PF2e Toolbelt's target rows on damage cards. Invisi-Rolls now takes the message only after every module has finished it.

## 0.1.2

### Patch Changes

- [#2](https://github.com/LewisIsWorking/invisi-rolls/pull/2) [`8863bde`](https://github.com/LewisIsWorking/invisi-rolls/commit/8863bde304968c8b70d17b27c2c212e100c79a90) Thanks [@LewisIsWorking](https://github.com/LewisIsWorking)! - Fix the GM's own Invisi-Rolls from PF2e character and NPC sheets (strikes and other checks) failing with "An Invisi-Roll arrived but could not be shown". PF2e leaves a function in those messages' data, which the browser refused to copy.

## 0.1.1

### Patch Changes

- [`3d305bd`](https://github.com/LewisIsWorking/invisi-rolls/commit/3d305bd9f5160e76fabf3d96635c604d38889668) Thanks [@LewisIsWorking](https://github.com/LewisIsWorking)! - Dice So Nice no longer rolls an Invisi-Roll's dice twice on the GM's screen.
