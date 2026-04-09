import satori from "satori";
import { Resvg, initWasm } from "@resvg/resvg-wasm";
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
import { WrappedTemplate } from "./template";
import type { ClaudeCodeStats } from "../types";
import { loadFonts } from "./fonts";
import { layout } from "./design-tokens";

export interface GeneratedImage {
  /** Full resolution PNG buffer for saving/clipboard */
  fullSize: Buffer;
  /** Scaled PNG buffer for terminal display (80% of full size) */
  displaySize: Buffer;
}

let wasmInitialized = false;

export async function generateImage(stats: ClaudeCodeStats): Promise<GeneratedImage> {
  if (!wasmInitialized) {
    await initWasm(Bun.file(resvgWasm).arrayBuffer());
    wasmInitialized = true;
  }

  const svg = await satori(<WrappedTemplate stats={stats} />, {
    width: layout.canvas.width,
    height: layout.canvas.height,
    fonts: await loadFonts(),
  });

  const [fullSize, displaySize] = [1, 0.75].map((v) => {
    const resvg = new Resvg(svg, {
      fitTo: {
        mode: "zoom",
        value: v,
      },
    });
    return Buffer.from(resvg.render().asPng());
  });

  return { fullSize, displaySize };
}
