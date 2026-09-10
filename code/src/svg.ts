import type { Star } from "./github";

const CARD_TOP = 5;
const CARD_HEIGHT = 58;
const CARD_BODY_HEIGHT = 48;

export function stackHeight(cardCount: number): number {
    return CARD_TOP + cardCount * CARD_HEIGHT;
}

const XML_ENTITIES: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
};

export async function renderStars(
    stars: readonly Star[],
    width: number,
): Promise<string> {
    const height = stackHeight(stars.length);
    const avatars = await Promise.all(stars.map(star => inlineAvatar(star.avatarUrl)));
    const clips = stars
        .map((_, index) => {
            const y = CARD_TOP + index * CARD_HEIGHT;
            return `<clipPath id="c${index}"><circle cx="31" cy="${y + 24}" r="19"/></clipPath>`;
        })
        .join("");
    const cards = stars
        .map((star, index) => card(star, index, avatars[index], width))
        .join("");

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <defs>
            <style>${CARD_CSS}</style>
            <linearGradient id="fg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#fff"/>
                <stop offset=".45" stop-color="#fff"/>
                <stop offset="1" stop-color="#fff" stop-opacity="0"/>
            </linearGradient>
            <mask id="fade"><rect width="${width}" height="${height}" fill="url(#fg)"/></mask>
            ${clips}
        </defs>
        <g mask="url(#fade)">${cards}</g>
    </svg>`;
}


async function inlineAvatar(url: string): Promise<string> {
    try {
        const response = await fetch(url, {
            cf: { cacheTtl: 3600, cacheEverything: true },
        });
        if (!response.ok) {
            return "";
        }

        const bytes = new Uint8Array(await response.arrayBuffer());
        const contentType = response.headers.get("content-type");
        const mime = contentType?.startsWith("image/")
            ? contentType.split(";", 1)[0]
            : "image/png";
        const base64 = (bytes as Uint8Array & { toBase64(): string }).toBase64();
        return `data:${mime};base64,${base64}`;
    } catch {
        return "";
    }
}

function ago(iso: string): string {
    const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
    if (minutes < 60) {
        return `${Math.max(1, minutes)}m ago`;
    }
    if (minutes < 1_440) {
        return `${Math.round(minutes / 60)}h ago`;
    }
    return `${Math.round(minutes / 1_440)}d ago`;
}

function escapeXml(value: string): string {
    return value.replace(/[&<>"]/g, character => XML_ENTITIES[character] ?? character);
}

const CARD_CSS = `
        text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        .card { fill: #f6f8fa; fill-opacity: .94; stroke: #c69026; stroke-opacity: .4; }
        .login { fill: #1f2328; }
        .repo { fill: #9a6700; }
        .time { fill: #59636e; }
    `;


function card(
    star: Star,
    index: number,
    avatar: string | undefined,
    width: number,
): string {
    const y = CARD_TOP + index * CARD_HEIGHT;
    const image = avatar
        ? `<image href="${avatar}" x="12" y="${y + 5}" width="38" height="38" clip-path="url(#c${index})"/>`
        : "";

    return `<rect class="card" x="2" y="${y}" width="${width - 4}" height="${CARD_BODY_HEIGHT}" rx="12"/>
        ${image}
        <text class="login" x="60" y="${y + 20}" font-size="16" font-weight="650">${escapeXml(star.login)}</text>
        <text class="repo" x="60" y="${y + 38}" font-size="14">★ ${escapeXml(star.repository)}</text>
        <text class="time" x="${width - 17}" y="${y + 29}" font-size="13" text-anchor="end">${ago(star.starredAt)}</text>`;
}
