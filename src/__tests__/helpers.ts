import { join } from "node:path";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

export interface MockEntry {
  model: string;
  timestamp: string; // ISO date
  sessionId?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  costUSD?: number;
}

export function makeEntry(opts: MockEntry): string {
  const ts = new Date(opts.timestamp).getTime();
  return JSON.stringify({
    timestamp: ts,
    sessionId: opts.sessionId ?? "test-session-1",
    requestId: `req-${Math.random().toString(36).slice(2)}`,
    message: {
      id: `msg-${Math.random().toString(36).slice(2)}`,
      role: "assistant",
      model: opts.model,
      usage: {
        input_tokens: opts.inputTokens ?? 1000,
        output_tokens: opts.outputTokens ?? 500,
        cache_read_input_tokens: opts.cacheReadTokens ?? 0,
        cache_creation_input_tokens: opts.cacheCreationTokens ?? 0,
      },
    },
    ...(opts.costUSD != null ? { costUSD: opts.costUSD } : {}),
  });
}

export interface ScenarioConfig {
  year: number;
  entries: MockEntry[];
}

export async function createMockProjectDir(scenario: ScenarioConfig): Promise<string> {
  const base = await mkdtemp(join(tmpdir(), "cc-wrapped-test-"));
  const projectsDir = join(base, "projects");
  const sessionFile = join(projectsDir, "session.jsonl");

  const lines = scenario.entries.map((e) => makeEntry(e));
  await writeFile(sessionFile, lines.join("\n"));

  return base;
}

export async function cleanupMockDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

// Pre-built scenarios
export function allAnthropic(year: number): MockEntry[] {
  return [
    { model: "claude-opus-4-6", timestamp: `${year}-02-15T10:00:00Z`, inputTokens: 5000, outputTokens: 2000 },
    { model: "claude-opus-4-6", timestamp: `${year}-02-16T11:00:00Z`, inputTokens: 3000, outputTokens: 1500 },
    { model: "claude-haiku-4-5-20251001", timestamp: `${year}-02-17T12:00:00Z`, inputTokens: 1000, outputTokens: 500 },
  ];
}

export function allGLM(year: number): MockEntry[] {
  return [
    { model: "glm-5.1", timestamp: `${year}-03-10T10:00:00Z`, inputTokens: 8000, outputTokens: 3000 },
    { model: "glm-5.1", timestamp: `${year}-03-11T11:00:00Z`, inputTokens: 6000, outputTokens: 2500 },
    { model: "glm-4.5-air", timestamp: `${year}-03-12T12:00:00Z`, inputTokens: 2000, outputTokens: 1000 },
    { model: "glm-4.7", timestamp: `${year}-03-13T13:00:00Z`, inputTokens: 1500, outputTokens: 800 },
  ];
}

export function mixedModels(year: number): MockEntry[] {
  return [
    ...allAnthropic(year),
    ...allGLM(year),
  ];
}

export function singleModel(year: number): MockEntry[] {
  return [
    { model: "glm-5.1", timestamp: `${year}-04-01T09:00:00Z`, inputTokens: 10000, outputTokens: 5000 },
  ];
}

export function multiSession(year: number): MockEntry[] {
  return [
    { model: "glm-5.1", timestamp: `${year}-04-01T09:00:00Z`, sessionId: "s1", inputTokens: 5000, outputTokens: 2000 },
    { model: "glm-5.1", timestamp: `${year}-04-01T10:00:00Z`, sessionId: "s1", inputTokens: 3000, outputTokens: 1500 },
    { model: "glm-4.5-air", timestamp: `${year}-04-02T09:00:00Z`, sessionId: "s2", inputTokens: 2000, outputTokens: 1000 },
    { model: "claude-opus-4-6", timestamp: `${year}-04-03T09:00:00Z`, sessionId: "s3", inputTokens: 4000, outputTokens: 2000 },
  ];
}
