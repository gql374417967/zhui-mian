"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const recordingLimitMs = 60_000;
const formats = ["audio/webm;codecs=opus", "audio/mp4;codecs=mp4a.40.2", "audio/mp4"];

type Phase = "idle" | "permission" | "recording" | "transcribing";
type Recording = {
  controller: AbortController;
  stream?: MediaStream;
  recorder?: MediaRecorder;
  timer?: number;
  meter?: AudioContext;
};

function releaseAudio(recording: Recording) {
  window.clearInterval(recording.timer);
  recording.stream?.getTracks().forEach((track) => track.stop());
  if (recording.meter) void recording.meter.close().catch(() => {});
  recording.stream = undefined;
  recording.meter = undefined;
}

function availableFormat() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return undefined;
  return formats.find((format) => MediaRecorder.isTypeSupported(format));
}

export function useVoiceInput(onText: (text: string) => void) {
  const current = useRef<Recording | null>(null);
  const pendingPermission = useRef(false);
  const [waitingForPermission, setWaitingForPermission] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const discard = useCallback(() => {
    const recording = current.current;
    current.current = null;
    if (!recording) return;
    recording.controller.abort();
    const recorder = recording.recorder;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      if (recorder.state !== "inactive") recorder.stop();
    }
    releaseAudio(recording);
  }, []);

  const cancel = useCallback(() => {
    discard();
    setPhase("idle");
    setError("");
    setNotice("");
  }, [discard]);

  useEffect(() => {
    setSupported(Boolean(availableFormat()));
    window.addEventListener("pagehide", cancel);
    return () => {
      window.removeEventListener("pagehide", cancel);
      discard();
    };
  }, [cancel, discard]);

  async function start() {
    if (current.current || pendingPermission.current) return;
    const format = availableFormat();
    if (!format) return;
    const recording: Recording = { controller: new AbortController() };
    current.current = recording;
    setPhase("permission");
    setError("");
    setNotice("");
    setSeconds(0);
    setLevel(0);

    function fail(message: string) {
      if (current.current !== recording) return;
      cancel();
      setError(message);
    }

    let stream: MediaStream;
    pendingPermission.current = true;
    setWaitingForPermission(true);
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (cause) {
      const name = (cause as DOMException)?.name;
      fail(name === "NotAllowedError" || name === "SecurityError"
        ? "麦克风权限被拒绝。请在浏览器设置中允许麦克风，或继续打字。"
        : name === "NotFoundError" ? "未找到麦克风，请连接设备或继续打字。"
          : "无法打开麦克风，请检查设备是否可用，或继续打字。");
      return;
    } finally {
      pendingPermission.current = false;
      setWaitingForPermission(false);
    }
    if (current.current !== recording) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    recording.stream = stream;

    try {
      const recorder = new MediaRecorder(stream, { mimeType: format });
      recording.recorder = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = ({ data }) => { if (data.size) chunks.push(data); };
      recorder.onerror = () => fail("录音失败，请检查麦克风后重试。");
      recorder.onstop = async () => {
        releaseAudio(recording);
        if (current.current !== recording) return;
        setPhase("transcribing");
        const mime = (chunks[0]?.type || recorder.mimeType).split(";")[0].toLowerCase();
        const blob = new Blob(chunks, { type: mime });
        if (!blob.size) return fail("没有录到音频，请重试。");
        if (mime !== "audio/webm" && mime !== "audio/mp4") return fail("浏览器生成了不支持的录音格式，请使用文字输入。");

        const form = new FormData();
        form.set("file", blob, mime === "audio/webm" ? "recording.webm" : "recording.m4a");
        let timedOut = false;
        const deadline = window.setTimeout(() => {
          timedOut = true;
          recording.controller.abort();
        }, 35_000);
        try {
          const response = await fetch("/api/stt", { method: "POST", body: form, signal: recording.controller.signal });
          const result = await response.json().catch(() => null);
          if (current.current !== recording) return;
          if (timedOut) return fail("语音转写超时，请重试。");
          if (!response.ok) {
            return fail(result?.error || (response.status === 504 ? "语音转写超时，请重试。" : "语音转写失败，请稍后重试。"));
          }
          const text = typeof result?.text === "string" ? result.text.trim() : "";
          if (!text) return fail("没有识别到文字，请靠近麦克风再试。");
          current.current = null;
          setPhase("idle");
          onText(text);
          setNotice("转写已填入回答框，可编辑后发送。");
        } catch {
          fail(timedOut ? "语音转写超时，请重试。" : "网络连接中断或不可用，请检查网络后重试。");
        } finally {
          window.clearTimeout(deadline);
        }
      };
      recorder.start();
      setPhase("recording");
      const startedAt = performance.now();
      let analyser: AnalyserNode | undefined;
      try {
        const meter = new AudioContext();
        recording.meter = meter;
        analyser = meter.createAnalyser();
        analyser.fftSize = 256;
        meter.createMediaStreamSource(stream).connect(analyser);
        void meter.resume().catch(() => {});
      } catch {
        // 音量动画不可用时仍可录音。
      }
      const samples = new Uint8Array(analyser?.fftSize ?? 0);
      recording.timer = window.setInterval(() => {
        const elapsed = performance.now() - startedAt;
        setSeconds(Math.min(60, Math.floor(elapsed / 1000)));
        if (elapsed >= recordingLimitMs) {
          stop();
          return;
        }
        if (analyser) {
          analyser.getByteTimeDomainData(samples);
          const energy = samples.reduce((sum, value) => sum + (value - 128) ** 2, 0);
          setLevel(Math.min(1, Math.sqrt(energy / samples.length) / 32));
        }
      }, 80);
    } catch {
      fail("无法开始录音，请检查麦克风或继续打字。");
    }
  }

  function stop() {
    const recording = current.current;
    if (!recording || recording.recorder?.state !== "recording") return;
    window.clearInterval(recording.timer);
    setPhase("transcribing");
    recording.recorder.stop();
  }

  const unavailable = supported === false
    ? (typeof window !== "undefined" && !window.isSecureContext
      ? "语音输入需要在 localhost 或 HTTPS 下使用。"
      : "当前浏览器不支持可用的录音格式，请继续打字。")
    : "";

  function isCapturing() {
    return pendingPermission.current || current.current?.recorder?.state === "recording";
  }

  return { phase, seconds, level, error, notice, unavailable, waitingForPermission, isCapturing, canStart: supported === true && !waitingForPermission, start, stop, cancel };
}
