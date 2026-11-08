/**
 * Lightweight, privacy-first performance measurements for the speaking studio.
 * Metrics stay in memory in this browser tab; nothing is sent to a server.
 */

type StudioMetrics = {
  ttfb?: number;
  fcp?: number;
  lcp?: number;
  cls: number;
  inp?: number;
  lastScreenChange?: number;
};

const metrics: StudioMetrics = { cls: 0 };
let started = false;
let interactionSequence = 0;

function observe(type: string, callback: (entry: PerformanceEntry) => void) {
  if (typeof PerformanceObserver === "undefined") return;
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) callback(entry);
    });
    observer.observe(type === "event"
      ? { type, buffered: true, durationThreshold: 16 }
      : { type, buffered: true });
  } catch {
    // Older browsers may not support a particular performance entry type.
  }
}

export function startStudioPerformanceMonitoring() {
  if (started || typeof window === "undefined" || typeof performance === "undefined") return;
  started = true;

  const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  if (navigation && navigation.responseStart > 0) {
    metrics.ttfb = navigation.responseStart - navigation.requestStart;
  }

  observe("paint", (entry) => {
    if (entry.name === "first-contentful-paint") metrics.fcp = entry.startTime;
  });
  observe("largest-contentful-paint", (entry) => {
    metrics.lcp = entry.startTime;
  });
  observe("layout-shift", (entry) => {
    const shift = entry as PerformanceEntry & { value?: number; hadRecentInput?: boolean };
    if (!shift.hadRecentInput) metrics.cls += shift.value ?? 0;
  });
  observe("event", (entry) => {
    const event = entry as PerformanceEntry & { interactionId?: number };
    if (event.interactionId) metrics.inp = Math.max(metrics.inp ?? 0, event.duration);
  });
}

export function measureScreenChange(startedAt: number) {
  if (typeof window === "undefined" || typeof performance === "undefined") return;
  if (typeof requestAnimationFrame === "undefined") {
    metrics.lastScreenChange = performance.now() - startedAt;
    return;
  }
  const sequence = ++interactionSequence;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (sequence !== interactionSequence) return;
    metrics.lastScreenChange = performance.now() - startedAt;
  }));
}

function ms(value?: number) {
  return value === undefined ? "not available yet" : `${Math.round(value)} ms`;
}

export function getStudioPerformanceReport() {
  return [
    "Speak to the Lens — local performance snapshot",
    `Time to first byte: ${ms(metrics.ttfb)}`,
    `First contentful paint: ${ms(metrics.fcp)}`,
    `Largest contentful paint: ${ms(metrics.lcp)}`,
    `Interaction to next paint (observed max): ${ms(metrics.inp)}`,
    `Cumulative layout shift: ${metrics.cls.toFixed(3)}`,
    `Last screen change: ${ms(metrics.lastScreenChange)}`,
    "",
    "Collected locally in this browser tab. No script text, recordings, camera data or personal information is collected or transmitted.",
  ].join("\n");
}
