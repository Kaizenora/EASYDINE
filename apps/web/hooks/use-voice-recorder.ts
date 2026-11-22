"use client";

// Records one short utterance with MediaRecorder (webm/opus where supported).
// Tap to start; it stops on tap, after ~2 s of silence once speech was heard,
// or at 25 s. Audio stays in memory only and is handed to `onAudio` once.

import { useEffect, useRef, useState } from "react";
import { MAX_RECORDING_MS } from "@/lib/voice-order";

export type RecorderError = "denied" | "unsupported" | "silence";

const SILENCE_AFTER_SPEECH_MS = 1_800;
/** Before the first word, give a little longer to start speaking. */
const SILENCE_BEFORE_SPEECH_MS = 6_000;
const LOUD_RMS = 0.02;
const MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

export function voiceRecordingSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

interface Session {
  stream: MediaStream;
  recorder: MediaRecorder;
  ctx: AudioContext | null;
  timer: ReturnType<typeof setInterval> | null;
  maxTimer: ReturnType<typeof setTimeout> | null;
  heardSpeech: boolean;
  cancelled: boolean;
}

export function useVoiceRecorder({
  onAudio,
  onError,
}: {
  onAudio: (blob: Blob) => void;
  onError: (e: RecorderError) => void;
}) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [recording, setRecording] = useState(false);
  const session = useRef<Session | null>(null);
  const handlers = useRef({ onAudio, onError });
  useEffect(() => {
    handlers.current = { onAudio, onError };
  }, [onAudio, onError]);

  const teardown = (s: Session) => {
    if (s.timer) clearInterval(s.timer);
    if (s.maxTimer) clearTimeout(s.maxTimer);
    s.stream.getTracks().forEach((t) => t.stop());
    void s.ctx?.close().catch(() => {});
  };

  useEffect(() => {
    // Detected after mount so the server render and first paint match.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(voiceRecordingSupported());
    return () => {
      const s = session.current;
      if (s) {
        s.cancelled = true;
        if (s.recorder.state !== "inactive") s.recorder.stop();
        teardown(s);
      }
    };
  }, []);

  const stop = () => {
    const s = session.current;
    if (s && s.recorder.state !== "inactive") s.recorder.stop();
  };

  const cancel = () => {
    const s = session.current;
    if (!s) return;
    s.cancelled = true;
    stop();
  };

  const start = async () => {
    if (session.current || !voiceRecordingSupported()) {
      if (!voiceRecordingSupported()) handlers.current.onError("unsupported");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      handlers.current.onError(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unsupported");
      return;
    }
    const mimeType = MIME_TYPES.find((m) => MediaRecorder.isTypeSupported(m));
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32_000 } : undefined);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      handlers.current.onError("unsupported");
      return;
    }
    const chunks: Blob[] = [];
    const s: Session = { stream, recorder, ctx: null, timer: null, maxTimer: null, heardSpeech: false, cancelled: false };
    session.current = s;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      teardown(s);
      session.current = null;
      setRecording(false);
      if (s.cancelled) return;
      if (!s.heardSpeech || chunks.length === 0) {
        handlers.current.onError("silence");
        return;
      }
      handlers.current.onAudio(new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" }));
    };

    // Silence detection: stop after a pause once the guest has spoken.
    try {
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      s.ctx = ctx;
      const buf = new Float32Array(analyser.fftSize);
      const startedAt = Date.now();
      let lastLoud = startedAt;
      s.timer = setInterval(() => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += v * v;
        const now = Date.now();
        if (Math.sqrt(sum / buf.length) > LOUD_RMS) {
          s.heardSpeech = true;
          lastLoud = now;
        }
        const limit = s.heardSpeech ? SILENCE_AFTER_SPEECH_MS : SILENCE_BEFORE_SPEECH_MS;
        if (now - lastLoud > limit) stop();
      }, 100);
    } catch {
      // No Web Audio: rely on tap-to-stop and the 25 s cap.
      s.heardSpeech = true;
    }
    s.maxTimer = setTimeout(stop, MAX_RECORDING_MS);
    recorder.start();
    setRecording(true);
  };

  return { supported, recording, start, stop, cancel };
}
