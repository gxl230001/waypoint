# Branching and merging

`main` is always working. Everything lands through a pull request.

## Branch names

| Prefix | Use |
|---|---|
| `feature/` | App or backend functionality |
| `ui/` | Screens and components built from the Figma design |
| `ml/` | Preprocessing, training, evaluation |
| `contract/` | Changes to anything in `contracts/` |
| `fix/` | Bug fixes |
| `chore/` | Tooling, config, restructuring |
| `docs/` | Documentation only |

## Rules of thumb

- Branch from an up-to-date `main` and keep branches short-lived.
- Do not branch from someone else's unmerged branch. If you need their output,
  agree on a contract first and code against a fixture or stub.
- Keep one concern per PR. Do not mix formatting changes with behavior changes.
- Commit messages: short imperative summary, optional `feat:` / `fix:` /
  `chore:` / `docs:` / `ml:` / `ui:` prefix.
- Squash merge feature branches. Delete the branch after merging.
- Never commit recordings, datasets, model binaries, `.env` files or secrets.
  Data lives in `ml/data/` (git-ignored). Model files are stored outside Git.

## Areas

| Path | Notes |
|---|---|
| `apps/mobile/` | React Native app |
| `backend/` | FastAPI service. Routes live in `backend/routers/` |
| `ml/` | Data, preprocessing, training |
| `design/` | Figma links, design tokens, screen specs |
| `contracts/` | Shared schemas. Needs review from every consuming side |
