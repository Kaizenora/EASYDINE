"use client";

// Always-on listening for the cashier mic. The mic stays open; a simple
// voice-activity detector (energy over an adaptive noise floor) cuts the
// stream into utterances, and each one is handed over as a 16 kHz WAV as
// soon as the speaker pauses (~0.7 s). Audio lives only in memory.

import { useEffect, useRef, useState } from "react";
import { concatFrames, downsample, encodeWav, rms } from "@/lib/wav";

const FRAME_SIZE = 4096;
const PREROLL_MS = 400; // keep the start of the first word
const END_SILENCE_MS = 700;
const MIN_SPEECH_MS = 300;
const MAX_UTTERANCE_MS = 10_000;
const MIN_THRESHOLD = 0.012;

export type ListenerError = "denied" | "unsupported";

interface Running {
  stream: MediaStream;
  ctx: AudioContext;
  nodes: AudioNode[];
}

export function continuousListeningSupported(): boolean {
  return typeof window !== "undefined" && typeof AudioContext !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

export function useContinuousListener({
  onUtterance,
  onError,
}: {
  onUtterance: (wav: Blob) => void;
  onError: (e: ListenerError) => void;
}) {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const running = useRef<Running | null>(null);
  const handlers = useRef({ onUtterance, onError });
  useEffect(() => {
    handlers.current = { onUtterance, onError };
  }, [onUtterance, onError]);

  const stop = () => {
    const r = running.current;
    running.current = null;
    if (r) {
      r.nodes.forEach((n) => n.disconnect());
      r.stream.getTracks().forEach((t) => t.stop());
      void r.ctx.close().catch(() => {});
    }
    setListening(false);
    setSpeaking(false);
  };

  useEffect(() => stop, []);

  // A context created without a tap (auto-resume after reload) starts
  // suspended; the first tap anywhere wakes it.
  useEffect(() => {
    if (!listening) return;
    const wake = () => void running.current?.ctx.resume().catch(() => {});
    window.addEventListener("pointerdown", wake);
    return () => window.removeEventListener("pointerdown", wake);
  }, [listening]);

  const start = async () => {
    if (running.current) return;
    if (!continuousListeningSupported()) {
      handlers.current.onError("unsupported");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      handlers.current.onError(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unsupported");
      return;
    }
    const ctx = new AudioContext();
    void ctx.resume().catch(() => {});
    const source = ctx.createMediaStreamSource(stream);
    // ScriptProcessor is deprecated but works everywhere without a separate
    // worklet file; at 4096 samples it runs ~12 times a second.
    const proc = ctx.createScriptProcessor(FRAME_SIZE, 1, 1);
    const mute = ctx.createGain();
    mute.gain.value = 0;
    source.connect(proc);
    proc.connect(mute);
    mute.connect(ctx.destination);
    running.current = { stream, ctx, nodes: [source, proc, mute] };
    stream.getAudioTracks()[0]?.addEventListener("ended", stop);

    const rate = ctx.sampleRate;
    const frameMs = (FRAME_SIZE / rate) * 1000;
    let noise = 0.004;
    let pre: Float32Array[] = [];
    let seg: Float32Array[] | null = null;
    let speechMs = 0;
    let silenceMs = 0;

    proc.onaudioprocess = (e) => {
      const frame = new Float32Array(e.inputBuffer.getChannelData(0));
      const level = rms(frame);
      const loud = level > Math.max(MIN_THRESHOLD, noise * 3);
      if (!seg) {
        if (!loud) noise = noise * 0.95 + level * 0.05;
        pre.push(frame);
        while (pre.length * frameMs > PREROLL_MS) pre.shift();
        if (loud) {
          seg = pre;
          pre = [];
          speechMs = frameMs;
          silenceMs = 0;
          setSpeaking(true);
        }
        return;
      }
      seg.push(frame);
      if (loud) {
        speechMs += frameMs;
        silenceMs = 0;
      } else {
        silenceMs += frameMs;
      }
      if (silenceMs >= END_SILENCE_MS || seg.length * frameMs >= MAX_UTTERANCE_MS) {
        const done = seg;
        seg = null;
        setSpeaking(false);
        if (speechMs >= MIN_SPEECH_MS) {
          handlers.current.onUtterance(encodeWav(downsample(concatFrames(done), rate)));
        }
      }
    };
    setListening(true);
  };

  return { listening, speaking, start, stop };
}
