// Data contract for the interactive dashboard (`--web`).
// This file, viewer.html, render.ts and open.ts are shared verbatim by the
// cc / codex / kt / agy wrapped packages; only the adapter that builds the
// payload and the theme differ per package.

/** Days since 1970-01-01 for a *local* calendar date (timezone-free). */
export type DayNumber = number;

export interface DashboardTheme {
  scheme: "light" | "dark";
  background: string;
  surface: string;
  surfaceHover: string;
  border: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  /** Eight heatmap colours, empty first. */
  heatmap: string[];
  /** Colours for per-model series, most-used model first; the last one is used for "Other". */
  series: string[];
}

export interface DashboardProduct {
  name: string;
  url: string;
  /** data: URL */
  logo: string;
  /** e.g. "npx cc-wrapped-noyrlimit" */
  command: string;
}

export interface DashboardModel {
  id: string;
  name: string;
  /** false when no price was found, so its cost is missing from totals */
  priced: boolean;
}

export interface DashboardProject {
  path: string;
  name: string;
}

export interface DashboardSession {
  id: string;
  title: string | null;
  /** index into projects, -1 when unknown */
  project: number;
  /** ms epoch */
  start: number;
  end: number;
  branch: string | null;
}

/** [session, day, hour, model, requests, input, output, cacheRead, cacheWrite, reasoning, costUSD] */
export type UsageRow = [number, DayNumber, number, number, number, number, number, number, number, number, number];
/** [session, day, hour, count] */
export type PromptRow = [number, DayNumber, number, number];
/** [session, day, tool, count] */
export type ToolRow = [number, DayNumber, number, number];

export interface DashboardPayload {
  version: 1;
  product: DashboardProduct;
  theme: DashboardTheme;
  generatedAt: number;
  defaultYear: number;
  /** Shown next to cost figures, e.g. "Estimated at API list prices" */
  costNote: string;
  /** Labels for the input-side token columns; packages whose logs lack cache writes can say so. */
  hasCacheWrite: boolean;
  hasReasoning: boolean;
  models: DashboardModel[];
  projects: DashboardProject[];
  sessions: DashboardSession[];
  tools: string[];
  usage: UsageRow[];
  prompts: PromptRow[];
  toolCalls: ToolRow[];
}

export function toDayNumber(date: Date): DayNumber {
  return Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}
