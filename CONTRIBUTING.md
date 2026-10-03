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
(`corisco-protocol`). `src/postcard.ts` and the UUIDs in
`src/ble-transport.ts` are hand-written mirrors of it; postcard encodes enum
variants by declaration order, so a mismatch fails silently on the wire.

New protocol variants are **appended** in the firmware, and must be appended
in the same relative position in `postcard.ts`.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/): `feat:`,
`fix:`, `docs:`, `ci:`, `chore:`, ... No `Co-Authored-By` trailers.
