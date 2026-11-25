import { afterEach, describe, expect, it, vi } from "vitest";

import worker from "../src";
import { recentStars } from "../src/github";
import { renderStars } from "../src/svg";

afterEach(() => {
    vi.unstubAllGlobals();
});

const isoDaysAgo = (days: number): string =>
    new Date(Date.now() - days * 86_400_000).toISOString();

describe("worker URL parameters", () => {
    it("rejects non-GET/HEAD methods and non-root paths", async () => {
        const post = await worker.fetch(
            new Request("https://starcards.example/?width=640", { method: "POST" }),
            undefined,
            {} as ExecutionContext,
        );
        expect(post.status).toBe(405);
        expect(post.headers.get("allow")).toBe("GET, HEAD");
        expect(post.headers.get("cache-control")).toBe("no-store");

        const icon = await worker.fetch(
            new Request("https://starcards.example/favicon.ico"),
            undefined,
            {} as ExecutionContext,
        );
        expect(icon.status).toBe(404);
        expect(icon.headers.get("cache-control")).toBe("no-store");
    });

    it("requires a positive width parameter", async () => {
        const response = await worker.fetch(
            new Request("https://starcards.example/?width=0"),
            undefined,
            {} as ExecutionContext,
        );

        expect(response.status).toBe(400);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(response.headers.get("cloudflare-cdn-cache-control")).toBeNull();
        await expect(response.text()).resolves.toBe(
            "width must be a positive integer",
        );
    });

    it.each(["0", "-1", "11", "500"])("rejects an out-of-range cards parameter (%s)", async (cards) => {
        const response = await worker.fetch(
            new Request(`https://starcards.example/?width=640&cards=${cards}`),
            undefined,
            {} as ExecutionContext,
        );

        expect(response.status).toBe(400);
        await expect(response.text()).resolves.toBe(
            "cards must be an integer between 1 and 10",
        );
    });

    it("rejects an unknown layout parameter", async () => {
        const response = await worker.fetch(
            new Request("https://starcards.example/?width=640&layout=ticket"),
            undefined,
            {} as ExecutionContext,
        );

        expect(response.status).toBe(400);
        expect(response.headers.get("cache-control")).toBe("no-store");
        await expect(response.text()).resolves.toBe(
            "layout must be card or feed",
        );
    });

    it.each(["", "abc", "blue", "#112233; fill: red"])(
        "rejects an invalid borderColor (%j)",
        async (color) => {
            const response = await worker.fetch(
                new Request(`https://starcards.example/?width=640&borderColor=${encodeURIComponent(color)}`),
                undefined,
                {} as ExecutionContext,
            );

            expect(response.status).toBe(400);
            expect(response.headers.get("cache-control")).toBe("no-store");
            await expect(response.text()).resolves.toBe(
                "borderColor must be a six-digit hex color",
            );
        },
    );

    it("renders only as many cards as the cards parameter", async () => {
        vi.stubGlobal("fetch", async (input: string | URL | Request) => {
            const url = input instanceof Request ? input.url : input.toString();

            if (url.includes("/users/SegoCode/repos")) {
                return Response.json([
                    {
                        fork: false,
                        full_name: "SegoCode/alpha",
                        name: "alpha",
                        stargazers_count: 3,
                        updated_at: isoDaysAgo(1),
                    },
                ]);
            }
            if (url.includes("/repos/SegoCode/alpha/events")) {
                return Response.json([
                    {
                        type: "WatchEvent",
                        actor: {
                            login: "one",
                            avatar_url: "https://avatars.example/1",
                        },
                        created_at: "2026-03-03T00:00:00Z",
                    },
                    {
                        type: "WatchEvent",
                        actor: {
                            login: "two",
                            avatar_url: "https://avatars.example/2",
                        },
                        created_at: "2026-03-02T00:00:00Z",
                    },
                    {
                        type: "WatchEvent",
                        actor: {
                            login: "three",
                            avatar_url: "https://avatars.example/3",
                        },
                        created_at: "2026-03-01T00:00:00Z",
                    },
                ]);
            }

            return new Response(null, { status: 404 });
        });

        const response = await worker.fetch(
            new Request(
                "https://starcards.example/?width=640&height=800&cards=2",
            ),
            undefined,
            {} as ExecutionContext,
        );
        const svg = await response.text();

        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(response.headers.get("cloudflare-cdn-cache-control")).toBe(
            "public, max-age=3600, stale-while-revalidate=3600, stale-if-error=86400",
        );
        expect(svg.match(/class="card"/g)).toHaveLength(2);
        expect(svg).toContain('width="640"');
        expect(svg).toContain('height="121"');
        expect(svg).not.toContain('height="800"');
        expect(svg).toContain(">one</text>");
        expect(svg).toContain(">two</text>");
        expect(svg).not.toContain(">three</text>");
    });

    it("renders feed layout from the layout parameter", async () => {
        vi.stubGlobal("fetch", async (input: string | URL | Request) => {
            const url = input instanceof Request ? input.url : input.toString();

            if (url.includes("/users/SegoCode/repos")) {
                return Response.json([
                    {
                        fork: false,
                        full_name: "SegoCode/alpha",
                        name: "alpha",
                        stargazers_count: 1,
                        updated_at: isoDaysAgo(1),
                    },
                ]);
            }
            if (url.includes("/repos/SegoCode/alpha/events")) {
                return Response.json([
                    {
                        type: "WatchEvent",
                        actor: {
                            login: "one",
                            avatar_url: "https://avatars.example/1",
                        },
                        created_at: "2026-03-03T00:00:00Z",
                    },
                ]);
            }

            return new Response(null, { status: 404 });
        });

        const response = await worker.fetch(
            new Request("https://starcards.example/?width=640&layout=feed&borderColor=2277ff"),
            undefined,
            {} as ExecutionContext,
        );
        const svg = await response.text();

        expect(response.status).toBe(200);
        expect(svg).toContain("starred");
        expect(svg).not.toContain('class="card"');
        expect(svg).toContain(">one</tspan>");
        expect(svg).not.toContain("#2277ff");
    });

    it("returns JSON diagnostics when debug=true", async () => {
        vi.stubGlobal("fetch", async (input: string | URL | Request) => {
            const url = input instanceof Request ? input.url : input.toString();

            if (url.includes("/users/SegoCode/repos")) {
                return Response.json([
                    {
                        fork: false,
                        full_name: "SegoCode/alpha",
                        name: "alpha",
                        stargazers_count: 1,
                        updated_at: isoDaysAgo(1),
                    },
                ]);
            }
            if (url.includes("/repos/SegoCode/alpha/events")) {
                return Response.json([
                    {
                        type: "WatchEvent",
                        actor: {
                            login: "one",
                            avatar_url: "https://avatars.example/1",
                        },
                        created_at: "2026-03-03T00:00:00Z",
                    },
                ]);
            }

            return new Response(null, { status: 404 });
        });

        const response = await worker.fetch(
            new Request("https://starcards.example/?width=640&debug=true"),
            undefined,
            {} as ExecutionContext,
        );
        const body = await response.json() as {
            ok: boolean;
            stars: Array<{ login: string; hoursAgo: number }>;
            raw: unknown[];
            repositories: Array<{ name: string; watchCount: number }>;
        };

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe(
            "application/json; charset=utf-8",
        );
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(response.headers.get("cloudflare-cdn-cache-control")).toBeNull();
        expect(body.ok).toBe(true);
        expect(body.stars[0]?.login).toBe("one");
        expect(body.stars[0]?.hoursAgo).toEqual(expect.any(Number));
        expect(body.raw).toHaveLength(1);
        expect(body.repositories[0]).toEqual(
            expect.objectContaining({ name: "alpha", watchCount: 1 }),
        );
    });

    it("returns 503 on total GitHub failure to trigger Workers Cache stale-if-error, and uncacheable partial SVG when stars remain", async () => {
        let betaOk = true;
        vi.stubGlobal("fetch", async (input: string | URL | Request) => {
            const url = input instanceof Request ? input.url : input.toString();

            if (url.includes("/users/SegoCode/repos")) {
                return Response.json([
                    {
                        fork: false,
                        full_name: "SegoCode/alpha",
                        name: "alpha",
                        stargazers_count: 1,
                        updated_at: isoDaysAgo(1),
                    },
                    {
                        fork: false,
                        full_name: "SegoCode/beta",
                        name: "beta",
                        stargazers_count: 1,
                        updated_at: isoDaysAgo(2),
                    },
                ]);
            }
            if (url.includes("/repos/SegoCode/alpha/events")) {
                return new Response("rate limited", { status: 403 });
            }
            if (url.includes("/repos/SegoCode/beta/events")) {
                if (!betaOk) {
                    return new Response("rate limited", { status: 403 });
                }
                return Response.json([
                    {
                        type: "WatchEvent",
                        actor: {
                            login: "beta-fan",
                            avatar_url: "https://avatars.example/2",
                        },
                        created_at: isoDaysAgo(2),
                    },
                ]);
            }

            return new Response(null, { status: 404 });
        });

        const partial = await worker.fetch(
            new Request("https://starcards.example/?width=640"),
            undefined,
            {} as ExecutionContext,
        );
        expect(partial.status).toBe(200);
        expect(partial.headers.get("cache-control")).toBe("no-store");
        expect(partial.headers.get("cloudflare-cdn-cache-control")).toBeNull();
        await expect(partial.text()).resolves.toContain(">beta-fan</text>");

        betaOk = false;
        const totalFailure = await worker.fetch(
            new Request("https://starcards.example/?width=640"),
            undefined,
            {} as ExecutionContext,
        );
        expect(totalFailure.status).toBe(503);
        expect(totalFailure.headers.get("cache-control")).toBe("no-store");
        expect(totalFailure.headers.get("cloudflare-cdn-cache-control")).toBeNull();
    });
});

describe("recentStars", () => {
    it("maps only usable star fields, prunes stale repos, and returns the newest events", async () => {
        const tAlpha = isoDaysAgo(2);
        const tBeta = isoDaysAgo(1);
        const tOld = isoDaysAgo(10);

        vi.stubGlobal("fetch", async (input: string | URL | Request) => {
            const url = input instanceof Request ? input.url : input.toString();

            if (url.includes("/users/SegoCode/repos")) {
                return Response.json([
                    {
                        fork: false,
                        full_name: "SegoCode/alpha",
                        name: "alpha",
                        stargazers_count: 4,
                        updated_at: tAlpha,
                        description: "discarded",
                    },
                    {
                        fork: false,
                        full_name: "SegoCode/beta",
                        name: "beta",
                        stargazers_count: 2,
                        updated_at: tBeta,
                    },
                    {
                        fork: true,
                        full_name: "SegoCode/fork",
                        name: "fork",
                        stargazers_count: 9,
                        updated_at: tBeta,
                    },
                    {
                        fork: false,
                        full_name: "SegoCode/empty",
                        name: "empty",
                        stargazers_count: 0,
                        updated_at: tBeta,
                    },
                    {
                        fork: false,
                        full_name: "SegoCode/stale",
                        name: "stale",
                        stargazers_count: 100,
                        updated_at: isoDaysAgo(60),
                    },
                ]);
            }

            if (url.includes("/repos/SegoCode/alpha/events")) {
                return Response.json([
                    {
                        type: "WatchEvent",
                        actor: {
                            login: "segocode",
                            avatar_url: "https://avatars.example/owner",
                        },
                        created_at: isoDaysAgo(0),
                    },
                    {
                        type: "WatchEvent",
                        actor: {
                            login: "alpha-user",
                            avatar_url: "https://avatars.example/alpha",
                            id: 10,
                        },
                        created_at: tAlpha,
                        extra: "discarded",
                    },
                    {
                        type: "IssuesEvent",
                        actor: {
                            login: "ignored",
                            avatar_url: "https://avatars.example/ignored",
                        },
                        created_at: tBeta,
                    },
                ]);
            }

            if (url.includes("/repos/SegoCode/beta/events")) {
                return Response.json([
                    {
                        type: "WatchEvent",
                        actor: {
                            login: "beta-user",
                            avatar_url: "https://avatars.example/beta",
                        },
                        created_at: tBeta,
                    },
                    {
                        type: "WatchEvent",
                        actor: {
                            login: "old-user",
                            avatar_url: "https://avatars.example/old",
                        },
                        created_at: tOld,
                    },
                ]);
            }

            throw new Error(`Unexpected request: ${url}`);
        });

        const ownerSelfStarAt = new Date();
        vi.useFakeTimers({ now: ownerSelfStarAt });
        try {
            const run = await recentStars(2);

            expect(run.ok).toBe(true);
            expect(run.ignored).toEqual({ forks: 1, noStars: 1, stale: 1, unparsed: 0 });
            expect(run.droppedOwnerStars).toHaveLength(1);
            expect(run.droppedOwnerStars[0]?.login).toBe("segocode");
            expect(run.stars).toEqual([
                {
                    login: "beta-user",
                    avatarUrl: "https://avatars.example/beta",
                    repository: "beta",
                    starredAt: tBeta,
                },
                {
                    login: "alpha-user",
                    avatarUrl: "https://avatars.example/alpha",
                    repository: "alpha",
                    starredAt: tAlpha,
                },
            ]);
        } finally {
            vi.useRealTimers();
        }
    });

    it("records a 4xx events fetch without dropping the other repos", async () => {
        const tBeta = isoDaysAgo(1);
        vi.stubGlobal("fetch", async (input: string | URL | Request) => {
            const url = input instanceof Request ? input.url : input.toString();

            if (url.includes("/users/SegoCode/repos")) {
                return Response.json([
                    {
                        fork: false,
                        full_name: "SegoCode/alpha",
                        name: "alpha",
                        stargazers_count: 4,
                        updated_at: isoDaysAgo(1),
                    },
                    {
                        fork: false,
                        full_name: "SegoCode/beta",
                        name: "beta",
                        stargazers_count: 2,
                        updated_at: tBeta,
                    },
                ]);
            }

            if (url.includes("/repos/SegoCode/alpha/events")) {
                return new Response("rate limited", { status: 403 });
            }

            if (url.includes("/repos/SegoCode/beta/events")) {
                return Response.json([
                    {
                        type: "WatchEvent",
                        actor: {
                            login: "beta-user",
                            avatar_url: "https://avatars.example/beta",
                        },
                        created_at: tBeta,
                    },
                ]);
            }

            throw new Error(`Unexpected request: ${url}`);
        });

        const run = await recentStars(2);

        expect(run.ok).toBe(false);
        expect(run.stars).toEqual([
            {
                login: "beta-user",
                avatarUrl: "https://avatars.example/beta",
                repository: "beta",
                starredAt: tBeta,
            },
        ]);
        expect(run.errors).toEqual([
            expect.objectContaining({
                repository: "alpha",
                status: 403,
                message: "GitHub API returned 403",
            }),
        ]);
    });

    it("captures recent stars on 1-star repos and stops early once older updated_at repos cannot beat the cutoff", async () => {
        const requestedRepos: string[] = [];
        const t1 = isoDaysAgo(1);
        const t2 = isoDaysAgo(2);
        const t3 = isoDaysAgo(3);
        const t4 = isoDaysAgo(5);
        const t5 = isoDaysAgo(8);

        vi.stubGlobal("fetch", async (input: string | URL | Request) => {
            const url = input instanceof Request ? input.url : input.toString();

            if (url.includes("/users/SegoCode/repos")) {
                return Response.json([
                    {
                        fork: false,
                        full_name: "SegoCode/tiny-new",
                        name: "tiny-new",
                        stargazers_count: 1,
                        updated_at: t1,
                    },
                    {
                        fork: false,
                        full_name: "SegoCode/pushed-only",
                        name: "pushed-only",
                        stargazers_count: 50,
                        updated_at: t2,
                    },
                    {
                        fork: false,
                        full_name: "SegoCode/flagship",
                        name: "flagship",
                        stargazers_count: 800,
                        updated_at: t3,
                    },
                    {
                        fork: false,
                        full_name: "SegoCode/older-active",
                        name: "older-active",
                        stargazers_count: 200,
                        updated_at: t4,
                    },
                    {
                        fork: false,
                        full_name: "SegoCode/never-touched",
                        name: "never-touched",
                        stargazers_count: 900,
                        updated_at: t5,
                    },
                ]);
            }

            const match = /\/repos\/SegoCode\/([^/]+)\/events/.exec(url);
            if (match?.[1]) {
                requestedRepos.push(match[1]);
            }

            if (url.includes("/repos/SegoCode/tiny-new/events")) {
                return Response.json([
                    {
                        type: "WatchEvent",
                        actor: { login: "tiny-fan", avatar_url: "https://avatars.example/1" },
                        created_at: t1,
                    },
                ]);
            }

            if (url.includes("/repos/SegoCode/pushed-only/events")) {
                // Only PushEvent, no WatchEvent -> forces scanner to check next batch if needed
                return Response.json([
                    {
                        type: "PushEvent",
                        actor: { login: "someone", avatar_url: "https://avatars.example/p" },
                        created_at: t2,
                    },
                ]);
            }

            if (url.includes("/repos/SegoCode/flagship/events")) {
                return Response.json([
                    {
                        type: "WatchEvent",
                        actor: { login: "flag-fan-1", avatar_url: "https://avatars.example/2" },
                        created_at: t3,
                    },
                    {
                        type: "WatchEvent",
                        actor: { login: "flag-fan-2", avatar_url: "https://avatars.example/3" },
                        created_at: isoDaysAgo(4),
                    },
                ]);
            }

            throw new Error(`Should have stopped early before fetching: ${url}`);
        });

        const run = await recentStars(3);

        expect(requestedRepos).toEqual(["tiny-new", "pushed-only", "flagship"]);
        expect(run.stars.map(s => `${s.repository}:${s.login}`)).toEqual([
            "tiny-new:tiny-fan",
            "flagship:flag-fan-1",
            "flagship:flag-fan-2",
        ]);
    });

    it("scans only the top updated repo when it already proves the newest N stars, cutting API calls in half", async () => {
        const requestedRepos: string[] = [];
        vi.stubGlobal("fetch", async (input: string | URL | Request) => {
            const url = input instanceof Request ? input.url : input.toString();
            if (url.includes("/users/SegoCode/repos")) {
                return Response.json([
                    {
                        fork: false,
                        full_name: "SegoCode/AutoWall",
                        name: "AutoWall",
                        stargazers_count: 772,
                        updated_at: isoDaysAgo(1),
                    },
                    {
                        fork: false,
                        full_name: "SegoCode/SegoCode",
                        name: "SegoCode",
                        stargazers_count: 2,
                        updated_at: isoDaysAgo(20),
                    },
                    {
                        fork: false,
                        full_name: "SegoCode/TailscaleActions",
                        name: "TailscaleActions",
                        stargazers_count: 1,
                        updated_at: isoDaysAgo(25),
                    },
                ]);
            }
            const match = /\/repos\/SegoCode\/([^/]+)\/events/.exec(url);
            if (match?.[1]) {
                requestedRepos.push(match[1]);
            }
            if (url.includes("/repos/SegoCode/AutoWall/events")) {
                return Response.json([
                    { type: "WatchEvent", actor: { login: "a", avatar_url: "https://avatars.example/a" }, created_at: isoDaysAgo(1) },
                    { type: "WatchEvent", actor: { login: "b", avatar_url: "https://avatars.example/b" }, created_at: isoDaysAgo(5) },
                    { type: "WatchEvent", actor: { login: "c", avatar_url: "https://avatars.example/c" }, created_at: isoDaysAgo(8) },
                ]);
            }
            throw new Error(`Should not have requested secondary repo: ${url}`);
        });

        const run = await recentStars(3);
        expect(run.ok).toBe(true);
        expect(requestedRepos).toEqual(["AutoWall"]);
        expect(run.stars.map(s => s.login)).toEqual(["a", "b", "c"]);
    });
});

describe("renderStars", () => {
    it("requests resized s=80 avatars, renders a light SVG, and escapes GitHub text", async () => {
        const avatarUrls: string[] = [];
        vi.stubGlobal("fetch", async (input: string | URL | Request) => {
            avatarUrls.push(input instanceof Request ? input.url : input.toString());
            return new Response(null, { status: 404 });
        });

        const svg = await renderStars(
            [
                {
                    login: 'name<&>"',
                    avatarUrl: "https://avatars.example/user",
                    repository: 'repo<&>"',
                    starredAt: new Date().toISOString(),
                },
            ],
            640,
        );

        expect(avatarUrls).toEqual(["https://avatars.example/user?s=80"]);
        expect(svg).toContain('height="63"');
        expect(svg).toContain('width="640"');
        expect(svg).toContain("name&lt;&amp;&gt;&quot;");
        expect(svg).toContain("repo&lt;&amp;&gt;&quot;");
        expect(svg).toContain("stroke: #c69026; stroke-opacity: .4;");
        expect(svg).not.toContain("starred");
        expect(svg).not.toContain("prefers-color-scheme");
        expect(svg).not.toContain("#101218");
    });

    it("draws a custom border color at full opacity", async () => {
        vi.stubGlobal("fetch", async () => new Response(null, { status: 404 }));

        const svg = await renderStars([], 640, "card", "36393e");

        expect(svg).toContain("stroke: #36393e; stroke-opacity: 1; stroke-width: 2;");
    });

    it("renders the feed sentence layout", async () => {
        vi.stubGlobal("fetch", async () => new Response(null, { status: 404 }));

        const svg = await renderStars(
            [
                {
                    login: 'name<&>"',
                    avatarUrl: "https://avatars.example/user",
                    repository: 'repo<&>"',
                    starredAt: new Date().toISOString(),
                },
                {
                    login: "two",
                    avatarUrl: "https://avatars.example/2",
                    repository: "ky",
                    starredAt: new Date().toISOString(),
                },
            ],
            640,
            "feed",
        );

        expect(svg).toContain('height="90"');
        expect(svg).toContain("starred");
        expect(svg).toContain("name&lt;&amp;&gt;&quot;");
        expect(svg).toContain("repo&lt;&amp;&gt;&quot;");
        expect(svg).not.toContain('class="card"');
        expect(svg.match(/class="rule"/g)).toHaveLength(1);
    });
});
