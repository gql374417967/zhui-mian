"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const preferenceKey = "zhui-mian:auto-read";

type Playback = {
  controller: AbortController;
  audio?: HTMLAudioElement;
  url?: string;
  speech?: SpeechSynthesisUtterance;
};

function autoplayBlocked(error: unknown) {
  return error instanceof DOMException && error.name === "NotAllowedError";
}

export function useQuestionTts() {
  const playback = useRef<Playback | null>(null);
  const retry = useRef<{ id: string; audio?: Blob } | null>(null);
  const preference = useRef(false);
  const [autoRead, setAutoRead] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<ReadonlySet<string>>(() => new Set());

  const release = useCallback(() => {
    const current = playback.current;
    playback.current = null;
    if (!current) return;
    current.controller.abort();
    if (current.audio) {
      current.audio.onended = null;
      current.audio.onerror = null;
      current.audio.pause();
      current.audio.removeAttribute("src");
      current.audio.load();
    }
    if (current.url) URL.revokeObjectURL(current.url);
    if (current.speech) {
      current.speech.onend = null;
      current.speech.onerror = null;
      window.speechSynthesis.cancel();
    }
  }, []);

  const stop = useCallback(() => {
    retry.current = null;
    release();
    setActiveId(null);
  }, [release]);

  useEffect(() => {
    try {
      preference.current = localStorage.getItem(preferenceKey) === "true";
      setAutoRead(preference.current);
    } catch {
      // 浏览器限制存储时，开关仍可在当前页面使用。
    }
    window.addEventListener("pagehide", stop);
    return () => {
      window.removeEventListener("pagehide", stop);
      retry.current = null;
      release();
    };
  }, [release, stop]);

  function changeAutoRead(enabled: boolean) {
    preference.current = enabled;
    setAutoRead(enabled);
    try {
      localStorage.setItem(preferenceKey, String(enabled));
    } catch {
      // 浏览器限制存储时，开关仍可在当前页面使用。
    }
  }

  async function play(id: string, text: string, automatic = false) {
    if (automatic && !preference.current) return;
    const cached = !automatic && retry.current?.id === id ? retry.current : null;
    stop();
    const current: Playback = { controller: new AbortController() };
    playback.current = current;
    setActiveId(id);

    function finish() {
      if (playback.current !== current) return;
      release();
      setActiveId(null);
    }

    function rememberBlocked(audio?: Blob) {
      if (playback.current !== current) return;
      finish();
      retry.current = { id, audio };
    }

    function fail() {
      if (playback.current !== current) return;
      finish();
      setUnavailable((previous) => new Set(previous).add(id));
    }

    function speak() {
      if (playback.current !== current) return;
      if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return fail();
      try {
        const utterance = new SpeechSynthesisUtterance(text);
        const voices = window.speechSynthesis.getVoices();
        utterance.voice = voices.find(({ lang }) => /^zh[-_]cn$/i.test(lang))
          ?? voices.find(({ lang }) => /^zh(?:[-_]|$)/i.test(lang)) ?? null;
        utterance.lang = utterance.voice?.lang ?? "zh-CN";
        utterance.onend = finish;
        utterance.onerror = ({ error }) => {
          if (error === "not-allowed") rememberBlocked();
          else fail();
        };
        current.speech = utterance;
        window.speechSynthesis.speak(utterance);
      } catch (error) {
        if (autoplayBlocked(error)) rememberBlocked();
        else fail();
      }
    }

    if (cached && !cached.audio) return speak();
    let blob = cached?.audio;
    if (!blob) {
      try {
        const response = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
          signal: current.controller.signal,
        });
        if (!response.ok || !response.headers.get("content-type")?.startsWith("audio/")) return speak();
        blob = await response.blob();
      } catch {
        return speak();
      }
    }
    if (playback.current !== current) return;
    if (!blob.size) return speak();

    function fallback() {
      if (playback.current !== current || current.speech) return;
      if (current.audio) {
        current.audio.onerror = null;
        current.audio.onended = null;
        current.audio.pause();
      }
      speak();
    }

    try {
      current.url = URL.createObjectURL(blob);
      const audio = new Audio(current.url);
      current.audio = audio;
      audio.onended = finish;
      audio.onerror = fallback;
      await audio.play();
    } catch (error) {
      if (autoplayBlocked(error)) rememberBlocked(blob);
      else fallback();
    }
  }

  return { activeId, autoRead, changeAutoRead, play, stop, unavailable };
}
