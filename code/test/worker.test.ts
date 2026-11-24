import { afterEach, describe, expect, it, vi } from "vitest";

import worker from "../src";
import { recentStars } from "../src/github";
import { renderStars } from "../src/svg";

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("worker URL parameters", () => {
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

    it("rejects a non-positive cards parameter", async () => {
        const response = await worker.fetch(
            new Request("https://starcards.example/?width=640&cards=0"),
            undefined,
            {} as ExecutionContext,
        );

        expect(response.status).toBe(400);
        await expect(response.text()).resolves.toBe(
            "cards must be a positive integer",
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
            "max-age=3600",
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
            cache: { discarded: boolean; hasLastGood: boolean };
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
        expect(body.cache).toEqual({ discarded: false, hasLastGood: false });
    });

    it("serves the last good SVG for the requested border color after a GitHub error", async () => {
        const store = new Map<string, Response>();
        vi.stubGlobal("caches", {
            default: {
                match: async (request: Request) =>
                    store.get(new URL(request.url).toString())?.clone(),
                put: async (request: Request, response: Response) => {
                    store.set(new URL(request.url).toString(), response.clone());
                },
            },
        });

        let alphaOk = true;
        vi.stubGlobal("fetch", async (input: string | URL | Request) => {
            const url = input instanceof Request ? input.url : input.toString();

            if (url.includes("/users/SegoCode/repos")) {
                return Response.json([
                    {
                        fork: false,
                        full_name: "SegoCode/alpha",
                        name: "alpha",
                        stargazers_count: 1,
                    },
                ]);
            }

            if (url.includes("/repos/SegoCode/alpha/events")) {
                if (!alphaOk) {
                    return new Response("rate limited", { status: 403 });
                }
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

        const live = new Request("https://starcards.example/?width=640&borderColor=%232277FF");
        const first = await worker.fetch(
            live,
            undefined,
            {} as ExecutionContext,
        );
        const firstSvg = await first.text();
        expect(firstSvg).toContain(">one</text>");
        expect(firstSvg).toMatch(/\.card \{[^}]*stroke: #2277ff;/);
        expect(first.headers.get("cloudflare-cdn-cache-control")).toBe(
            "max-age=3600",
        );

        alphaOk = false;
        const second = await worker.fetch(
            new Request("https://starcards.example/?width=640&borderColor=2277ff"),
            undefined,
            {} as ExecutionContext,
        );
        expect(second.headers.get("x-starcards-cache")).toBe("last-good");
        await expect(second.text()).resolves.toBe(firstSvg);

        const differentColor = await worker.fetch(
            new Request("https://starcards.example/?width=640&borderColor=ff7722"),
            undefined,
            {} as ExecutionContext,
        );
        expect(differentColor.headers.get("x-starcards-cache")).toBeNull();
        await expect(differentColor.text()).resolves.not.toContain(">one</text>");
    });
});

describe("recentStars", () => {
    it("maps only usable star fields and returns the newest events", async () => {
        vi.stubGlobal("fetch", async (input: string | URL | Request) => {
            const url = input instanceof Request ? input.url : input.toString();

            if (url.includes("/users/SegoCode/repos")) {
                return Response.json([
                    {
                        fork: false,
                        full_name: "SegoCode/alpha",
                        name: "alpha",
                        stargazers_count: 4,
                        description: "discarded",
                    },
                    {
                        fork: false,
                        full_name: "SegoCode/beta",
                        name: "beta",
                        stargazers_count: 2,
                    },
                    {
                        fork: true,
                        full_name: "SegoCode/fork",
                        name: "fork",
                        stargazers_count: 9,
                    },
                    {
                        fork: false,
                        full_name: "SegoCode/empty",
                        name: "empty",
                        stargazers_count: 0,
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
                        created_at: "2026-05-01T00:00:00Z",
                    },
                    {
                        type: "WatchEvent",
                        actor: {
                            login: "alpha-user",
                            avatar_url: "https://avatars.example/alpha",
                            id: 10,
                        },
                        created_at: "2026-02-01T00:00:00Z",
                        extra: "discarded",
                    },
                    {
                        type: "IssuesEvent",
                        actor: {
                            login: "ignored",
                            avatar_url: "https://avatars.example/ignored",
                        },
                        created_at: "2026-04-01T00:00:00Z",
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
                        created_at: "2026-03-01T00:00:00Z",
                    },
                    {
                        type: "WatchEvent",
                        actor: {
                            login: "old-user",
                            avatar_url: "https://avatars.example/old",
                        },
                        created_at: "2026-01-01T00:00:00Z",
                    },
                ]);
            }

            throw new Error(`Unexpected request: ${url}`);
        });

        const run = await recentStars(2);

        expect(run.ok).toBe(true);
        expect(run.ignored).toEqual({ forks: 1, noStars: 1, unparsed: 0 });
        expect(run.droppedOwnerStars).toEqual([
            {
                login: "segocode",
                avatarUrl: "https://avatars.example/owner",
                repository: "alpha",
                starredAt: "2026-05-01T00:00:00Z",
            },
        ]);
        expect(run.stars).toEqual([
            {
                login: "beta-user",
                avatarUrl: "https://avatars.example/beta",
                repository: "beta",
                starredAt: "2026-03-01T00:00:00Z",
            },
            {
                login: "alpha-user",
                avatarUrl: "https://avatars.example/alpha",
                repository: "alpha",
                starredAt: "2026-02-01T00:00:00Z",
            },
        ]);
    });

    it("records a 4xx events fetch without dropping the other repos", async () => {
        vi.stubGlobal("fetch", async (input: string | URL | Request) => {
            const url = input instanceof Request ? input.url : input.toString();

            if (url.includes("/users/SegoCode/repos")) {
                return Response.json([
                    {
                        fork: false,
                        full_name: "SegoCode/alpha",
                        name: "alpha",
                        stargazers_count: 4,
                    },
                    {
                        fork: false,
                        full_name: "SegoCode/beta",
                        name: "beta",
                        stargazers_count: 2,
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
                        created_at: "2026-03-01T00:00:00Z",
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
                starredAt: "2026-03-01T00:00:00Z",
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

    it("fetches events only for the top repositories by star count", async () => {
        vi.stubGlobal("fetch", async (input: string | URL | Request) => {
            const url = input instanceof Request ? input.url : input.toString();

            if (url.includes("/users/SegoCode/repos")) {
                return Response.json([
                    {
                        fork: false,
                        full_name: "SegoCode/tiny",
                        name: "tiny",
                        stargazers_count: 1,
                    },
                    {
                        fork: false,
                        full_name: "SegoCode/hot",
                        name: "hot",
                        stargazers_count: 10,
                    },
                    {
                        fork: false,
                        full_name: "SegoCode/mid",
                        name: "mid",
                        stargazers_count: 8,
                    },
                    {
                        fork: false,
                        full_name: "SegoCode/low",
                        name: "low",
                        stargazers_count: 5,
                    },
                ]);
            }

            if (url.includes("/repos/SegoCode/hot/events")) {
                return Response.json([
                    {
                        type: "WatchEvent",
                        actor: {
                            login: "hot-user",
                            avatar_url: "https://avatars.example/hot",
                        },
                        created_at: "2026-01-01T00:00:00Z",
                    },
                ]);
            }

            if (url.includes("/repos/SegoCode/mid/events")) {
                return Response.json([
                    {
                        type: "WatchEvent",
                        actor: {
                            login: "mid-user",
                            avatar_url: "https://avatars.example/mid",
                        },
                        created_at: "2026-02-01T00:00:00Z",
                    },
                ]);
            }

            if (url.includes("/repos/SegoCode/low/events")) {
                return Response.json([
                    {
                        type: "WatchEvent",
                        actor: {
                            login: "low-user",
                            avatar_url: "https://avatars.example/low",
                        },
                        created_at: "2026-03-01T00:00:00Z",
                    },
                ]);
            }

            throw new Error(`Unexpected request: ${url}`);
        });

        const run = await recentStars(2);

        expect(run.repositories.map(repository => repository.name)).toEqual([
            "hot",
            "mid",
            "low",
        ]);
        expect(run.stars).toEqual([
            {
                login: "low-user",
                avatarUrl: "https://avatars.example/low",
                repository: "low",
                starredAt: "2026-03-01T00:00:00Z",
            },
            {
                login: "mid-user",
                avatarUrl: "https://avatars.example/mid",
                repository: "mid",
                starredAt: "2026-02-01T00:00:00Z",
            },
        ]);
    });
});

describe("renderStars", () => {
    it("renders a light SVG and escapes GitHub text", async () => {
        vi.stubGlobal("fetch", async () => new Response(null, { status: 404 }));

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
