import App from "../App";
import { AlertHost } from "./components/AppAlert";
import { DeviceConfirmHost } from "./components/DeviceConfirmHost";

export function Root() {
  return (
    <>
      <App />
      <AlertHost />
      <DeviceConfirmHost />
    </>
  );
}
