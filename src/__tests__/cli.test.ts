import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { cleanupDir, createClaudeConfigDir } from "./helpers";

const tempDirs: string[] = [];
const REPO_ROOT = join(import.meta.dir, "..", "..");

async function registerTempDir(path: Promise<string>): Promise<string> {
  const resolved = await path;
  tempDirs.push(resolved);
  return resolved;
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    await cleanupDir(tempDirs.pop()!);
  }
});

async function runCli(
  args: string[],
  envOverrides: Record<string, string | undefined> = {}
): Promise<{ exitCode: number; output: string }> {
  const env: Record<string, string> = {
    ...process.env,
    TERM: "dumb",
    NO_COLOR: "1",
    CI: "1",
  };

  for (const [key, value] of Object.entries(envOverrides)) {
    if (value == null) {
      delete env[key];
    } else {
      env[key] = value;
    }
  }

  const proc = Bun.spawn([process.execPath, "src/index.ts", ...args], {
    cwd: REPO_ROOT,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return {
    exitCode,
    output: `${stdout}${stderr}`,
  };
}

describe("CLI smoke paths", () => {
  test("prints help text", async () => {
    const result = await runCli(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("USAGE:");
    expect(result.output).toContain("cc-wrapped [OPTIONS]");
  });

  test("prints the current CLI version", async () => {
    const result = await runCli(["--version"]);

    expect(result.exitCode).toBe(0);
    expect(result.output.trim()).toBe("cc-wrapped v1.0.2");
  });

  test("rejects wrapped requests for a future year before reading local data", async () => {
    const futureYear = String(new Date().getFullYear() + 1);

    const result = await runCli(["--year", futureYear], {
      CLAUDE_CONFIG_DIR: "/definitely/missing/cc-wrapped-test",
    });

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain(
      `Claude Code Wrapped ${futureYear} isn't available yet. The future hasn't been written!`
    );
  });

  test("exits early when no Claude data exists in the configured directory", async () => {
    const baseDir = await registerTempDir(createClaudeConfigDir());

    const result = await runCli(["--year", "2025"], {
      CLAUDE_CONFIG_DIR: baseDir,
    });

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Claude Code data not found in ~/.claude");
  });
});
