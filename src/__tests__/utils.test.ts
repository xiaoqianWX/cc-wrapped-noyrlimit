import { afterEach, describe, expect, test } from "bun:test";
import {
  formatDate,
  formatNumber,
  formatNumberFull,
  formatCost,
  formatCostFull,
  formatShortDate,
} from "../utils/format";
import {
  generateWeeksForYear,
  getIntensityLevel,
  isWrappedAvailable,
} from "../utils/dates";
import { freezeTime } from "./helpers";

const cleanups: Array<() => void | Promise<void>> = [];

function registerCleanup(cleanup: () => void | Promise<void>): void {
  cleanups.push(cleanup);
}

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()?.();
  }
});

describe("date utilities", () => {
  test("clips current-year heatmap generation at today", () => {
    registerCleanup(freezeTime("2025-03-05T12:00:00.000Z"));

    const dates = generateWeeksForYear(2025).flat().filter((value) => value !== "");

    expect(dates[0]).toBe("2025-01-01");
    expect(dates.at(-1)).toBe("2025-03-05");
    expect(dates).not.toContain("2025-03-06");
  });

  test("includes the full final week for past years", () => {
    registerCleanup(freezeTime("2025-03-05T12:00:00.000Z"));

    const dates = generateWeeksForYear(2024).flat().filter((value) => value !== "");

    expect(dates[0]).toBe("2024-01-01");
    expect(dates.at(-1)).toBe("2024-12-31");
  });

  test("maps activity counts into the expected intensity buckets", () => {
    expect(getIntensityLevel(0, 100)).toBe(0);
    expect(getIntensityLevel(10, 100)).toBe(1);
    expect(getIntensityLevel(25, 100)).toBe(2);
    expect(getIntensityLevel(40, 100)).toBe(3);
    expect(getIntensityLevel(60, 100)).toBe(4);
    expect(getIntensityLevel(80, 100)).toBe(5);
    expect(getIntensityLevel(81, 100)).toBe(6);
  });

  test("reports wrapped availability for past, current, and future years", () => {
    registerCleanup(freezeTime("2025-03-05T12:00:00.000Z"));

    expect(isWrappedAvailable(2024)).toEqual({ available: true });
    expect(isWrappedAvailable(2025)).toEqual({ available: true });
    expect(isWrappedAvailable(2026)).toEqual({
      available: false,
      message: "Claude Code Wrapped 2026 isn't available yet. The future hasn't been written!",
    });
  });
});

describe("format utilities", () => {
  test("formats numbers, money, and dates for display", () => {
    const date = new Date("2025-03-05T00:00:00.000Z");

    expect(formatNumber(1_500)).toBe("1.5K");
    expect(formatNumberFull(1_500)).toBe("1,500");
    expect(formatCost(12.345)).toBe("$12.35");
    expect(formatCost(1_500)).toBe("$1.5K");
    expect(formatCostFull(12.3)).toBe("$12.3");
    expect(formatDate(date)).toBe("March 5, 2025");
    expect(formatShortDate(date)).toBe("Mar 5");
  });
});
