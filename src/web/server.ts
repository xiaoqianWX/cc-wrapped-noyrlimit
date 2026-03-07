import type { ClaudeCodeStats } from "../types";
import { generateDashboardHTML, serializeStats } from "./dashboard";

async function findOpenPort(startPort: number): Promise<number> {
  for (let port = startPort; port < startPort + 10; port++) {
    try {
      const server = Bun.serve({ port, fetch: () => new Response() });
      server.stop(true);
      return port;
    } catch {
      // port busy, try next
    }
  }
  return startPort; // fallback
}

async function openBrowser(url: string): Promise<boolean> {
  const platform = process.platform;
  let command: string;

  if (platform === "darwin") {
    command = "open";
  } else if (platform === "win32") {
    command = "start";
  } else {
    command = "xdg-open";
  }

  try {
    const proc = Bun.spawn([command, url], {
      stdout: "ignore",
      stderr: "ignore",
    });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

export async function startDashboard(
  stats: ClaudeCodeStats,
  year: number
): Promise<void> {
  const html = generateDashboardHTML(stats);
  const jsonData = JSON.stringify(serializeStats(stats));

  const port = await findOpenPort(3000);

  const server = Bun.serve({
    port,
    fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === "/api/stats") {
        return new Response(jsonData, {
          headers: { "Content-Type": "application/json" },
        });
      }

      // Serve dashboard for all other routes
      return new Response(html, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    },
  });

  const dashboardUrl = `http://localhost:${server.port}`;
  console.log(`\n  Dashboard running at ${dashboardUrl}\n`);
  console.log("  Press Ctrl+C to stop\n");

  await openBrowser(dashboardUrl);

  // Keep running until Ctrl+C
  process.on("SIGINT", () => {
    server.stop(true);
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    server.stop(true);
    process.exit(0);
  });

  // Block forever
  await new Promise(() => {});
}
