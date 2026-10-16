"use client";

import { useEffect } from "react";

/** Registra o service worker (só na versão publicada, para não atrapalhar o desenvolvimento). */
export function RegistrarServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
