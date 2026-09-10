import { recentStars } from "./github";
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

        const cardCount = cardsParam === null ? CARD_COUNT : cards;
        try {
            const stars = await recentStars(cardCount);
            return new Response(await renderStars(stars, width), {
                headers: {
                    "content-type": "image/svg+xml; charset=utf-8",
                    "cache-control": "no-store",
                    "cloudflare-cdn-cache-control": "max-age=3600",
                },
            });
        } catch {
            return new Response(
                `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${stackHeight(cardCount)}"/>`,
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

