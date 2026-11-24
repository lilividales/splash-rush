# 🌊 Splash Rush

A fast 3D water-slide racing game (installable PWA). Slide through **Singapore, Mexico, France, Thailand, Japan and Egypt**, dodge themed obstacles, collect coins and power-ups, race rivals and unlock chibi characters.

**Controls:** drag left/right on touch, or use `A`/`D` or arrow keys. `Esc`/`P` pauses.

## Run locally

It is a static site with no build step. Serve the folder over HTTP (service workers need `http://localhost` or HTTPS):

```bash
npx serve .
# or: python3 -m http.server 8080
```

## Deploy on Vercel

1. Import this repo in Vercel (Framework Preset: **Other**, no build command, output directory `.`).
2. Deploy. `vercel.json` sets the cache and service-worker headers.

Or from the CLI: `npx vercel --prod`.

## Install on your phone

- **Android / Chrome:** open the deployed URL and tap **Install app** (or ⋮ → *Install app*).
- **iPhone / Safari:** open the URL, tap **Share → Add to Home Screen**.

After the first visit the game works offline.

## Project layout

| Path | Purpose |
| --- | --- |
| `index.html`, `style.css`, `game.js` | The game (Three.js, procedural 3D, no assets to download) |
| `lib/three.min.js` | Three.js r128 (MIT), bundled so the game runs offline |
| `manifest.webmanifest`, `sw.js` | PWA manifest and offline service worker |
| `icons/` | App icon (`icon.svg` source plus rendered PNGs, incl. a maskable icon) |
| `vercel.json` | Vercel headers/config |

When you change any cached file, bump `VERSION` in `sw.js` so installed apps update.

## Credits

Three.js is © the three.js authors, MIT licensed.
