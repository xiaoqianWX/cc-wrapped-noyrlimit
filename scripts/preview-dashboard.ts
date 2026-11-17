// Dev helper: render the dashboard from local logs into a folder for previewing.
import { loadFonts } from "../src/image/fonts";
import { buildDashboardPayload } from "../src/web/adapter";
import { renderDashboardHtml } from "../src/web/render";

const out = process.argv[2] ?? "dashboard-preview.html";
const year = Number(process.argv[3] ?? new Date().getFullYear());
const payload = await buildDashboardPayload(year);
const fonts = (await loadFonts()).map((font) => ({ weight: Number(font.weight), data: font.data as ArrayBuffer }));
await Bun.write(out, renderDashboardHtml(payload, fonts));
console.log(`wrote ${out}`);
