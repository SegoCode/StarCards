# StarCards

<h3 align="center"><img src="media/demo-card.png"></h3>

<p align="center">
  <a href="#about">About</a> •
  <a href="#features">Features</a> •
  <a href="#quick-start--information">Quick Start & Information</a>
</p>

## About
[![Top language](https://img.shields.io/github/languages/top/SegoCode/StarCards?style=flat-square)](https://github.com/SegoCode/StarCards)
[![Repository size](https://img.shields.io/github/repo-size/SegoCode/StarCards?style=flat-square&label=repo%20size)](https://github.com/SegoCode/StarCards)
[![Commit activity per year](https://img.shields.io/github/commit-activity/y/SegoCode/StarCards?style=flat-square&label=commits)](https://github.com/SegoCode/StarCards/graphs/commit-activity)
[![Licencia: PolyForm Noncommercial + GNU AGPL-3.0](https://img.shields.io/badge/License-PolyForm%20Noncommercial%20%2B%20GNU%20AGPL--3.0-blue?style=flat-square)](https://github.com/SegoCode/StarCards/blob/main/LICENSE)
[![Bitcoin BTC](https://img.shields.io/badge/buy_me_a_coffee-BTC-F7931A?style=flat-square&logo=bitcoin&logoColor=white)](https://github.com/SegoCode/SegoCode/discussions/2)

StarCards is a Cloudflare Worker that returns an SVG of the latest GitHub stars on your repositories. You deploy your own instance, then embed that URL in markdown.

## Features

- SVG built for GitHub READMEs
- Two layouts: stacked cards or a star feed
- Inlined GitHub avatars
- Cloudflare caches the SVG at the edge

## Quick Start & Information

Set `OWNER` in `code/src/github.ts` to your GitHub username. From `code/`:

```
pnpm install
pnpm deploy
```

Wrangler prints a `*.workers.dev` URL. Embed it:

```
![stars](https://starcards.<subdomain>.workers.dev/?width=995)
```

```
<img src="https://starcards.<subdomain>.workers.dev/?width=640">
```

```
![stars](https://starcards.<subdomain>.workers.dev/?width=995&layout=feed)
```

> [!NOTE]
> Point `OWNER` at your GitHub user before you deploy. Cloudflare caches each URL for one hour.

### Available Parameters

Query string on the worker URL. Unknown names are ignored.

```
https://starcards.<subdomain>.workers.dev/?width=640
```
*`width` (required). SVG width in pixels. Must be a positive integer (for example `640`). Height follows the layout and the number of rows. Missing, `0`, or any non-integer returns HTTP 400 with `width must be a positive integer`.*

```
https://starcards.<subdomain>.workers.dev/?width=640&cards=5
```
*`cards` (optional). How many star rows to draw. Must be a positive integer. Omit it and the worker draws 3. Invalid values return HTTP 400 with `cards must be a positive integer`.*

```
https://starcards.<subdomain>.workers.dev/?width=640&layout=feed
```
*`layout` (optional). `card` or `feed`. Omit it or pass `card` for stacked cards (login, starred repo, time). `feed` draws one line per event: `login starred repo`. Any other value returns HTTP 400 with `layout must be card or feed`.*

---
<p align="center"><a href="https://github.com/SegoCode/StarCards/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=SegoCode/StarCards" />
</a></p>
