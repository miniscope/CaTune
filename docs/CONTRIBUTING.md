# Contributing to CaTune

## Prerequisites

- **Node.js 22** (LTS) — use `.nvmrc`: `nvm use`
- **Rust stable** — use `rust-toolchain.toml`: `rustup show`
- **wasm-pack** — `cargo install wasm-pack`

## Setup

```bash
git clone <repo-url>
cd CaTune
nvm use              # Node 22
npm install          # JS dependencies (all workspaces)
npm run build:wasm   # Compile Rust → WASM (only needed if changing solver)
npm run dev          # Start dev server
```

## Workspace Structure

CaTune is an npm workspaces monorepo:

| Workspace      | Path             | Description                                  |
| -------------- | ---------------- | -------------------------------------------- |
| `catune`       | `apps/catune/`   | SolidJS single-page application              |
| `@catune/core` | `packages/core/` | Shared library (WASM adapter, export schema) |

`@catune/core` is consumed as TypeScript source — Vite transpiles it directly. No separate build step needed.

## npm Scripts

Run from the repo root:

| Script                 | Description                                  |
| ---------------------- | -------------------------------------------- |
| `npm run dev`          | Start Vite dev server (`apps/catune`)        |
| `npm run build`        | Build WASM + Vite production bundle          |
| `npm run build:wasm`   | Compile Rust solver to WASM                  |
| `npm run test`         | Run Vitest tests (`apps/catune`)             |
| `npm run test:watch`   | Run tests in watch mode                      |
| `npm run lint`         | Run ESLint on `apps/` + `packages/`          |
| `npm run lint:fix`     | Auto-fix ESLint issues                       |
| `npm run typecheck`    | Run TypeScript type checking (project build) |
| `npm run format`       | Format all files with Prettier               |
| `npm run format:check` | Check formatting (CI gate)                   |

You can also run scripts in a specific workspace:

```bash
npm run dev -w apps/catune     # Start dev server
npm run test -w apps/catune    # Run tests
```

## Code Style

Code style is enforced automatically:

- **Prettier** — single quotes, trailing commas, 100 char width
- **ESLint** — TypeScript recommended + SolidJS plugin
- **TypeScript** — strict mode, project build mode for type checking

Run `npm run lint && npm run format:check && npm run typecheck` before pushing.

## CI

The CI pipeline runs on every PR to `main`:

1. Format check (`prettier --check`)
2. Lint (`eslint`)
3. Type check (`tsc -b`)
4. Tests (`vitest run`)
5. Build (`vite build`)

The WASM package is committed to the repo, so CI does not require Rust.

## Commit Conventions

- Use descriptive commit messages: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`
- Keep commits focused — one logical change per commit
- The formatting commit (Prettier) should be separate from logic changes

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for module layout, state management patterns, and boundary rules.
