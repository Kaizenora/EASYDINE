import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BLE_INTERRUPTED_MESSAGE,
  BlePrinterError,
  canPrintEscposLocally,
  canPrintOnDevice,
  getPrintTransport,
  isWebBluetoothSupported,
  pairWebBluetoothPrinter,
  printEscposOnDevice,
  savedWebPrinter,
  setPrintTransport,
  SUPPORTED_BLE_PROFILES,
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
      // Web Bluetooth being present must NOT switch printing away from system print.
      assert.equal(canPrintEscposLocally(), false);
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

// --- direct BLE with fakes ----------------------------------------------------
const PROFILE = SUPPORTED_BLE_PROFILES[0]!;

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

interface FakeOpts {
  profiles?: boolean; // device exposes a supported profile
  failAfterWrites?: number; // writes that succeed before the link drops
  noGetDevices?: boolean;
}

function fakeBluetooth(opts: FakeOpts = {}) {
  const log = { requestDevice: 0, getDevices: 0, writes: 0, connects: 0, disconnects: 0 };
  const characteristic = {
    properties: { write: true, writeWithoutResponse: true },
    writeValueWithoutResponse: async () => {
      if (opts.failAfterWrites !== undefined && log.writes >= opts.failAfterWrites) throw new Error("NetworkError");
      log.writes++;
    },
    writeValueWithResponse: async () => {
      log.writes++;
    },
  };
  const server = {
    getPrimaryService: async (uuid: string) => {
      if (opts.profiles === false || uuid !== PROFILE.service) throw new Error("no such service");
      return { getCharacteristic: async () => characteristic };
    },
  };
  const device = {
    id: "dev-1",
    name: "Test Printer",
    gatt: {
      connect: async () => {
        log.connects++;
        return server;
      },
      disconnect: () => void log.disconnects++,
    },
  };
  const bluetooth: Record<string, unknown> = {
    requestDevice: async () => {
      log.requestDevice++;
      return device;
    },
  };
  if (!opts.noGetDevices)
    bluetooth.getDevices = async () => {
      log.getDevices++;
      return [device];
    };
  return { bluetooth, log };
}

const b64 = (s: string) => Buffer.from(s).toString("base64");

async function withBle(opts: FakeOpts, run: (log: ReturnType<typeof fakeBluetooth>["log"]) => Promise<void>) {
  const { bluetooth, log } = fakeBluetooth(opts);
  const storage = memoryStorage();
  const prevW = Object.getOwnPropertyDescriptor(globalThis, "window");
  const prevN = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: storage, dispatchEvent: () => true },
  });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { bluetooth } });
  try {
    await run(log);
  } finally {
    if (prevW) Object.defineProperty(globalThis, "window", prevW);
    else Reflect.deleteProperty(globalThis, "window");
    if (prevN) Object.defineProperty(globalThis, "navigator", prevN);
    else Reflect.deleteProperty(globalThis, "navigator");
  }
}

test("saving a verified printer sends no bytes and does not switch the transport", async () => {
  await withBle({}, async (log) => {
    const p = await pairWebBluetoothPrinter();
    assert.equal(p?.id, "dev-1");
    assert.equal(log.writes, 0);
    assert.equal(savedWebPrinter()?.profile.service, PROFILE.service);
    assert.equal(getPrintTransport(), "system");
    assert.equal(canPrintEscposLocally(), false);
  });
});

test("an unsupported device is rejected, not saved, and nothing is written", async () => {
  await withBle({ profiles: false }, async (log) => {
    await assert.rejects(pairWebBluetoothPrinter(), (e: unknown) => e instanceof BlePrinterError && e.kind === "unsupported");
    assert.equal(savedWebPrinter(), null);
    assert.equal(log.writes, 0);
    assert.throws(() => setPrintTransport("ble"));
  });
});

test("printing reconnects through getDevices without ever opening the chooser", async () => {
  await withBle({}, async (log) => {
    await pairWebBluetoothPrinter();
    setPrintTransport("ble");
    assert.equal(canPrintEscposLocally(), true);
    const before = log.requestDevice;
    await printEscposOnDevice([b64("hello"), b64("world")]);
    assert.equal(log.requestDevice, before);
    assert.equal(log.getDevices, 1);
    assert.equal(log.writes, 2);
    assert.ok(log.disconnects >= 1);
  });
});

test("a saved BLE choice with the system transport never prints over BLE", async () => {
  await withBle({}, async (log) => {
    await pairWebBluetoothPrinter();
    assert.equal(canPrintEscposLocally(), false);
    await assert.rejects(printEscposOnDevice([b64("x")]));
    assert.equal(log.writes, 0);
  });
});

test("without getDevices the BLE path is unavailable and falls back cleanly", async () => {
  await withBle({ noGetDevices: true }, async (log) => {
    await pairWebBluetoothPrinter();
    assert.equal(canPrintEscposLocally(), false);
    assert.equal(log.writes, 0);
  });
});

test("a drop mid-print is reported as ambiguous and the job is not retried", async () => {
  await withBle({ failAfterWrites: 1 }, async (log) => {
    await pairWebBluetoothPrinter();
    setPrintTransport("ble");
    const big = b64("x".repeat(450)); // five 100-byte writes
    await assert.rejects(printEscposOnDevice([big]), (e: unknown) => e instanceof BlePrinterError && e.kind === "interrupted" && e.message === BLE_INTERRUPTED_MESSAGE);
    assert.equal(log.writes, 1);
  });
});
