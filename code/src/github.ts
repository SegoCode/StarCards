const OWNER = "SegoCode";
const GITHUB_HEADERS = {
    "user-agent": "segocode-stars",
    accept: "application/vnd.github+json",
};

interface GitHubRepository {
    fork: boolean;
    fullName: string;
    name: string;
    starCount: number;
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

export async function recentStars(limit: number): Promise<Star[]> {
    const payload = await githubJson(`/users/${OWNER}/repos?per_page=100&type=owner`);
    if (!Array.isArray(payload)) {
        throw new Error("GitHub repository response is not an array");
    }

    const repositories = payload
        .map(parseRepository)
        .filter((repository): repository is GitHubRepository =>
            repository !== null && !repository.fork && repository.starCount > 0,
        );
    const events = await Promise.all(repositories.map(watchEvents));

    return events
        .flat()
        .sort((left, right) => right.starredAt.localeCompare(left.starredAt))
        .slice(0, limit);
}

async function watchEvents(repository: GitHubRepository): Promise<Star[]> {
    try {
        const payload = await githubJson(
            `/repos/${repository.fullName}/events?per_page=100`,
        );
        if (!Array.isArray(payload)) {
            return [];
        }

        return payload
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
    } catch {
        return [];
    }
}

async function githubJson(path: string): Promise<unknown> {
    const response = await fetch(`https://api.github.com${path}`, {
        headers: GITHUB_HEADERS,
        cf: { cacheTtl: 3600, cacheEverything: true },
    });
    if (!response.ok) {
        throw new Error(`GitHub API returned ${response.status}`);
    }
    return response.json();
}

function parseRepository(value: unknown): GitHubRepository | null {
    if (
        typeof value !== "object" ||
        value === null ||
        !("fork" in value) ||
        !("full_name" in value) ||
        !("name" in value) ||
        !("stargazers_count" in value)
    ) {
        return null;
    }

    const { fork, full_name: fullName, name, stargazers_count: starCount } = value;
    if (
        typeof fork !== "boolean" ||
        typeof fullName !== "string" ||
        typeof name !== "string" ||
        typeof starCount !== "number"
    ) {
        return null;
    }

    return { fork, fullName, name, starCount };
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
