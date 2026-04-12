import { afterEach, describe, expect, test } from "bun:test";
import { detectTerminal, getTerminalName } from "../terminal/display";
import { setEnvVars } from "./helpers";

const cleanups: Array<() => void | Promise<void>> = [];

function registerCleanup(cleanup: () => void | Promise<void>): void {
  cleanups.push(cleanup);
}

afterEach(async () => {
  while (cleanups.length > 0) {
    await cleanups.pop()?.();
  }
});

function setTerminalEnv(overrides: Record<string, string | undefined>): void {
  registerCleanup(
    setEnvVars({
      TERM: undefined,
      TERM_PROGRAM: undefined,
      KITTY_WINDOW_ID: undefined,
      KONSOLE_VERSION: undefined,
      ...overrides,
    })
  );
}

describe("detectTerminal", () => {
  test("detects Ghostty via TERM", () => {
    setTerminalEnv({ TERM: "xterm-ghostty" });

    expect(detectTerminal()).toEqual({
      type: "ghostty",
      supportsKittyProtocol: true,
      supportsITerm2Protocol: false,
    });
    expect(getTerminalName()).toBe("ghostty");
  });

  test("detects Kitty via KITTY_WINDOW_ID", () => {
    setTerminalEnv({ KITTY_WINDOW_ID: "123" });

    expect(detectTerminal()).toEqual({
      type: "kitty",
      supportsKittyProtocol: true,
      supportsITerm2Protocol: false,
    });
  });

  test("detects WezTerm and dual-protocol support", () => {
    setTerminalEnv({ TERM_PROGRAM: "WezTerm" });

    expect(detectTerminal()).toEqual({
      type: "wezterm",
      supportsKittyProtocol: true,
      supportsITerm2Protocol: true,
    });
  });

  test("detects iTerm2, VS Code, and Warp", () => {
    setTerminalEnv({ TERM_PROGRAM: "iTerm.app" });
    expect(detectTerminal()).toEqual({
      type: "iterm",
      supportsKittyProtocol: false,
      supportsITerm2Protocol: true,
    });

    cleanups.pop()?.();
    setTerminalEnv({ TERM_PROGRAM: "vscode" });
    expect(detectTerminal()).toEqual({
      type: "vscode",
      supportsKittyProtocol: false,
      supportsITerm2Protocol: true,
    });

    cleanups.pop()?.();
    setTerminalEnv({ TERM_PROGRAM: "WarpTerminal" });
    expect(detectTerminal()).toEqual({
      type: "warp",
      supportsKittyProtocol: true,
      supportsITerm2Protocol: false,
    });
  });

  test("falls back to a standard terminal when no specific markers are present", () => {
    setTerminalEnv({});

    expect(detectTerminal()).toEqual({
      type: "standard",
      supportsKittyProtocol: false,
      supportsITerm2Protocol: false,
    });
  });
});
