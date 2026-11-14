---
'invisi-rolls': patch
---

Make Reveal safe. The card is now removed only once the public message has actually been posted: if another module cancels the post, or it fails, the GM keeps the card and sees a warning instead of losing it. A second click while a reveal is on its way is ignored, and Reveal waits (up to 30 seconds) while Dice So Nice is still rolling the card, so modules that finish a card when its dice land are not cut off.
