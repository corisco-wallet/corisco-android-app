// GATT UUIDs of the firmware's BLE signing service. Same 128-bit values as
// `corisco-protocol`'s `SERVICE_UUID`/`REQUEST_CHARACTERISTIC_UUID`/
// `RESPONSE_CHARACTERISTIC_UUID` (firmware repo), written as standard
// dash-separated strings. Kept free of any native-module import so the
// contract tests can load it under plain Node.
export const SERVICE_UUID = "5f4b2a9e-7c3d-4e8f-a1b6-d09c2e7f4a5b";
export const REQUEST_CHARACTERISTIC_UUID = "8e2c6f0a-4b7d-4c9e-9a3f-5d1e8b6c2a70";
export const RESPONSE_CHARACTERISTIC_UUID = "3a9d7e1c-5b4f-4a8d-8c2e-6f0b9d3a7c50";
