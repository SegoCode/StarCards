# StarCards

<h3 align="center"><img src="media/demo-card.png"></h3>

<h3 align="center"><img src="media/demo-feed.png"></h3>

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

- Card layout by default, feed layout with `layout=feed`
- `width` sets the SVG size; `cards` sets how many rows (default 3)
- The service inlines each avatar in the SVG
- Cloudflare caches the image for one hour

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

```
https://starcards.<subdomain>.workers.dev/?width=640
```
*Required. SVG width in pixels, a positive integer.*

```
https://starcards.<subdomain>.workers.dev/?width=640&cards=5
```
*How many star rows to draw. Defaults to 3.*

```
https://starcards.<subdomain>.workers.dev/?width=640&layout=feed
```
*`card` (default) or `feed`.*

---
<p align="center"><a href="https://github.com/SegoCode/StarCards/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=SegoCode/StarCards" />
</a></p>
