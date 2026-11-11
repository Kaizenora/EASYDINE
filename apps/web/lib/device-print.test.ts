import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canPrintEscposLocally,
  canPrintOnDevice,
  isWebBluetoothSupported,
} from "./device-print.ts";

function withBrowserGlobals(
  browserWindow: object,
  browserNavigator: object,
  run: () => void,
): void {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: browserWindow,
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: browserNavigator,
  });
  try {
    run();
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (previousNavigator) Object.defineProperty(globalThis, "navigator", previousNavigator);
    else Reflect.deleteProperty(globalThis, "navigator");
  }
}

test("Chrome Web Bluetooth availability does not select native printing", () => {
  withBrowserGlobals(
    {
      Capacitor: {
        isNativePlatform: () => false,
        getPlatform: () => "web",
        Plugins: { NativePrinter: {} },
      },
    },
    { bluetooth: { requestDevice: () => Promise.resolve({}) } },
    () => {
      assert.equal(isWebBluetoothSupported(), true);
      assert.equal(canPrintOnDevice(), false);
      assert.equal(canPrintEscposLocally(), true);
    },
  );
});

test("native printing requires the native app and printer plugin", () => {
  withBrowserGlobals(
    {
      Capacitor: {
        isNativePlatform: () => true,
        getPlatform: () => "android",
        Plugins: { NativePrinter: {} },
      },
    },
    {},
    () => {
      assert.equal(canPrintOnDevice(), true);
    },
  );
});
