import { recentStars } from "./github";
import { renderStars } from "./svg";

const CARD_COUNT = 3;
const PUBLIC_CACHE = "public, max-age=3600";

const worker = {
    async fetch(
        request: Request,
        _env: unknown,
        context: ExecutionContext,
    ): Promise<Response> {
        const url = new URL(request.url);
        const widthParam = url.searchParams.get("width");
        const heightParam = url.searchParams.get("height");
        const width = Number(widthParam);
        const height = Number(heightParam);
        if (
            widthParam === null ||
            heightParam === null ||
            !/^[1-9]\d*$/.test(widthParam) ||
            !/^[1-9]\d*$/.test(heightParam) ||
            !Number.isSafeInteger(width) ||
            !Number.isSafeInteger(height)
        ) {
            return new Response("width and height must be positive integers", {
                status: 400,
                headers: { "cache-control": "no-store" },
            });
        }

        const noCacheParam = url.searchParams.get("noCache");
        if (
            noCacheParam !== null &&
            noCacheParam !== "true" &&
            noCacheParam !== "false"
        ) {
            return new Response("noCache must be true or false", {
                status: 400,
                headers: { "cache-control": "no-store" },
            });
        }

        const noCache = noCacheParam === "true";
        if (!noCache) {
            const cached = await caches.default.match(request);
            if (cached) {
                return cached;
            }
        }

        const dimensions = { width, height };
        try {
            const theme = url.searchParams.get("theme");
            const stars = await recentStars(CARD_COUNT);
            const response = new Response(
                await renderStars(stars, dimensions, theme),
                {
                    headers: {
                        "content-type": "image/svg+xml; charset=utf-8",
                        "cache-control": noCache ? "no-store" : PUBLIC_CACHE,
                    },
                },
            );
            if (!noCache) {
                context.waitUntil(caches.default.put(request, response.clone()));
            }
            return response;
        } catch {
            return new Response(
                `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"/>`,
                {
                    headers: {
                        "content-type": "image/svg+xml; charset=utf-8",
                        "cache-control": "no-store",
                    },
                },
            );
        }
    },
} satisfies ExportedHandler;

export default worker;

