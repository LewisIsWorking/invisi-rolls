---
'invisi-rolls': patch
---

Fix a hidden roll reaching every player through PF2e's spell variant buttons. Choosing a variant on a cast card (a save, for example) in Invisi mode rebuilt the card and wrote it into the existing chat message, which every player already had. That update is now stopped, and the rebuilt card goes to the GMs as an Invisi card instead. A normal chat message that carries the Invisi mark now shows the GM a warning, not the "no player can see this" badge.
