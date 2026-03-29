# Fork Notes

This repository is a fork of `numman-ali/cc-wrapped`.

These notes exist to keep package/release history straight and avoid repeating the recent `cc-wrapped` vs `cc-wrapped-noyrlimit` confusion.

## Package Identity

- npm package name: `cc-wrapped-noyrlimit`
- GitHub repo: `xiaoqianWX/cc-wrapped-noyrlimit`
- CLI branding in `src/index.ts`: still `cc-wrapped`
- Main publish script: `scripts/publish.ts`

The fork should publish to `cc-wrapped-noyrlimit*` packages, not to upstream `cc-wrapped*`.

## Branch Notes

- `main` is the publishable branch.
- The unfinished web dashboard should not be shipped from `main`.
- If dashboard work resumes later, keep it isolated until it is intentionally ready to release.

## Release History

- `1.0.0`
  Published as `cc-wrapped-noyrlimit`.
  This was the pre-dashboard CLI release.
- `1.0.1`
  Published as `cc-wrapped-noyrlimit`.
  Includes the raw Claude log token/cost fixes and the fork package rename cleanup.
- `1.0.2`
  Next intended release from `main`.
  Includes the December availability gate removal and the publish auth fix.

## Important Fork-Specific Changes On `main`

- Token, cache read/write, web-search, and cost stats use raw Claude project logs instead of depending on stale `stats-cache.json`.
- When usage cost cannot be calculated, the CLI warns instead of failing silently.
- The publish flow preserves repo npm auth when publishing from `dist/*`.
- Wrapped generation is allowed before December for the current year.

## Pre-Publish Checklist

1. Confirm you are on `main`.
2. Run `bun run build`.
3. Export `NPM_TOKEN`.
4. Run `bun run publish <version>`.
5. Sanity-check an install with `npx cc-wrapped-noyrlimit@<version> --version`.

