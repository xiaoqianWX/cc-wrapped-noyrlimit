// Data collector - reads Claude Code storage and returns raw data

import { createReadStream } from "node:fs";
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import os from "node:os";
import { createInterface } from "node:readline";
import { calculateCostUSD, getModelPricing, type ModelPricing } from "./pricing";

export interface ClaudeStatsCache {
  version?: number;
  lastComputedDate?: string;
  dailyActivity?: Array<{
    date: string;
    messageCount: number;
    sessionCount: number;
    toolCallCount?: number;
  }>;
  dailyModelTokens?: Array<{
    date: string;
    tokensByModel: Record<string, number>;
  }>;
  modelUsage?: Record<
    string,
    {
      inputTokens?: number;
      outputTokens?: number;
      cacheReadInputTokens?: number;
      cacheCreationInputTokens?: number;
      webSearchRequests?: number;
      costUSD?: number;
      contextWindow?: number;
    }
  >;
  totalSessions?: number;
  totalMessages?: number;
  firstSessionDate?: string;
}

export interface ClaudeModelUsageSummary {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  webSearchRequests: number;
}

const CLAUDE_DATA_PATH = join(os.homedir(), ".claude");
const CLAUDE_PROJECTS_DIR = "projects";
const CLAUDE_CONFIG_PATH = join(os.homedir(), ".config", "claude");
const CLAUDE_CONFIG_DIR_ENV = "CLAUDE_CONFIG_DIR";
const CLAUDE_STATS_CACHE_FILENAME = "stats-cache.json";
const CLAUDE_HISTORY_FILENAME = "history.jsonl";

export interface ClaudeUsageSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  totalTokens: number;
  totalCostUSD: number;
  modelTokenTotals: Map<string, number>;
  modelUsage: Map<string, ClaudeModelUsageSummary>;
  firstTimestamp: Date | null;
  dailyActivity: Map<string, number>;
  totalMessages: number;
  totalSessions: number;
  totalWebSearchRequests: number;
}

export async function checkClaudeDataExists(): Promise<boolean> {
  const paths = await getClaudePaths();
  const [statsCacheExists, historyExists] = await Promise.all([
    pathExists(paths.statsCachePath),
    pathExists(paths.historyPath),
  ]);
  return statsCacheExists || paths.projectRoots.length > 0 || historyExists;
}

export async function loadClaudeStatsCache(): Promise<ClaudeStatsCache> {
  const paths = await getClaudePaths();
  try {
    const raw = await readFile(paths.statsCachePath, "utf8");
    return {
      ...createEmptyStatsCache(),
      ...(JSON.parse(raw) as ClaudeStatsCache),
    };
  } catch {
    return createEmptyStatsCache();
  }
}

export async function collectClaudeProjects(year: number): Promise<Set<string>> {
  const projects = new Set<string>();
  const paths = await getClaudePaths();

  try {
    const raw = await readFile(paths.historyPath, "utf8");
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as { timestamp?: number; project?: string };
        if (!entry.timestamp || !entry.project) continue;
        const entryYear = new Date(entry.timestamp).getFullYear();
        if (entryYear !== year) continue;
        projects.add(entry.project);
      } catch {
        // Skip malformed lines
      }
    }
  } catch {
    // history.jsonl may not exist
  }

  return projects;
}

export async function collectClaudeUsageSummary(year: number): Promise<ClaudeUsageSummary> {
  const { projectRoots: roots } = await getClaudePaths();
  const modelTokenTotals = new Map<string, number>();
  const modelUsage = new Map<string, ClaudeModelUsageSummary>();
  const pricingCache = new Map<string, ModelPricing | null>();
  const latestEntries = new Map<string, any>();
  const dailyActivity = new Map<string, number>();
  const sessionIds = new Set<string>();

  let firstTimestamp: Date | null = null;

  // Pass 1: collect entries, keeping only the last occurrence per dedup key.
  // Claude Code emits multiple JSONL records per streaming API response, all
  // sharing the same message.id.  Only the LAST record has the final token
  // tallies — earlier ones hold partial/incorrect values.
  for (const root of roots) {
    const exists = await pathIsDirectory(root);
    if (!exists) continue;

    const files = await listJsonlFiles(root);
    for (const filePath of files) {
      const rl = createInterface({
        input: createReadStream(filePath),
        crlfDelay: Infinity,
      });

      for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let entry: any;
        try {
          entry = JSON.parse(trimmed);
        } catch {
          continue;
        }

        const timestamp = entry?.timestamp;
        if (!timestamp) continue;
        const entryDate = new Date(timestamp);
        if (Number.isNaN(entryDate.getTime()) || entryDate.getFullYear() !== year) {
          continue;
        }

        const uniqueHash = createUniqueHash(entry);
        if (uniqueHash) {
          latestEntries.set(uniqueHash, entry); // last wins
        } else {
          // Entries without a hash get a unique key so they're never overwritten
          latestEntries.set(`__nohash__${latestEntries.size}`, entry);
        }

        if (firstTimestamp == null || entryDate < firstTimestamp) {
          firstTimestamp = entryDate;
        }
      }
    }
  }

  // Pass 2: accumulate totals from deduplicated entries
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheCreationTokens = 0;
  let totalCacheReadTokens = 0;
  let totalTokens = 0;
  let totalCostUSD = 0;
  let totalMessages = 0;
  let totalWebSearchRequests = 0;

  for (const entry of latestEntries.values()) {
    const entryDate = new Date(entry.timestamp);
    const dateKey = formatDateKey(entryDate);
    dailyActivity.set(dateKey, (dailyActivity.get(dateKey) || 0) + 1);
    totalMessages += 1;

    const sessionId = typeof entry?.sessionId === "string" ? entry.sessionId : undefined;
    if (sessionId) {
      sessionIds.add(sessionId);
    }

    const usage = entry?.message?.usage;
    const model = typeof entry?.message?.model === "string" ? entry.message.model : undefined;

    const rawCost = entry?.costUSD;
    const hasCost = typeof rawCost === "number" && Number.isFinite(rawCost);
    if (hasCost) {
      totalCostUSD += rawCost;
    }

    if (!usage) continue;

    const input = ensureNumber(usage.input_tokens);
    const output = ensureNumber(usage.output_tokens);
    const cacheCreate = ensureNumber(usage.cache_creation_input_tokens);
    const cacheRead = ensureNumber(usage.cache_read_input_tokens);
    const webSearchRequests = ensureNumber(usage.server_tool_use?.web_search_requests);
    const entryTotal = input + output + cacheCreate + cacheRead;

    totalInputTokens += input;
    totalOutputTokens += output;
    totalCacheCreationTokens += cacheCreate;
    totalCacheReadTokens += cacheRead;
    totalTokens += entryTotal;
    totalWebSearchRequests += webSearchRequests;

    if (typeof model === "string" && model.trim() !== "") {
      modelTokenTotals.set(model, (modelTokenTotals.get(model) || 0) + entryTotal);
      const currentModelUsage = modelUsage.get(model) ?? {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        webSearchRequests: 0,
      };
      currentModelUsage.inputTokens += input;
      currentModelUsage.outputTokens += output;
      currentModelUsage.cacheReadInputTokens += cacheRead;
      currentModelUsage.cacheCreationInputTokens += cacheCreate;
      currentModelUsage.webSearchRequests += webSearchRequests;
      modelUsage.set(model, currentModelUsage);

      if (!hasCost && entryTotal > 0) {
        let pricing = pricingCache.get(model);
        if (!pricingCache.has(model)) {
          pricing = await getModelPricing(model);
          pricingCache.set(model, pricing ?? null);
        }

        if (pricing) {
          totalCostUSD += calculateCostUSD(
            {
              inputTokens: input,
              outputTokens: output,
              cacheCreationTokens: cacheCreate,
              cachedInputTokens: cacheRead,
            },
            pricing
          );
        }
      }
    }
  }

  return {
    totalInputTokens,
    totalOutputTokens,
    totalCacheCreationTokens,
    totalCacheReadTokens,
    totalTokens,
    totalCostUSD,
    modelTokenTotals,
    modelUsage,
    firstTimestamp,
    dailyActivity,
    totalMessages,
    totalSessions: sessionIds.size,
    totalWebSearchRequests,
  };
}

function createEmptyStatsCache(): ClaudeStatsCache {
  return {
    dailyActivity: [],
    dailyModelTokens: [],
    modelUsage: {},
  };
}

function createUniqueHash(entry: any): string | null {
  const messageId = entry?.message?.id;
  const requestId = entry?.requestId;
  if (!messageId || !requestId) return null;
  return `${messageId}:${requestId}`;
}

async function getClaudeProjectRoots(): Promise<string[]> {
  const { projectRoots } = await getClaudePaths();
  return projectRoots;
}

interface ClaudePaths {
  projectRoots: string[];
  statsCachePath: string;
  historyPath: string;
}

async function getClaudePaths(): Promise<ClaudePaths> {
  const baseCandidates = getClaudeBaseCandidates();
  const existingBases = await getExistingCanonicalDirs(baseCandidates);
  const metadataBase = existingBases[0] ?? baseCandidates[0] ?? resolve(CLAUDE_CONFIG_PATH);
  const projectRoots = await getCanonicalProjectRoots(existingBases);

  return {
    projectRoots,
    statsCachePath: join(metadataBase, CLAUDE_STATS_CACHE_FILENAME),
    historyPath: join(metadataBase, CLAUDE_HISTORY_FILENAME),
  };
}

function getClaudeBaseCandidates(): string[] {
  const configuredPaths = (process.env[CLAUDE_CONFIG_DIR_ENV] ?? "").trim();
  const entries = configuredPaths !== ""
    ? configuredPaths.split(",")
    : [CLAUDE_CONFIG_PATH, CLAUDE_DATA_PATH];

  const deduped = new Set<string>();
  const resolvedPaths: string[] = [];

  for (const entry of entries.map((value) => value.trim()).filter((value) => value !== "")) {
    const resolved = resolve(entry);
    if (deduped.has(resolved)) continue;
    deduped.add(resolved);
    resolvedPaths.push(resolved);
  }

  return resolvedPaths;
}

async function getExistingCanonicalDirs(paths: string[]): Promise<string[]> {
  const deduped = new Set<string>();
  const existing: string[] = [];

  for (const path of paths) {
    if (!(await pathIsDirectory(path))) continue;
    const canonical = await resolveCanonicalPath(path);
    if (deduped.has(canonical)) continue;
    deduped.add(canonical);
    existing.push(canonical);
  }

  return existing;
}

async function getCanonicalProjectRoots(baseDirs: string[]): Promise<string[]> {
  const deduped = new Set<string>();
  const roots: string[] = [];

  for (const baseDir of baseDirs) {
    const projectsPath = join(baseDir, CLAUDE_PROJECTS_DIR);
    if (!(await pathIsDirectory(projectsPath))) continue;
    const canonical = await resolveCanonicalPath(projectsPath);
    if (deduped.has(canonical)) continue;
    deduped.add(canonical);
    roots.push(canonical);
  }

  return roots;
}

async function resolveCanonicalPath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return path;
  }
}

async function pathIsDirectory(path: string): Promise<boolean> {
  try {
    const info = await stat(path);
    return info.isDirectory();
  } catch {
    return false;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function listJsonlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listJsonlFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      files.push(fullPath);
    }
  }

  return files;
}

function ensureNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
