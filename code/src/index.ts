import { OWNER, recentStars, type Star, type StarRun } from "./github";
import { renderStars, stackHeight } from "./svg";

const CARD_COUNT = 3;

const worker = {
    async fetch(
        request: Request,
        _env: unknown,
        _context: ExecutionContext,
    ): Promise<Response> {
        const url = new URL(request.url);
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
            (!/^[1-9]\d*$/.test(cardsParam) || !Number.isSafeInteger(cards))
        ) {
            return new Response("cards must be a positive integer", {
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
        const key = liveKey(url, width, cardCount, layout, borderColor);

        try {
            const run = await recentStars(cardCount);
            const cached = await matchLastGood(key);
            if (debug) {
                return debugJson(run, {
                    discarded: !run.ok,
                    hasLastGood: cached !== undefined,
                });
            }
            if (!run.ok && cached !== undefined) {
                const lastGood = new Response(cached.body, cached);
                lastGood.headers.set("x-starcards-cache", "last-good");
                return lastGood;
            }

            const svg = await renderStars(run.stars, width, layout, borderColor);
            const response = new Response(svg, {
                headers: run.ok ? SVG_LIVE_HEADERS : SVG_SKIP_HEADERS,
            });
            if (run.ok) {
                await putLastGood(key, response.clone());
            }
            return response;
        } catch (error) {
            const cached = await matchLastGood(key);
            if (debug) {
                return debugJson(
                    {
                        ok: false,
                        owner: OWNER,
                        fetchedAt: new Date().toISOString(),
                        limit: cardCount,
                        stars: [],
                        raw: [],
                        droppedOwnerStars: [],
                        repositories: [],
                        ignored: { forks: 0, noStars: 0, unparsed: 0 },
                        errors: [{
                            path: "",
                            message: error instanceof Error ? error.message : "unknown error",
                        }],
                        rateLimitRemaining: null,
                    },
                    { discarded: true, hasLastGood: cached !== undefined },
                );
            }
            if (cached !== undefined) {
                const lastGood = new Response(cached.body, cached);
                lastGood.headers.set("x-starcards-cache", "last-good");
                return lastGood;
            }
            return new Response(
                `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${stackHeight(cardCount, layout)}"/>`,
                { headers: SVG_SKIP_HEADERS },
            );
        }
    },
} satisfies ExportedHandler;

export default worker;

const SVG_LIVE_HEADERS = {
    "content-type": "image/svg+xml; charset=utf-8",
    "cache-control": "no-store",
    "cloudflare-cdn-cache-control": "max-age=3600",
};

const SVG_SKIP_HEADERS = {
    "content-type": "image/svg+xml; charset=utf-8",
    "cache-control": "no-store",
};

function liveKey(
    url: URL,
    width: number,
    cards: number,
    layout: string,
    borderColor: string | undefined,
): Request {
    const key = new URL(url.origin + url.pathname);
    key.searchParams.set("width", String(width));
    key.searchParams.set("cards", String(cards));
    key.searchParams.set("layout", layout);
    if (borderColor !== undefined) {
        key.searchParams.set("borderColor", borderColor);
    }
    return new Request(key, { method: "GET" });
}

async function matchLastGood(key: Request): Promise<Response | undefined> {
    if (typeof caches === "undefined") {
        return undefined;
    }
    try {
        return await caches.default.match(key);
    } catch {
        return undefined;
    }
}

async function putLastGood(key: Request, response: Response): Promise<void> {
    if (typeof caches === "undefined") {
        return;
    }
    try {
        await caches.default.put(key, response);
    } catch {
        return;
    }
}

function withAge(star: Star): Star & { hoursAgo: number } {
    return {
        ...star,
        hoursAgo: Math.round(((Date.now() - Date.parse(star.starredAt)) / 3_600_000) * 10) / 10,
    };
}

function debugJson(
    run: StarRun,
    cache: { discarded: boolean; hasLastGood: boolean },
): Response {
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
                cache,
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

