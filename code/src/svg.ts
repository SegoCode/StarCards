import type { Star } from "./github";

const CARD_HEIGHT = 48;

export interface Dimensions {
    width: number;
    height: number;
}

const XML_ENTITIES: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
};

export async function renderStars(
    stars: readonly Star[],
    dimensions: Dimensions,
    theme: string | null,
): Promise<string> {
    const { width, height } = dimensions;
    const avatars = await Promise.all(stars.map(star => inlineAvatar(star.avatarUrl)));
    const clips = stars
        .map((_, index) => {
            const y = 4 + index * CARD_HEIGHT;
            return `<clipPath id="c${index}"><circle cx="26" cy="${y + 20}" r="16"/></clipPath>`;
        })
        .join("");
    const cards = stars
        .map((star, index) => card(star, index, avatars[index], width))
        .join("");

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <defs>
            <style>${themeCss(theme)}</style>
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
        const response = await fetch(url);
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

function themeCss(theme: string | null): string {
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


function card(
    star: Star,
    index: number,
    avatar: string | undefined,
    width: number,
): string {
    const y = 4 + index * CARD_HEIGHT;
    const image = avatar
        ? `<image href="${avatar}" x="10" y="${y + 4}" width="32" height="32" clip-path="url(#c${index})"/>`
        : "";

    return `<rect class="card" x="2" y="${y}" width="${width - 4}" height="40" rx="10"/>
        ${image}
        <text class="login" x="50" y="${y + 17}" font-size="13" font-weight="650">${escapeXml(star.login)}</text>
        <text class="repo" x="50" y="${y + 32}" font-size="12">★ ${escapeXml(star.repository)}</text>
        <text class="time" x="${width - 14}" y="${y + 24}" font-size="11" text-anchor="end">${ago(star.starredAt)}</text>`;
}
