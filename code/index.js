const OWNER = "SegoCode";
const CARDS = 3;
const CACHE = "public, max-age=3600";
const WIDTH = 10000;
const CARD_H = 48;
const SVG_H = 4 + CARDS * CARD_H;
const GH = {
    "user-agent": "segocode-stars",
    accept: "application/vnd.github+json",
};
const XML = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

export default {
    async fetch(request, _env, ctx) {
        const hit = await caches.default.match(request);
        if (hit) {
            return hit;
        }

        try {
            const theme = new URL(request.url).searchParams.get("theme");
            const res = svgResponse(await render(theme), CACHE);
            ctx.waitUntil(caches.default.put(request, res.clone()));
            return res;
        } catch {
            return svgResponse(
                    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="40"/>`);
        }
    },
};

function svgResponse(body, cache = "no-store") {
    return new Response(body, {
        headers: {
            "content-type": "image/svg+xml; charset=utf-8",
            "cache-control": cache,
        },
    });
}

async function gh(path) {
    const res = await fetch("https://api.github.com" + path, { headers: GH });
    if (!res.ok) {
        throw new Error(String(res.status));
    }
    return res.json();
}

async function stars() {
    const repos = (await gh(`/users/${OWNER}/repos?per_page=100&type=owner`))
            .filter(repo => !repo.fork && repo.stargazers_count);
    const events = await Promise.all(repos.map(watchEvents));
    return events
            .flat()
            .sort((a, b) => b.at.localeCompare(a.at))
            .slice(0, CARDS);
}

async function watchEvents(repo) {
    try {
        const events = await gh(`/repos/${repo.full_name}/events?per_page=100`);
        return events
                .filter(event => event.type === "WatchEvent")
                .map(event => ({
                    login: event.actor.login,
                    avatar: event.actor.avatar_url,
                    repo: repo.name,
                    at: event.created_at,
                }));
    } catch {
        return [];
    }
}

// GitHub CAMO strips external images inside SVG, so avatars must be inlined.
async function dataUri(url) {
    try {
        const res = await fetch(url);
        if (!res.ok) {
            return "";
        }
        const bytes = new Uint8Array(await res.arrayBuffer());
        const mime = res.headers.get("content-type") || "image/png";
        return `data:${mime};base64,${bytes.toBase64()}`;
    } catch {
        return "";
    }
}

function ago(iso) {
    const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
    if (min < 60) {
        return `${Math.max(1, min)}m ago`;
    }
    if (min < 1440) {
        return `${Math.round(min / 60)}h ago`;
    }
    return `${Math.round(min / 1440)}d ago`;
}

function esc(value) {
    return String(value).replace(/[&<>"]/g, ch => XML[ch]);
}

async function render(theme) {
    const list = await stars();
    const avatars = await Promise.all(list.map(star => dataUri(star.avatar)));
    const clips = list.map((_, i) => clipPath(i)).join("");
    const cards = list.map((star, i) => card(star, i, avatars[i])).join("");

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${SVG_H}" viewBox="0 0 ${WIDTH} ${SVG_H}">
        <defs>
            <style>${themeCss(theme)}</style>
            <linearGradient id="fg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#fff"/>
                <stop offset=".45" stop-color="#fff"/>
                <stop offset="1" stop-color="#fff" stop-opacity="0"/>
            </linearGradient>
            <mask id="fade"><rect width="${WIDTH}" height="${SVG_H}" fill="url(#fg)"/></mask>
            ${clips}
        </defs>
        <g mask="url(#fade)">${cards}</g>
    </svg>`;
}

function themeCss(theme) {
    const base = `
        text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    `;
    const light = `
        .card { fill: #f6f8fa; fill-opacity: .94; stroke: #c69026; stroke-opacity: .4; }
        .login { fill: #1f2328; }
        .repo { fill: #9a6700; }
        .time { fill: #59636e; }
    `;
    const dark = `
        .card { fill: #101218; fill-opacity: .78; stroke: #e3b341; stroke-opacity: .18; }
        .login { fill: #e8e6e1; }
        .repo { fill: #e3b341; }
        .time { fill: #8b8f9a; }
    `;
    if (theme === "dark") {
        return base + dark;
    }
    if (theme === "light") {
        return base + light;
    }
    return `${base}${light}
        @media (prefers-color-scheme: dark) {
            ${dark}
        }`;
}

function clipPath(i) {
    const y = 4 + i * CARD_H;
    return `<clipPath id="c${i}"><circle cx="26" cy="${y + 20}" r="16"/></clipPath>`;
}

function card(star, i, avatar) {
    const y = 4 + i * CARD_H;
    const img = avatar
            ? `<image href="${avatar}" x="10" y="${y + 4}" width="32" height="32" clip-path="url(#c${i})"/>`
            : "";
    return `<rect class="card" x="2" y="${y}" width="${WIDTH - 4}" height="40" rx="10"/>
        ${img}
        <text class="login" x="50" y="${y + 17}" font-size="13" font-weight="650">${esc(star.login)}</text>
        <text class="repo" x="50" y="${y + 32}" font-size="12">★ ${esc(star.repo)}</text>
        <text class="time" x="${WIDTH - 14}" y="${y + 24}" font-size="11" text-anchor="end">${ago(star.at)}</text>`;
}
