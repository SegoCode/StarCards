export const OWNER = "SegoCode";
const GITHUB_HEADERS = {
    "user-agent": "segocode-stars",
    accept: "application/vnd.github+json",
};

const EVENTS_WINDOW_MS = 35 * 24 * 60 * 60 * 1000;
const BATCH_SIZE = 2;
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
    rateLimitResetInMinutes: number | null;
}

interface RateLimitState {
    remaining: string | null;
    resetInMinutes: number | null;
}

export async function recentStars(limit: number): Promise<StarRun> {
    const rateLimit: RateLimitState = { remaining: null, resetInMinutes: null };
    const reposPath = `/users/${OWNER}/repos?per_page=100&type=owner&sort=updated&direction=desc`;
    const listed = await githubJson(reposPath, rateLimit);
    if (!listed.ok || !Array.isArray(listed.data)) {
        const message = !listed.ok ? listed.message : "GitHub repository response is not an array";
        return {
            ok: false,
            owner: OWNER,
            fetchedAt: new Date().toISOString(),
            limit,
            stars: [],
            raw: [],
            droppedOwnerStars: [],
            repositories: [],
            ignored: { forks: 0, noStars: 0, stale: 0, unparsed: 0 },
            errors: [{
                path: reposPath,
                ...(listed.status > 0 ? { status: listed.status } : {}),
                message,
            }],
            rateLimitRemaining: rateLimit.remaining,
            rateLimitResetInMinutes: rateLimit.resetInMinutes,
        };
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
    let provenComplete = false;
    while (offset < candidates.length) {
        if (ranked.length >= limit) {
            const kthStarMs = Date.parse(ranked[limit - 1]!.starredAt);
            const nextRepoUpdatedMs = candidates[offset]!.updatedAtMs;
            if (kthStarMs >= nextRepoUpdatedMs) {
                provenComplete = true;
                break;
            }
        }
        const size = offset === 0
            ? 1
            : Math.min(BATCH_SIZE, candidates.length - offset);
        const batch = candidates.slice(offset, offset + size);
        offset += size;

        const results = await Promise.all(batch.map(repo => watchEvents(repo, rateLimit)));
        fetches.push(...results);
        for (const result of results) {
            raw.push(...result.stars);
        }
        ranked = raw
            .filter(star => star.login.toLowerCase() !== ownerName)
            .sort((left, right) => right.starredAt.localeCompare(left.starredAt));
    }
    if (offset >= candidates.length) {
        provenComplete = true;
    }

    const kthStarMs = ranked.length >= limit ? Date.parse(ranked[limit - 1]!.starredAt) : -Infinity;
    const errors = fetches.flatMap(fetch => fetch.errors);
    const blockingErrors = provenComplete
        ? errors.filter(error => {
            const failedRepo = candidates.find(repo => repo.name === error.repository);
            return failedRepo === undefined || failedRepo.updatedAtMs > kthStarMs;
        })
        : errors;
    const droppedOwnerStars = raw.filter(star => star.login.toLowerCase() === ownerName);

    return {
        ok: blockingErrors.length === 0,
        owner: OWNER,
        fetchedAt: new Date().toISOString(),
        limit,
        stars: ranked.slice(0, limit),
        raw,
        droppedOwnerStars,
        repositories: fetches.map(fetch => fetch.repository),
        ignored: { forks, noStars, stale, unparsed },
        errors,
        rateLimitRemaining: rateLimit.remaining,
        rateLimitResetInMinutes: rateLimit.resetInMinutes,
    };
}

interface RepoWatch {
    repository: RepoFetch;
    stars: Star[];
    errors: RunError[];
}

async function watchEvents(
    repository: GitHubRepository,
    rateLimit: RateLimitState,
): Promise<RepoWatch> {
    const path = `/repos/${repository.fullName}/events?per_page=100`;
    const started = Date.now();
    const payload = await githubJson(path, rateLimit);
    const ms = Date.now() - started;

    if (!payload.ok || !Array.isArray(payload.data)) {
        const message = !payload.ok ? payload.message : "GitHub events response is not an array";
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
            errors: [{
                path,
                repository: repository.name,
                ...(payload.status > 0 ? { status: payload.status } : {}),
                message,
            }],
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
    };
}

interface GitHubJson {
    ok: boolean;
    status: number;
    data: unknown;
    message: string;
}

async function githubJson(path: string, rateLimit: RateLimitState): Promise<GitHubJson> {
    try {
        const response = await fetch(`https://api.github.com${path}`, {
            headers: GITHUB_HEADERS,
        });
        const remaining = response.headers.get("x-ratelimit-remaining");
        if (
            remaining !== null &&
            (rateLimit.remaining === null || Number(remaining) < Number(rateLimit.remaining))
        ) {
            rateLimit.remaining = remaining;
        }
        const reset = response.headers.get("x-ratelimit-reset");
        if (reset !== null && /^\d+$/.test(reset.trim())) {
            rateLimit.resetInMinutes = Math.max(
                0,
                Math.ceil((Number(reset) * 1000 - Date.now()) / 60_000),
            );
        }
        if (!response.ok) {
            return {
                ok: false,
                status: response.status,
                data: null,
                message: `GitHub API returned ${response.status}`,
            };
        }
        return {
            ok: true,
            status: response.status,
            data: await response.json(),
            message: "",
        };
    } catch (error) {
        return {
            ok: false,
            status: 0,
            data: null,
            message: error instanceof Error ? error.message : "unknown error",
        };
    }
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
