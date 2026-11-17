import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";
import { promptText } from "../collector";
import { buildDashboardPayload } from "../web/adapter";
import { renderDashboardHtml, serializeForScript } from "../web/render";
import { toDayNumber } from "../web/types";

const dirs: string[] = [];
afterEach(async () => {
  while (dirs.length) await rm(dirs.pop()!, { recursive: true, force: true });
});

async function projectsRoot(files: Record<string, object[]>): Promise<string> {
  const root = await mkdtemp(join(os.tmpdir(), "cc-dash-"));
  dirs.push(root);
  for (const [name, entries] of Object.entries(files)) {
    const path = join(root, name);
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
  }
  return root;
}

const T0 = new Date(2026, 9, 27, 23, 30).getTime(); // local time, late evening
const iso = (offsetMin: number) => new Date(T0 + offsetMin * 60_000).toISOString();
const usage = (input: number, output: number) => ({ input_tokens: input, output_tokens: output, cache_read_input_tokens: 1000, cache_creation_input_tokens: 100 });

function assistant(id: string, offsetMin: number, model: string, u: object, content: object[] = [], extra: object = {}) {
  return { type: "assistant", sessionId: "s1", cwd: "/work/repo/.claude/worktrees/feature-x", gitBranch: "feature-x", timestamp: iso(offsetMin), requestId: `req-${id}`, uuid: `a-${id}-${offsetMin}`, message: { id: `msg-${id}`, model, usage: u, content }, ...extra };
}
function user(uuid: string, offsetMin: number, content: unknown, extra: object = {}) {
  return { type: "user", sessionId: "s1", cwd: "/work/repo", timestamp: iso(offsetMin), uuid, message: { role: "user", content }, ...extra };
}

describe("dashboard adapter", () => {
  test("dedupes streaming records, tool calls and resumed prompts; classifies prompts", async () => {
    const tool = { type: "tool_use", id: "toolu_1", name: "Bash", input: {} };
    const main = [
      { type: "custom-title", sessionId: "s1", customTitle: "Fix the parser" },
      user("u1", 0, "please fix the parser", { origin: { kind: "human" } }),
      // Two streaming records for one response: only the last usage counts, the tool call counts once.
      assistant("1", 1, "claude-opus-5-5", usage(10, 5), [tool]),
      assistant("1", 1, "claude-opus-5-5", usage(10, 50), [{ type: "text", text: "done" }]),
      user("u2", 2, [{ type: "tool_result", tool_use_id: "toolu_1", content: "ok" }], { toolUseResult: {} }),
      user("u3", 3, "<task-notification>bg task done</task-notification>", { origin: { kind: "task-notification" } }),
      user("u4", 4, "<local-command-stdout>Set model</local-command-stdout>"), // pre-origin log format
      user("u5", 40, "and add tests", { origin: { kind: "human" } }), // crosses midnight
      assistant("2", 41, "claude-sonnet-5-5", usage(20, 30)),
      assistant("3", 42, "<synthetic>", usage(0, 0)),
    ];
    const root = await projectsRoot({
      "-work-repo/s1.jsonl": main,
      // A resumed copy repeats the same uuids / ids and must not double count.
      "-work-repo/s1-copy.jsonl": [main[1], main[3], main[4]],
      "-work-repo/s1/subagents/agent-1.jsonl": [
        user("sub-u1", 5, "subagent task", { isSidechain: true }),
        assistant("sub1", 6, "claude-haiku-5-5", usage(7, 3), [], { isSidechain: true }),
      ],
    });

    const payload = await buildDashboardPayload(2026, [root]);

    expect(payload.sessions).toHaveLength(1);
    expect(payload.sessions[0]).toMatchObject({ id: "s1", title: "Fix the parser", branch: "feature-x" });
    expect(payload.projects).toEqual([{ path: "/work/repo", name: "repo" }]);

    const byModel = new Map<string, number[]>();
    for (const row of payload.usage) {
      const id = payload.models[row[3]].id;
      const acc = byModel.get(id) ?? [0, 0, 0];
      acc[0] += row[4];
      acc[1] += row[5];
      acc[2] += row[6];
      byModel.set(id, acc);
    }
    expect(byModel.get("claude-opus-5-5")).toEqual([1, 10, 50]);
    expect(byModel.get("claude-sonnet-5-5")).toEqual([1, 20, 30]);
    expect(byModel.get("claude-haiku-5-5")).toEqual([1, 7, 3]); // subagent usage still costs money
    expect(byModel.has("<synthetic>")).toBe(false);

    // Prompts: u1 and u5 only, on two different local days.
    expect(payload.prompts.reduce((s, r) => s + r[3], 0)).toBe(2);
    const day0 = toDayNumber(new Date(T0));
    expect(payload.prompts.map((r) => r[1]).sort()).toEqual([day0, day0 + 1]);
    expect(payload.prompts.find((r) => r[1] === day0)![2]).toBe(23);

    expect(payload.tools).toEqual(["Bash"]);
    expect(payload.toolCalls.reduce((s, r) => s + r[3], 0)).toBe(1);
    expect(payload.models.every((m) => m.priced)).toBe(true);
    expect(payload.usage.reduce((s, r) => s + r[10], 0)).toBeGreaterThan(0);
  });

  test("falls back to the first prompt for untitled sessions", async () => {
    const root = await projectsRoot({
      "-w/s1.jsonl": [user("u1", 0, "<command-name>/review</command-name>\n<command-args>src/app.ts</command-args>"), assistant("1", 1, "claude-opus-5-5", usage(1, 1))],
    });
    const payload = await buildDashboardPayload(2026, [root]);
    expect(payload.sessions[0].title).toBe("/review src/app.ts");
  });

  test("promptText ignores injected turns", () => {
    expect(promptText({ message: { content: "hi" } })).toBe("hi");
    expect(promptText({ isMeta: true, message: { content: "hi" } })).toBeNull();
    expect(promptText({ origin: { kind: "human" }, message: { content: [{ type: "image" }, { type: "text", text: "look" }] } })).toBe("look");
    expect(promptText({ message: { content: [{ type: "image" }] } })).toBe("[image]");
    expect(promptText({ message: { content: "Caveat: The messages below were generated" } })).toBeNull();
  });
});

describe("dashboard render", () => {
  test("inlines data safely and fills every placeholder", async () => {
    const root = await projectsRoot({
      "-w/s1.jsonl": [
        { type: "custom-title", sessionId: "s1", customTitle: "</script><script>alert(1)</script> $& $1" },
        user("u1", 0, "hi"),
        assistant("1", 1, "claude-opus-5-5", usage(1, 1)),
      ],
    });
    const payload = await buildDashboardPayload(2026, [root]);
    const html = renderDashboardHtml(payload, [{ weight: 400, data: new Uint8Array([1, 2, 3]).buffer }]);

    for (const token of ["__DATA__", "/*__THEME__*/", "/*__FONTS__*/", "__TITLE__"]) expect(html).not.toContain(token);
    expect(html.match(/<\/script>/g)).toHaveLength(2); // only the page's own two script tags
    expect(html).toContain("--hm-7:");
    expect(html).toContain("font/ttf;base64,AQID");

    const json = html.slice(html.indexOf('type="application/json">') + 24, html.indexOf("</script>", html.indexOf('type="application/json">')));
    expect(JSON.parse(json).sessions[0].title).toBe("</script><script>alert(1)</script> $& $1");
  });

  test("serializeForScript escapes markup and line separators", () => {
    expect(serializeForScript({ a: "<&>\u2028\u2029" })).toBe('{"a":"\\u003c\\u0026\\u003e\\u2028\\u2029"}');
  });
});
