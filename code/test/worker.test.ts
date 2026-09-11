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
            new Request("https://starcards.example/?width=640&layout=feed"),
            undefined,
            {} as ExecutionContext,
        );
        const svg = await response.text();

        expect(response.status).toBe(200);
        expect(svg).toContain("starred");
        expect(svg).not.toContain('class="card"');
        expect(svg).toContain(">one</tspan>");
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

        await expect(recentStars(2)).resolves.toEqual([
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
        expect(svg).toContain("stroke: #c69026");
        expect(svg).not.toContain("starred");
        expect(svg).not.toContain("prefers-color-scheme");
        expect(svg).not.toContain("#101218");
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
