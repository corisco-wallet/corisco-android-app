# Contributing to corisco-android-app

## Building and checking

See [README.md](README.md) for the Android/Expo setup, then:

```bash
npm ci
npx tsc --noEmit
```

CI runs the same typecheck on every PR.

## Relationship to the firmware

The app talks to the device over a BLE protocol defined in
[corisco-wallet](https://github.com/corisco-wallet/corisco-wallet)
(`corisco-protocol`). `src/postcard.ts` and `src/ble-uuids.ts` are
hand-written mirrors of it; postcard encodes enum variants by declaration
order, so a mismatch fails silently on the wire.

The app pins the firmware release it targets in `package.json`:

```json
"corisco": { "firmware": { "repo": "corisco-wallet/corisco-wallet", "tag": "v0.1.0", "protocol": 1 } }
```

Every firmware release publishes `vectors.json`: the exact bytes for every
`Request`/`Response` variant, generated from the real Rust types. The
contract tests (`tests/contract.test.ts`) check `postcard.ts` and the UUIDs
against the pinned release's vectors, and CI runs them on every PR.

```bash
npm run fetch-vectors   # needs `gh auth login` (the firmware repo is private)
npm test
```

To adopt a newer firmware: bump `tag` (and `protocol`, if the release changed
it) in `package.json`, fetch, and fix `postcard.ts` until the tests pass.
New protocol variants are **appended** in the firmware; append them in the
same relative position in `postcard.ts`.

CI needs the repo secret `RELEASE_PLZ_TOKEN`: a fine-grained PAT with
Contents: read on `corisco-wallet/corisco-wallet`.

## Releases

Automated by [release-please](https://github.com/googleapis/release-please)
(release-plz only supports Rust). On every push to `main` it opens/updates a
release PR that bumps `version` in `package.json` and `app.json` and updates
`CHANGELOG.md`, from the commit messages below. Merging it tags `vX.Y.Z` and
creates the GitHub Release. Uses the `RELEASE_PLZ_TOKEN` secret so the PR
and tag trigger CI. The first release is forced to `0.1.0`
(`release-as` in `release-please-config.json`); remove that line afterwards.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/): `feat:`,
`fix:`, `docs:`, `ci:`, `chore:`, ... (`feat` bumps minor, `fix` patch). No `Co-Authored-By` trailers.
