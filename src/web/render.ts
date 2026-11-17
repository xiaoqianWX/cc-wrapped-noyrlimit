import viewerHtml from "./viewer.html" with { type: "text" };
import type { DashboardPayload, DashboardTheme } from "./types";

// `type: "text"` yields the file contents; bun-types still types *.html imports as HTMLBundle.
const template = viewerHtml as unknown as string;

export interface DashboardFont {
  weight: number;
  data: ArrayBuffer;
}

/** Build the self-contained dashboard page: data, theme and fonts are inlined, nothing is fetched. */
export function renderDashboardHtml(payload: DashboardPayload, fonts: DashboardFont[] = []): string {
  const fontFaces = fonts
    .map(
      (font) =>
        `@font-face{font-family:"IBM Plex Mono";font-weight:${font.weight};font-style:normal;font-display:block;` +
        `src:url(data:font/ttf;base64,${Buffer.from(font.data).toString("base64")}) format("truetype");}`
    )
    .join("\n");

  // Function replacers: the payload may contain "$&"-style sequences.
  return template
    .replace("/*__FONTS__*/", () => fontFaces)
    .replace("/*__THEME__*/", () => themeToCss(payload.theme))
    .replace("__TITLE__", () => escapeHtml(`${payload.product.name} wrapped`))
    .replace("__DATA__", () => serializeForScript(payload));
}

function themeToCss(theme: DashboardTheme): string {
  const vars: Record<string, string> = {
    "color-scheme": theme.scheme,
    "--bg": theme.background,
    "--surface": theme.surface,
    "--surface-hover": theme.surfaceHover,
    "--border": theme.border,
    "--text": theme.text,
    "--text-2": theme.textSecondary,
    "--muted": theme.textMuted,
    "--accent": theme.accent,
  };
  theme.heatmap.forEach((color, i) => (vars[`--hm-${i}`] = color));
  return Object.entries(vars)
    .map(([key, value]) => `${key}:${value};`)
    .join("");
}

/** JSON that is safe inside <script type="application/json">. */
export function serializeForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
