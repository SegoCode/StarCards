## Initialization

**Note**: This step is only for setting up a new repository.

Before starting to work with the repository, configure its settings and run the initializer workflow once.

To initialize the repository:

1. **Configure pull requests** under **Settings → General**:

   - Enable squash merging.
   - Disable merge commits and rebase merging.
   - Disable the wiki if it is not needed.

2. **Configure workflow permissions** under **Settings → Actions → General**:

   - Select **Read and write permissions**.
   - Enable **Allow GitHub Actions to create and approve pull requests**.

3. **Trigger the initializer workflow**:

   - Go to the **Actions** tab in the GitHub repository.
   - Select the **Initialize repository** workflow.
   - Click on **Run workflow** to manually trigger it.

4. **Review the generated changes**:

   - The workflow replaces all instances of `{reponame}` and `{username}` in all files with the actual repository name and username.
   - It removes the initializer workflow file (`initializer.yml`).
   - It creates `develop` if needed.
   - It commits these changes to `chore/initialize-repository` using a Conventional Commit and opens a PR to `main`.
   - Running it again reuses the same branch and pull request.
   - Review the PR created by the initializer workflow.
   - Once satisfied, merge the PR into `main`.

> [!IMPORTANT]
> A workflow cannot grant itself write access or administrative repository permissions. Complete steps 1 and 2 before running the initializer.
> If pull request creation is denied, the initializer opens an issue with these instructions and can be run again after the permissions are fixed.

## Branching Strategy

We use a branching model inspired by Gitflow to manage our development process:

- **`main`**: The production-ready branch containing the latest stable code.
- **`develop`**: The development branch where new features and bug fixes are integrated before being promoted to `main`.

```
       --------------------> [main]
      /
[develop]
```

## Development Workflow

### 1. Fork and Clone the Repository

Fork the repository to your own GitHub account and clone it to your local machine:

```
git clone https://github.com/{username}/{reponame}.git
```

### 2. Create a Feature Branch

Create a new branch off `develop` for your feature or bug fix:

```
git checkout -b feature/your-feature-name develop
```

### 3. Make Changes and Commit

Implement your changes, ensuring you follow the project's coding standards. Commit your changes with clear and descriptive messages:

```
git add .
git commit -m "feat: add new authentication module"
```

### 4. Push to Your Fork

Push your feature branch to your forked repository:

```
git push origin feature/your-feature-name
```

### 5. Open a Pull Request to `develop`

Navigate to your fork on GitHub and open a Pull Request (PR) to merge your feature branch into the `develop` branch of the main repository.

```
Your Fork [feature/your-feature-name]
           |
           v
Main Repo [develop]
```

### 6. Code Review and Approval

Your PR will undergo code review. Make any requested changes until it is approved by a maintainer.

### 7. Merge into `develop`

Once approved, your PR will be merged into the `develop` branch.

```
[feature/your-feature-name] --> [develop]
```

## Synchronization Between Branches

### Sync from `develop` to `main`

#### Manual Trigger of Sync Workflow

When changes in `develop` are ready to be promoted to `main`, manually trigger the **Sync from develop to main** workflow and choose a release type:

1. Go to the **Actions** tab in the GitHub repository.
2. Select the **Sync from develop to main** workflow.
3. Select `minor`, `major`, or `none`, then click **Run workflow**.

#### Automatic PR Creation

- The workflow closes every open `develop` to `main` PR, regardless of its author or labels, and creates a new promotion PR.
- It always adds `auto-sync`.
- `minor` adds `auto-tag`; `major` adds both `auto-tag` and `semver:major`; `none` removes both release labels.
- Running the workflow after opening a manual `develop` to `main` PR closes the manual PR and replaces it with the automated promotion PR.
- The `Warn direct PR` workflow comments once on manually opened promotion PRs that do not have `auto-sync`.

```
[develop] --(Workflow)--> PR to [main]
```

#### Review and Merge

- **Review**: The PR should be reviewed to ensure all changes are ready for production.
- **Merge**: After approval, merge the PR into `main`.

### Sync from `main` to `develop`

After changes are merged into `main`, the **Sync from main to develop** workflow automatically merges `main` back into `develop` to keep it up to date with any hotfixes or urgent changes.

```
[main] --(Auto Merge)--> [develop]
```

## Tagging and Releases

### Automatic Tag Creation

When a PR is merged into `main` and has the `auto-tag` label, the **Generate tag** workflow is triggered:

1. **Tag Creation**:

   - The workflow determines the new version number from the latest `major.minor` tag.
   - It increments the major version and resets minor to zero when `semver:major` is present; otherwise it increments minor.
   - If no tags exist, it starts with `1.0`.
   - It creates a new tag on the `main` branch.

2. **Issue Creation**:

   - The workflow creates an issue in the repository to notify maintainers that a new tag has been created.
   - The issue includes a link to create a release for the new tag.

```
[main] --(Merge PR with 'auto-tag' label)--> [Create Tag vX.Y] --> [Create Issue]
```

#### Tag Versioning

- We use a simplified versioning scheme: `major.minor`.
- The major version increments when the promotion uses the `major` release type.
- The minor version increments with each tagged release.

### Creating a Release

Maintainers should:

1. Review the issue created by the **Generate tag** workflow.
2. Decide whether to create a formal release from the new tag.
3. If a release is needed, use the provided link to create it.
4. Close the issue once the release decision is made.

## Commit Messages and Labels

### Commit Messages

We follow the [Conventional Commits](https://www.conventionalcommits.org/) standard:

- **Format**: `type(scope): description`
- **Types**:
  - `feat`: A new feature
  - `fix`: A bug fix
  - `docs`: Documentation changes
  - `style`: Code style changes (formatting, missing semicolons, etc.)
  - `refactor`: Code changes that neither fix a bug nor add a feature
  - `test`: Adding or updating tests

### Pull Request Labels

- **`auto-sync`**: Indicates the PR is syncing `develop` to `main`.
- **`auto-tag`**: Triggers automatic tag creation upon merging.
- **`semver:major`**: Increments the major version instead of the minor version.

## GitHub Actions Conventions

All workflows that commit, tag, push, or manage pull requests follow the same standard:

- **Actions**: use the current Node 24 generations: `actions/checkout@v7`, `actions/github-script@v9`, `actions/first-interaction@v3`, and `gitleaks/gitleaks-action@v3`.
- **Checkout**: uses `fetch-depth: 0` only when history or tags are needed. Workflows that only call the GitHub API skip checkout entirely.
- **Identity**: commits and tags are authored as `github-actions[bot]`, configured locally in the repository:
  ```shell
  git config user.name "github-actions[bot]"
  git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
  ```
- **Permissions**: every job declares an explicit `permissions:` block with the minimum scopes required (`contents: write` to push or tag, `pull-requests: write` for PRs, `issues: write` for issues and labels).
- **Git operations** (commit, tag, merge, push) use plain `git`, authenticated by the `GITHUB_TOKEN` credentials that `actions/checkout` persists by default.
- **API operations** (PRs, issues, labels) use the `gh` CLI — preinstalled on GitHub runners, never install it manually — authenticated with the `GITHUB_TOKEN` environment variable and `--repo ${{ github.repository }}` when running without a checkout.
