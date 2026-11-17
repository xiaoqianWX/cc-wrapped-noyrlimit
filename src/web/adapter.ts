// Claude Code adapter for the dashboard: turns ~/.claude/projects/**/*.jsonl into a DashboardPayload.

import { createReadStream } from "node:fs";
import { basename } from "node:path";
import { createInterface } from "node:readline";
import logoSvg from "../../assets/images/claude-code-logo.svg" with { type: "text" };
import { createUniqueHash, ensureNumber, entryRole, getClaudeProjectRoots, listJsonlFiles, promptText } from "../collector";
import { colors } from "../image/design-tokens";
import { fetchModelsData, getModelDisplayName, normalizeModelId } from "../models";
import { calculateCostUSD, getModelPricing, type ModelPricing } from "../pricing";
import {
  toDayNumber,
  type DashboardPayload,
  type DashboardProject,
  type DashboardSession,
  type DashboardTheme,
  type PromptRow,
  type ToolRow,
  type UsageRow,
} from "./types";

export const DASHBOARD_PACKAGE = "cc-wrapped";

const THEME: DashboardTheme = {
  scheme: "light",
  background: colors.background,
  surface: colors.surface,
  surfaceHover: colors.surfaceHover,
  border: colors.surfaceBorder,
  text: colors.text.primary,
  textSecondary: colors.text.secondary,
  textMuted: colors.text.muted,
  accent: colors.accent.primary,
  heatmap: [
    colors.heatmap.empty,
    colors.heatmap.level1,
    colors.heatmap.level2,
    colors.heatmap.level3,
    colors.heatmap.level4,
    colors.heatmap.level5,
    colors.heatmap.level6,
    colors.heatmap.level7,
  ],
  series: ["#D97757", "#6A9BCC", "#E6B673", "#788C5D", "#9C5A3C", "#C9B8A8"],
};

interface SessionInfo {
  start: number;
  end: number;
  cwd: string | null;
  branch: string | null;
  title: string | null;
  agentName: string | null;
  firstPrompt: { ts: number; text: string } | null;
}

interface AssistantRecord {
  session: string;
  ts: number;
  model: string;
  usage: any;
  costUSD: number | null;
}

export async function buildDashboardPayload(defaultYear: number, rootsOverride?: string[]): Promise<DashboardPayload> {
  const roots = rootsOverride ?? (await getClaudeProjectRoots());
  const sessions = new Map<string, SessionInfo>();
  const assistant = new Map<string, AssistantRecord>();
  const prompts = new Map<string, { session: string; ts: number }>();
  const toolCalls = new Map<string, { session: string; ts: number; name: string }>();
  let anonymous = 0;

  const sessionOf = (id: string): SessionInfo => {
    let info = sessions.get(id);
    if (!info) {
      info = { start: Infinity, end: -Infinity, cwd: null, branch: null, title: null, agentName: null, firstPrompt: null };
      sessions.set(id, info);
    }
    return info;
  };

  for (const root of roots) {
    let files: string[];
    try {
      files = await listJsonlFiles(root);
    } catch {
      continue;
    }
    for (const file of files) {
      const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
      for await (const line of lines) {
        if (!line.trim()) continue;
        let entry: any;
        try {
          entry = JSON.parse(line);
        } catch {
          continue;
        }
        const sessionId = typeof entry?.sessionId === "string" ? entry.sessionId : null;
        if (!sessionId) continue;

        if (entry.type === "custom-title" && typeof entry.customTitle === "string") {
          sessionOf(sessionId).title = entry.customTitle.trim() || null;
          continue;
        }
        if (entry.type === "agent-name" && typeof entry.agentName === "string") {
          sessionOf(sessionId).agentName = entry.agentName.trim() || null;
          continue;
        }

        const ts = entry.timestamp == null ? NaN : new Date(entry.timestamp).getTime();
        if (!Number.isFinite(ts)) continue;

        const role = entryRole(entry);
        if (role === "assistant") {
          const message = entry.message;
          const model = typeof message?.model === "string" ? normalizeModelId(message.model) : "unknown";
          if (model === "<synthetic>") continue; // locally generated, never billed
          touch(sessionOf(sessionId), entry, ts);
          if (Array.isArray(message?.content)) {
            for (const block of message.content) {
              if (block?.type === "tool_use" && typeof block.id === "string" && typeof block.name === "string" && !toolCalls.has(block.id)) {
                toolCalls.set(block.id, { session: sessionId, ts, name: block.name });
              }
            }
          }
          if (message?.usage) {
            // Streaming writes several records per response; the last one has the final usage.
            const key = createUniqueHash(entry) ?? `anon:${anonymous++}`;
            const costUSD = typeof entry.costUSD === "number" && Number.isFinite(entry.costUSD) ? entry.costUSD : null;
            assistant.set(key, { session: sessionId, ts, model, usage: message.usage, costUSD });
          }
        } else if (role === "user") {
          touch(sessionOf(sessionId), entry, ts);
          const text = promptText(entry);
          if (text !== null) {
            const key = typeof entry.uuid === "string" ? entry.uuid : `anon:${anonymous++}`;
            if (!prompts.has(key)) prompts.set(key, { session: sessionId, ts });
            const info = sessionOf(sessionId);
            if (!info.firstPrompt || ts < info.firstPrompt.ts) info.firstPrompt = { ts, text };
          }
        } else if (typeof entry.cwd === "string") {
          touch(sessionOf(sessionId), entry, ts);
        }
      }
    }
  }

  await fetchModelsData();

  // Index everything that has activity.
  const sessionIndex = new Map<string, number>();
  const projectIndex = new Map<string, number>();
  const projects: DashboardProject[] = [];
  const sessionList: DashboardSession[] = [];
  const activeSessions = new Set<string>();
  for (const r of assistant.values()) activeSessions.add(r.session);
  for (const r of prompts.values()) activeSessions.add(r.session);

  for (const [id, info] of [...sessions.entries()].sort((a, b) => a[1].start - b[1].start)) {
    if (!activeSessions.has(id)) continue;
    let project = -1;
    const path = info.cwd ? projectRoot(info.cwd) : null;
    if (path) {
      project = projectIndex.get(path) ?? -1;
      if (project < 0) {
        project = projects.length;
        projectIndex.set(path, project);
        projects.push({ path, name: basename(path) || path });
      }
    }
    sessionIndex.set(id, sessionList.length);
    sessionList.push({
      id,
      title: info.title ?? info.agentName ?? (info.firstPrompt ? shortTitle(info.firstPrompt.text) : null),
      project,
      start: info.start,
      end: info.end,
      branch: info.branch,
    });
  }
  disambiguateProjectNames(projects);

  const modelIndex = new Map<string, number>();
  const modelIds: string[] = [];
  const modelPriced: boolean[] = [];
  const pricingCache = new Map<string, ModelPricing | null>();
  const usageRows = new Map<string, UsageRow>();
  let hasReasoning = false;

  for (const record of assistant.values()) {
    const s = sessionIndex.get(record.session);
    if (s === undefined) continue;
    const u = record.usage;
    const input = ensureNumber(u.input_tokens);
    const output = ensureNumber(u.output_tokens);
    const cacheWrite = ensureNumber(u.cache_creation_input_tokens);
    const cacheRead = ensureNumber(u.cache_read_input_tokens);
    const cacheWrite1h = ensureNumber(u.cache_creation?.ephemeral_1h_input_tokens);
    const reasoning = ensureNumber(u.output_tokens_details?.thinking_tokens);
    if (reasoning > 0) hasReasoning = true;

    let m = modelIndex.get(record.model);
    if (m === undefined) {
      m = modelIds.length;
      modelIndex.set(record.model, m);
      modelIds.push(record.model);
      modelPriced.push(false);
    }

    let cost = 0;
    if (record.costUSD !== null) {
      cost = record.costUSD;
      modelPriced[m] = true;
    } else {
      if (!pricingCache.has(record.model)) pricingCache.set(record.model, await getModelPricing(record.model));
      const pricing = pricingCache.get(record.model);
      if (pricing) {
        modelPriced[m] = true;
        cost = calculateCostUSD(
          { inputTokens: input, outputTokens: output, cacheCreationTokens: cacheWrite, cacheCreation1hTokens: cacheWrite1h, cachedInputTokens: cacheRead },
          pricing
        );
      }
    }

    const date = new Date(record.ts);
    const day = toDayNumber(date);
    const hour = date.getHours();
    const key = `${s}|${day}|${hour}|${m}`;
    const row = usageRows.get(key) ?? ([s, day, hour, m, 0, 0, 0, 0, 0, 0, 0] as UsageRow);
    row[4] += 1;
    row[5] += input;
    row[6] += output;
    row[7] += cacheRead;
    row[8] += cacheWrite;
    row[9] += reasoning;
    row[10] += cost;
    usageRows.set(key, row);
  }

  const promptRows = new Map<string, PromptRow>();
  for (const record of prompts.values()) {
    const s = sessionIndex.get(record.session);
    if (s === undefined) continue;
    const date = new Date(record.ts);
    const day = toDayNumber(date);
    const hour = date.getHours();
    const key = `${s}|${day}|${hour}`;
    const row = promptRows.get(key) ?? ([s, day, hour, 0] as PromptRow);
    row[3] += 1;
    promptRows.set(key, row);
  }

  const toolIndex = new Map<string, number>();
  const tools: string[] = [];
  const toolRows = new Map<string, ToolRow>();
  for (const call of toolCalls.values()) {
    const s = sessionIndex.get(call.session);
    if (s === undefined) continue;
    let t = toolIndex.get(call.name);
    if (t === undefined) {
      t = tools.length;
      toolIndex.set(call.name, t);
      tools.push(call.name);
    }
    const day = toDayNumber(new Date(call.ts));
    const key = `${s}|${day}|${t}`;
    const row = toolRows.get(key) ?? ([s, day, t, 0] as ToolRow);
    row[3] += 1;
    toolRows.set(key, row);
  }

  return {
    version: 1,
    product: {
      name: "Claude Code",
      url: "claude.ai/code",
      logo: `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString("base64")}`,
      command: "npx cc-wrapped-noyrlimit",
    },
    theme: THEME,
    generatedAt: Date.now(),
    defaultYear,
    costNote: "Estimated at Anthropic API list prices",
    hasCacheWrite: true,
    hasReasoning,
    models: modelIds.map((id, i) => ({ id, name: getModelDisplayName(id), priced: modelPriced[i] })),
    projects,
    sessions: sessionList,
    tools,
    usage: [...usageRows.values()].map(roundCost),
    prompts: [...promptRows.values()],
    toolCalls: [...toolRows.values()],
  };
}

function touch(info: SessionInfo, entry: any, ts: number) {
  if (ts < info.start) info.start = ts;
  if (ts > info.end) info.end = ts;
  if (!info.cwd && typeof entry.cwd === "string" && entry.cwd) info.cwd = entry.cwd;
  if (typeof entry.gitBranch === "string" && entry.gitBranch && entry.gitBranch !== "HEAD") info.branch = entry.gitBranch;
}

function shortTitle(text: string): string {
  const command = /<command-name>\s*([^<]+?)\s*<\/command-name>/.exec(text);
  const args = /<command-args>\s*([^<]*?)\s*<\/command-args>/.exec(text);
  const plain = command ? `${command[1]} ${args?.[1] ?? ""}` : text;
  const oneLine = plain.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return oneLine.length > 80 ? `${oneLine.slice(0, 79)}…` : oneLine;
}

/** Group git worktrees with their repository. */
function projectRoot(cwd: string): string {
  return cwd.replace(/[\\/]\.claude[\\/]worktrees[\\/].*$/, "").replace(/[\\/]+$/, "") || cwd;
}

function disambiguateProjectNames(projects: DashboardProject[]) {
  const byName = new Map<string, DashboardProject[]>();
  for (const project of projects) byName.set(project.name, [...(byName.get(project.name) ?? []), project]);
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    for (const project of group) {
      const parts = project.path.split(/[\\/]/).filter(Boolean);
      project.name = parts.slice(-2).join("/") || project.path;
    }
  }
}

function roundCost(row: UsageRow): UsageRow {
  row[10] = Math.round(row[10] * 1e6) / 1e6;
  return row;
}
