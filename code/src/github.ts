export const OWNER = "SegoCode";
const GITHUB_HEADERS = {
    "user-agent": "segocode-stars",
    accept: "application/vnd.github+json",
};

const EVENTS_WINDOW_MS = 35 * 24 * 60 * 60 * 1000;
const BATCH_SIZE = 3;
const MAX_REPO_SCANS = 20;

interface GitHubRepository {
    fork: boolean;
    fullName: string;
    name: string;
    starCount: number;
    updatedAt: string;
    updatedAtMs: number;
}
interface GitHubEvent {
    type: string;
    login: string;
    avatarUrl: string;
    createdAt: string;
}

export interface Star {
    login: string;
    avatarUrl: string;
    repository: string;
    starredAt: string;
}

export interface RunError {
    path: string;
    repository?: string;
    status?: number;
    message: string;
}

export interface RepoFetch {
    name: string;
    fullName: string;
    starCount: number;
    updatedAt: string;
    status: number;
    eventCount: number;
    watchCount: number;
    ms: number;
    error?: string;
}
export interface StarRun {
    ok: boolean;
    owner: string;
    fetchedAt: string;
    limit: number;
    stars: Star[];
    raw: Star[];
    droppedOwnerStars: Star[];
    repositories: RepoFetch[];
    ignored: { forks: number; noStars: number; stale: number; unparsed: number };
    errors: RunError[];
    rateLimitRemaining: string | null;
}

export async function recentStars(limit: number): Promise<StarRun> {
    const reposPath = `/users/${OWNER}/repos?per_page=100&type=owner&sort=updated&direction=desc`;
    const listed = await githubJson(reposPath);
    if (!listed.ok) {
        throw new Error(listed.message);
    }
    if (!Array.isArray(listed.data)) {
        throw new Error("GitHub repository response is not an array");
    }

    const cutoffMs = Date.now() - EVENTS_WINDOW_MS;
    let forks = 0;
    let noStars = 0;
    let stale = 0;
    let unparsed = 0;
    const repositories: GitHubRepository[] = [];
    for (const value of listed.data) {
        const repository = parseRepository(value);
        if (repository === null) {
            unparsed += 1;
            continue;
        }
        if (repository.fork) {
            forks += 1;
            continue;
        }
        if (repository.starCount <= 0) {
            noStars += 1;
            continue;
        }
        if (repository.updatedAtMs < cutoffMs) {
            stale += 1;
            continue;
        }
        repositories.push(repository);
    }

    repositories.sort((left, right) => right.updatedAtMs - left.updatedAtMs);

    const candidates = repositories.slice(0, MAX_REPO_SCANS);
    const ownerName = OWNER.toLowerCase();
    const fetches: RepoWatch[] = [];
    const raw: Star[] = [];
    let ranked: Star[] = [];

    let offset = 0;
    while (offset < candidates.length) {
        if (ranked.length >= limit) {
            const kthStarMs = Date.parse(ranked[limit - 1]!.starredAt);
            const nextRepoUpdatedMs = candidates[offset]!.updatedAtMs;
            if (kthStarMs >= nextRepoUpdatedMs) {
                break;
            }
        }
        const size = offset === 0 && limit === 1
            ? 1
            : Math.min(BATCH_SIZE, candidates.length - offset);
        const batch = candidates.slice(offset, offset + size);
        offset += size;

        const results = await Promise.all(batch.map(watchEvents));
        fetches.push(...results);
        for (const result of results) {
            raw.push(...result.stars);
        }
        ranked = raw
            .filter(star => star.login.toLowerCase() !== ownerName)
            .sort((left, right) => right.starredAt.localeCompare(left.starredAt));
    }

    const errors = fetches.flatMap(fetch => fetch.errors);
    const droppedOwnerStars = raw.filter(star => star.login.toLowerCase() === ownerName);

    return {
        ok: errors.length === 0,
        owner: OWNER,
        fetchedAt: new Date().toISOString(),
        limit,
        stars: ranked.slice(0, limit),
        raw,
        droppedOwnerStars,
        repositories: fetches.map(fetch => fetch.repository),
        ignored: { forks, noStars, stale, unparsed },
        errors,
        rateLimitRemaining: fetches.reduce(
            (remaining, fetch) => fetch.rateLimitRemaining ?? remaining,
            listed.rateLimitRemaining,
        ),
    };
}

interface RepoWatch {
    repository: RepoFetch;
    stars: Star[];
    errors: RunError[];
    rateLimitRemaining: string | null;
}

async function watchEvents(repository: GitHubRepository): Promise<RepoWatch> {
    const path = `/repos/${repository.fullName}/events?per_page=100`;
    const started = Date.now();
    try {
        const payload = await githubJson(path);
        const ms = Date.now() - started;
        if (!payload.ok) {
            return {
                repository: {
                    name: repository.name,
                    fullName: repository.fullName,
                    starCount: repository.starCount,
                    updatedAt: repository.updatedAt,
                    status: payload.status,
                    eventCount: 0,
                    watchCount: 0,
                    ms,
                    error: payload.message,
                },
                stars: [],
                errors: [{
                    path,
                    repository: repository.name,
                    status: payload.status,
                    message: payload.message,
                }],
                rateLimitRemaining: payload.rateLimitRemaining,
            };
        }
        if (!Array.isArray(payload.data)) {
            const message = "GitHub events response is not an array";
            return {
                repository: {
                    name: repository.name,
                    fullName: repository.fullName,
                    starCount: repository.starCount,
                    updatedAt: repository.updatedAt,
                    status: payload.status,
                    eventCount: 0,
                    watchCount: 0,
                    ms,
                    error: message,
                },
                stars: [],
                errors: [{ path, repository: repository.name, status: payload.status, message }],
                rateLimitRemaining: payload.rateLimitRemaining,
            };
        }

        const stars = payload.data
            .map(parseEvent)
            .filter((event): event is GitHubEvent =>
                event !== null && event.type === "WatchEvent",
            )
            .map(event => ({
                login: event.login,
                avatarUrl: event.avatarUrl,
                repository: repository.name,
                starredAt: event.createdAt,
            }));

        return {
            repository: {
                name: repository.name,
                fullName: repository.fullName,
                starCount: repository.starCount,
                updatedAt: repository.updatedAt,
                status: payload.status,
                eventCount: payload.data.length,
                watchCount: stars.length,
                ms,
            },
            stars,
            errors: [],
            rateLimitRemaining: payload.rateLimitRemaining,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : "unknown error";
        return {
            repository: {
                name: repository.name,
                fullName: repository.fullName,
                starCount: repository.starCount,
                updatedAt: repository.updatedAt,
                status: 0,
                eventCount: 0,
                watchCount: 0,
                ms: Date.now() - started,
                error: message,
            },
            stars: [],
            errors: [{ path, repository: repository.name, message }],
            rateLimitRemaining: null,
        };
    }
}

interface GitHubJson {
    ok: boolean;
    status: number;
    data: unknown;
    rateLimitRemaining: string | null;
    message: string;
}

async function githubJson(path: string): Promise<GitHubJson> {
    const response = await fetch(`https://api.github.com${path}`, {
        headers: GITHUB_HEADERS,
    });
    const rateLimitRemaining = response.headers.get("x-ratelimit-remaining");
    if (!response.ok) {
        return {
            ok: false,
            status: response.status,
            data: null,
            rateLimitRemaining,
            message: `GitHub API returned ${response.status}`,
        };
    }
    return {
        ok: true,
        status: response.status,
        data: await response.json(),
        rateLimitRemaining,
        message: "",
    };
}

function parseRepository(value: unknown): GitHubRepository | null {
    if (
        typeof value !== "object" ||
        value === null ||
        !("fork" in value) ||
        !("full_name" in value) ||
        !("name" in value) ||
        !("stargazers_count" in value) ||
        !("updated_at" in value)
    ) {
        return null;
    }

    const {
        fork,
        full_name: fullName,
        name,
        stargazers_count: starCount,
        updated_at: updatedAt,
    } = value;
    if (
        typeof fork !== "boolean" ||
        typeof fullName !== "string" ||
        typeof name !== "string" ||
        typeof starCount !== "number" ||
        typeof updatedAt !== "string"
    ) {
        return null;
    }
    const updatedAtMs = Date.parse(updatedAt);
    if (!Number.isFinite(updatedAtMs)) {
        return null;
    }

    return { fork, fullName, name, starCount, updatedAt, updatedAtMs };
}

function parseEvent(value: unknown): GitHubEvent | null {
    if (
        typeof value !== "object" ||
        value === null ||
        !("type" in value) ||
        !("created_at" in value) ||
        !("actor" in value)
    ) {
        return null;
    }

    const actor = value.actor;
    if (
        typeof actor !== "object" ||
        actor === null ||
        !("login" in actor) ||
        !("avatar_url" in actor)
    ) {
        return null;
    }

    const { type, created_at: createdAt } = value;
    const { login, avatar_url: avatarUrl } = actor;
    if (
        typeof type !== "string" ||
        typeof login !== "string" ||
        typeof avatarUrl !== "string" ||
        typeof createdAt !== "string" ||
        !Number.isFinite(Date.parse(createdAt))
    ) {
        return null;
    }

    return { type, login, avatarUrl, createdAt };
}
