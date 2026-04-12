import { describe, expect, test } from "bun:test";
import { generateImage } from "../image/generator";
import { createSampleStats } from "./helpers";

describe("generateImage", () => {
  test("renders PNG buffers for a representative wrapped card", async () => {
    const image = await generateImage(createSampleStats());

    expect(image.fullSize).toBeInstanceOf(Buffer);
    expect(image.displaySize).toBeInstanceOf(Buffer);
    expect(image.fullSize.length).toBeGreaterThan(0);
    expect(image.displaySize.length).toBeGreaterThan(0);
    expect(image.fullSize.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
    expect(image.displaySize.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
  });
});
