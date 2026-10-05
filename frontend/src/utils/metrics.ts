import { PipecatMetricsData } from "@pipecat-ai/client-js";

/**
 * Extracts and formats the primary Time-To-First-Byte (TTFB) in milliseconds.
 * In Pipecat, metric values under 10 are emitted in seconds (float).
 */
export function getTTFBMs(metrics?: PipecatMetricsData | null): number | null {
  if (!metrics?.ttfb || metrics.ttfb.length === 0) return null;
  const latest = metrics.ttfb[metrics.ttfb.length - 1];
  if (!latest || typeof latest.value !== "number") return null;
  const raw = latest.value;
  return raw < 10 ? Math.round(raw * 1000) : Math.round(raw);
}

/**
 * Extracts and formats the cumulative or primary processing time in milliseconds.
 */
export function getProcessingMs(metrics?: PipecatMetricsData | null): number | null {
  if (!metrics?.processing || metrics.processing.length === 0) return null;
  const total = metrics.processing.reduce((acc, curr) => acc + (curr.value || 0), 0);
  return total < 10 ? Math.round(total * 1000) : Math.round(total);
}

/**
 * Extracts the total number of characters synthesized.
 */
export function getCharacterCount(metrics?: PipecatMetricsData | null): number | null {
  if (!metrics?.characters || metrics.characters.length === 0) return null;
  return metrics.characters.reduce((acc, curr) => acc + (curr.value || 0), 0);
}

/**
 * Evaluates TTFB against conversational voice SLAs.
 */
export function getTTFBStatus(ms: number | null): {
  label: string;
  badgeClass: string;
  dotClass: string;
  textClass: string;
} {
  if (ms === null) {
    return {
      label: "Awaiting",
      badgeClass: "bg-slate-800 text-slate-400 border-slate-700",
      dotClass: "bg-slate-500",
      textClass: "text-slate-400",
    };
  }
  if (ms < 200) {
    return {
      label: "Optimal (<200ms)",
      badgeClass: "bg-emerald-950/60 text-emerald-400 border-emerald-800/80 shadow-[0_0_10p_rgba(16,185,129,0.15)]",
      dotClass: "bg-emerald-400 animate-pulse",
      textClass: "text-emerald-400",
    };
  }
  if (ms <= 350) {
    return {
      label: "Good (<350ms)",
      badgeClass: "bg-amber-950/60 text-amber-400 border-amber-800/80",
      dotClass: "bg-amber-400",
      textClass: "text-amber-400",
    };
  }
  return {
    label: "Elevated (>350ms)",
    badgeClass: "bg-rose-950/60 text-rose-400 border-rose-800/80",
    dotClass: "bg-rose-400",
    textClass: "text-rose-400",
  };
}
