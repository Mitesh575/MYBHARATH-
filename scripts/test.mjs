import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
const python = resolve(
  root,
  process.platform === "win32"
    ? ".venv/Scripts/python.exe"
    : ".venv/bin/python",
);
const result = spawnSync(python, ["-m", "pytest", "tests", "-q"], {
  cwd: root,
  stdio: "inherit",
});
process.exit(result.status ?? 1);
