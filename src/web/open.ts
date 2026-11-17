import { mkdir } from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";

/** Write the dashboard to a per-user temp folder and return its path. */
export async function writeDashboard(packageName: string, year: number, html: string): Promise<string> {
  const dir = join(os.tmpdir(), packageName);
  await mkdir(dir, { recursive: true });
  const path = join(dir, `dashboard-${year}.html`);
  await Bun.write(path, html);
  return path;
}

/** Open a URL or file with the system handler. */
export async function openExternal(target: string): Promise<boolean> {
  const command =
    process.platform === "darwin"
      ? ["open", target]
      : process.platform === "win32"
      ? // `start` is a cmd builtin and treats "&" as a separator; this handler takes the target verbatim.
        ["rundll32", "url.dll,FileProtocolHandler", target]
      : ["xdg-open", target];

  try {
    const proc = Bun.spawn(command, { stdout: "ignore", stderr: "ignore" });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}
