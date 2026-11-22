import { test } from "node:test";
import assert from "node:assert/strict";
import { concatFrames, downsample, encodeWav, rms } from "./wav.ts";

test("downsample 48k -> 16k keeps a third of the samples, averaged", () => {
  const out = downsample(new Float32Array([0.3, 0.3, 0.3, 0.6, 0.6, 0.6]), 48_000, 16_000);
  assert.equal(out.length, 2);
  assert.ok(Math.abs(out[0] - 0.3) < 1e-6 && Math.abs(out[1] - 0.6) < 1e-6);
});

test("encodeWav writes a 16 kHz mono PCM header and 2 bytes per sample", async () => {
  const blob = encodeWav(new Float32Array(100));
  assert.equal(blob.type, "audio/wav");
  assert.equal(blob.size, 44 + 200);
  const v = new DataView(await blob.arrayBuffer());
  assert.equal(String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3)), "RIFF");
  assert.equal(v.getUint16(22, true), 1);
  assert.equal(v.getUint32(24, true), 16_000);
});

test("concatFrames and rms", () => {
  assert.deepEqual([...concatFrames([new Float32Array([1]), new Float32Array([2, 3])])], [1, 2, 3]);
  assert.equal(rms(new Float32Array([0.5, -0.5])), 0.5);
});
