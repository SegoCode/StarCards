import { afterEach, describe, expect, it, vi } from "vitest";

import worker from "../src";
import { recentStars } from "../src/github";
import { renderStars } from "../src/svg";

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("worker URL parameters", () => {
    it("requires positive width and height parameters", async () => {
        const response = await worker.fetch(
            new Request("https://starcards.example/?width=0&height=148"),
            undefined,
            {} as ExecutionContext,
        );

        expect(response.status).toBe(400);
        await expect(response.text()).resolves.toBe(
            "width and height must be positive integers",
        );
    });

    it("bypasses cache reads and writes when noCache is true", async () => {
        const match = vi.fn();
        const put = vi.fn();
        vi.stubGlobal("caches", { default: { match, put } });
        vi.stubGlobal("fetch", async () => Response.json([]));

        const response = await worker.fetch(
            new Request(
                "https://starcards.example/?width=640&height=148&noCache=true",
            ),
            undefined,
            { waitUntil: vi.fn() } as unknown as ExecutionContext,
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(match).not.toHaveBeenCalled();
        expect(put).not.toHaveBeenCalled();
        await expect(response.text()).resolves.toContain(
            '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="148"',
        );
    });

    it("caches for one hour by default", async () => {
        const match = vi.fn().mockResolvedValue(undefined);
        const put = vi.fn().mockResolvedValue(undefined);
        const waitUntil = vi.fn();
        vi.stubGlobal("caches", { default: { match, put } });
        vi.stubGlobal("fetch", async () => Response.json([]));

        const request = new Request(
            "https://starcards.example/?width=800&height=148",
        );
        const response = await worker.fetch(
            request,
            undefined,
            { waitUntil } as unknown as ExecutionContext,
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe(
            "public, max-age=3600",
        );
        expect(match).toHaveBeenCalledWith(request);
        expect(put).toHaveBeenCalledOnce();
        expect(waitUntil).toHaveBeenCalledOnce();
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
    it("renders a dark SVG and escapes GitHub text", async () => {
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
            { width: 640, height: 148 },
            "dark",
        );

        expect(svg).toContain('height="148"');
        expect(svg).toContain('width="640"');
        expect(svg).toContain("name&lt;&amp;&gt;&quot;");
        expect(svg).toContain("repo&lt;&amp;&gt;&quot;");
        expect(svg).toContain(".card { fill: #101218;");
        expect(svg).not.toContain("prefers-color-scheme");
    });
});
