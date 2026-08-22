import * as path from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import { isDirectExecution } from "./direct-execution.ts";

describe("isDirectExecution", () => {
  it("自分自身が argv[1] なら true", () => {
    const scriptPath = path.resolve("scripts/lib/direct-execution.ts");

    expect(isDirectExecution(pathToFileURL(scriptPath).href, scriptPath)).toBe(true);
  });

  it("別のスクリプトから import されたときは false", () => {
    const scriptPath = path.resolve("scripts/lib/direct-execution.ts");
    const wrapperPath = path.resolve("scripts/db/query.ts");

    expect(isDirectExecution(pathToFileURL(scriptPath).href, wrapperPath)).toBe(false);
  });

  it("argv[1] が無い（REPL など）なら false", () => {
    const scriptPath = path.resolve("scripts/lib/direct-execution.ts");

    expect(isDirectExecution(pathToFileURL(scriptPath).href, undefined)).toBe(false);
  });

  it("実在しないパスどうしでも resolve の比較へ落ちて判定できる", () => {
    const missing = path.resolve("scripts/lib/does-not-exist.ts");

    expect(isDirectExecution(pathToFileURL(missing).href, missing)).toBe(true);
    expect(isDirectExecution(pathToFileURL(missing).href, `${missing}x`)).toBe(false);
  });
});
