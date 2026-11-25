import { OWNER, recentStars, type Star, type StarRun } from "./github";
import { renderStars } from "./svg";

const CARD_COUNT = 3;
const MAX_CARDS = 10;

const worker = {
    async fetch(
        request: Request,
        _env: unknown,
        _context: ExecutionContext,
    ): Promise<Response> {
        if (request.method !== "GET" && request.method !== "HEAD") {
            return new Response("method not allowed", {
                status: 405,
                headers: { allow: "GET, HEAD", "cache-control": "no-store" },
            });
        }
        const url = new URL(request.url);
        if (url.pathname !== "/") {
            return new Response("not found", {
                status: 404,
                headers: { "cache-control": "no-store" },
            });
        }

        const widthParam = url.searchParams.get("width");
        const width = Number(widthParam);
        if (
            widthParam === null ||
            !/^[1-9]\d*$/.test(widthParam) ||
            !Number.isSafeInteger(width)
        ) {
            return new Response("width must be a positive integer", {
                status: 400,
                headers: { "cache-control": "no-store" },
            });
        }

        const cardsParam = url.searchParams.get("cards");
        const cards = Number(cardsParam);
        if (
            cardsParam !== null &&
            (!/^[1-9]\d*$/.test(cardsParam) || !Number.isSafeInteger(cards) || cards > MAX_CARDS)
        ) {
            return new Response(`cards must be an integer between 1 and ${MAX_CARDS}`, {
                status: 400,
                headers: { "cache-control": "no-store" },
            });
        }
        const layoutParam = url.searchParams.get("layout");
        if (
            layoutParam !== null &&
            layoutParam !== "card" &&
            layoutParam !== "feed"
        ) {
            return new Response("layout must be card or feed", {
                status: 400,
                headers: { "cache-control": "no-store" },
            });
        }
        const layout = layoutParam === "feed" ? "feed" : "card";
        const borderColorParam = url.searchParams.get("borderColor");
        if (borderColorParam !== null && !/^#?[0-9a-f]{6}$/i.test(borderColorParam)) {
            return new Response("borderColor must be a six-digit hex color", {
                status: 400,
                headers: { "cache-control": "no-store" },
            });
        }
        const borderColor = layout === "card"
            ? borderColorParam?.replace(/^#/, "").toLowerCase()
            : undefined;
        const debug = url.searchParams.get("debug") === "true";
        const cardCount = cardsParam === null ? CARD_COUNT : cards;
        try {
            const run = await recentStars(cardCount);
            if (debug) {
                return debugJson(run);
            }

            if (!run.ok && run.stars.length === 0) {
                return new Response("upstream unavailable", {
                    status: 503,
                    headers: { "cache-control": "no-store" },
                });
            }

            const svg = await renderStars(run.stars, width, layout, borderColor);
            return new Response(svg, {
                headers: run.ok ? SVG_LIVE_HEADERS : SVG_PARTIAL_HEADERS,
            });
        } catch (error) {
            if (debug) {
                return debugJson({
                    ok: false,
                    owner: OWNER,
                    fetchedAt: new Date().toISOString(),
                    limit: cardCount,
                    stars: [],
                    raw: [],
                    droppedOwnerStars: [],
                    repositories: [],
                    ignored: { forks: 0, noStars: 0, stale: 0, unparsed: 0 },
                    errors: [{
                        path: "",
                        message: error instanceof Error ? error.message : "unknown error",
                    }],
                    rateLimitRemaining: null,
                });
            }
            return new Response("upstream unavailable", {
                status: 503,
                headers: { "cache-control": "no-store" },
            });
        }
    },
} satisfies ExportedHandler;

export default worker;

const SVG_LIVE_HEADERS = {
    "content-type": "image/svg+xml; charset=utf-8",
    "cache-control": "no-store",
    "cloudflare-cdn-cache-control": "public, max-age=3600, stale-while-revalidate=3600, stale-if-error=86400",
};

const SVG_PARTIAL_HEADERS = {
    "content-type": "image/svg+xml; charset=utf-8",
    "cache-control": "no-store",
};
function withAge(star: Star): Star & { hoursAgo: number } {
    return {
        ...star,
        hoursAgo: Math.round(((Date.now() - Date.parse(star.starredAt)) / 3_600_000) * 10) / 10,
    };
}

function debugJson(run: StarRun): Response {
    return new Response(
        JSON.stringify(
            {
                ok: run.ok,
                owner: run.owner,
                fetchedAt: run.fetchedAt,
                limit: run.limit,
                stars: run.stars.map(withAge),
                raw: run.raw.map(withAge),
                droppedOwnerStars: run.droppedOwnerStars.map(withAge),
                repositories: run.repositories,
                ignored: run.ignored,
                errors: run.errors,
                rateLimitRemaining: run.rateLimitRemaining,
            },
            null,
            2,
        ),
        {
            headers: {
                "content-type": "application/json; charset=utf-8",
                "cache-control": "no-store",
            },
        },
    );
}

