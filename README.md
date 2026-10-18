# Corisco app

<p align="center">
  <img src="https://raw.githubusercontent.com/corisco-wallet/.github/main/profile/images/app-screen.jpg" height="420" alt="Corisco app">
</p>

The Android app for Corisco, a Lightning wallet whose keys live on a
separate ESP32 hardware device. The app never holds your keys: it talks to
the device over Bluetooth, and you confirm every payment on the device's
own screen.

You also need the hardware signer: see [corisco-firmware](https://github.com/corisco-wallet/corisco-firmware).

## Install

1. On your phone, open the [latest release](https://github.com/corisco-wallet/corisco-android-app/releases/latest).
2. Download `corisco-android-app-*.apk` and open it. If Android asks, allow installs from your browser or file manager.
3. Open the app, turn Bluetooth on and pick your device (`Corisco-<id>`).

> Release builds run on **mainnet**, so they use real bitcoin. It's early
> software: use small amounts.

## Troubleshooting

- **"device is not authorized to use BluetoothLE"**: grant the `Nearby devices` permission in the app's Android settings.
- **"No Corisco-* device found"**: make sure the device is on and not connected to another phone. If it worked before, toggle the phone's Bluetooth off and on.

## Build from source

You need Node.js (LTS), JDK 17 and the Android SDK (`platforms;android-36`, `build-tools;36.0.0`). Bluetooth doesn't work in the emulator, so use a real phone.

```bash
npm install
npx expo prebuild --platform android   # generates android/, re-run after native changes
npx expo run:android                   # debug build, installed on a connected phone
```

For a standalone APK: `cd android && ./gradlew assembleRelease`
(output in `android/app/build/outputs/apk/release/`).

Local builds use **regtest** (no real funds). To use mainnet, set
`EXPO_PUBLIC_SPARK_NETWORK=MAINNET` in a `.env` file (see `.env.example`).

To get a Lightning address (`name@domain`) from a
[corisco-lnaddress](https://github.com/corisco-wallet/corisco-lnaddress) server, set
`EXPO_PUBLIC_LNADDRESS_DOMAIN` and `EXPO_PUBLIC_LNADDRESS_API_URL` the same way. Leave both unset to turn it off.

See [CONTRIBUTING.md](CONTRIBUTING.md) to contribute.

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or
[MIT license](LICENSE-MIT) at your option.
