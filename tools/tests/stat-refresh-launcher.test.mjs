import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

test(
  "Windows launcher accepts the installed NodeBin argument and preserves explicit state/reference paths",
  { skip: process.platform !== "win32" },
  () => {
    const directory = mkdtempSync(path.join(tmpdir(), "gshl-launcher-"));
    try {
      const executable = path.join(directory, "node.cmd");
      const captured = path.join(directory, "args.txt");
      const state = path.join(directory, "state");
      const reference = path.join(directory, "reference.json");
      mkdirSync(state);
      writeFileSync(reference, "{}");
      writeFileSync(
        executable,
        '@echo off\r\necho %* > "%GSHL_LAUNCHER_TEST_ARGS%"\r\nexit /b 0\r\n',
      );
      const launcher = fileURLToPath(
        new URL("../../scripts/windows/run-stat-refresh.ps1", import.meta.url),
      );
      for (const preview of [true, false]) {
        const result = spawnSync(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            launcher,
            "-Deployment",
            "test-deployment",
            "-LeagueId",
            "1",
            "-SeasonId",
            "test-season",
            "-StartDate",
            "2026-09-29",
            "-EndDate",
            "2027-04-10",
            "-NhlEndDate",
            "2027-04-19",
            "-PythonBin",
            "python",
            "-NodeBin",
            executable,
            "-StateDir",
            state,
            "-ReferenceConfig",
            reference,
            ...(preview ? ["-Preview"] : []),
          ],
          {
            encoding: "utf8",
            env: { ...process.env, GSHL_LAUNCHER_TEST_ARGS: captured },
            windowsHide: true,
          },
        );
        assert.equal(result.status, 0, result.stderr);
        const args = readFileSync(captured, "utf8");
        assert.ok(args.includes(state));
        assert.ok(args.includes("--state-dir"));
        assert.equal(args.includes("--apply"), !preview, args);
      }
    } finally {
      // Only the unique temporary fixture directory created above is removed.
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
