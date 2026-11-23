# Gachiz

Perps for collectibles: go long or short on an index of trading cards, gacha capsules, graded slabs or sealed packs. On Robinhood Chain.

**Status: demo.** Nothing here is live. The trading screen runs on a simulated index and paper orders, in your browser. No order is sent on-chain, and connecting a wallet only reads its address and its network.

- Site: https://www.gachiz.fun
- X: https://x.com/gachizfun

## What is in this repository

The source of the website, as it is served. There is no build step.

| Path | What it is |
|---|---|
| `site/index.html`, `site/styles.css`, `site/app.js` | The landing page |
| `site/commun.js` | Shared pieces: read-only wallet connect, alerts, sounds, the token address |
| `site/packs3d.js` | The packs in 3D (three.js) |
| `site/trade/` | The trading screen, in demo mode |
| `site/markets/` | The four index families |
| `site/docs/` | The documentation |
| `site/icons/`, `site/packs/`, `site/logos/`, `site/sounds/`, `site/fonts/`, `site/vendor/` | Assets |

## Run it locally

Serve the `site` folder over HTTP. ES modules and WebGL do not run from `file://`.

```
python -m http.server 4173 --directory site
```

Then open http://127.0.0.1:4173/

## Token

GACHIZ has no contract address yet. Any address you see elsewhere is not ours. Once it exists, it is shown on the site, in the top bar and in the footer.

## Third-party material

- three.js, MIT License, in `site/vendor/`.
- The Sora and Saira typefaces, SIL Open Font License, in `site/fonts/`.
- The interface sounds are edited from Mixkit sound effects, under the Mixkit Sound Effects Free License.
- The X, Robinhood Chain, ChatGPT, Claude and Gemini logos belong to their owners. They are shown unmodified, to name a link, a network or a tool. Gachiz is an independent project and is not affiliated with any of them.

## Rights

© 2026 Gachiz. All rights reserved, except the third-party components above, which keep their own licenses.
