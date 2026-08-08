"use client";

import { useEffect } from "react";

const APP_ROUTES = ["/today", "/inbox", "/upcoming", "/planner", "/board", "/filters-labels", "/projects", "/insights", "/timer-history", "/completed"];

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let cancelled = false;

    navigator.serviceWorker.register("/sw.js", { scope: "/" })
      .then(async (registration) => {
        if (cancelled) return;
        await navigator.serviceWorker.ready;
        const worker = registration.active ?? navigator.serviceWorker.controller;
        if (window.location.pathname !== "/login") worker?.postMessage({ type: "CACHE_APP_SHELL", routes: APP_ROUTES });
      })
      .catch(() => {
        // Orbit remains usable online if service workers are unavailable.
      });

    return () => { cancelled = true; };
  }, []);

  return null;
}
