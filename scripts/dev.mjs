import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
if (existsSync(resolve(root, ".env"))) {
  for (const line of readFileSync(resolve(root, ".env"), "utf8").split(
    /\r?\n/,
  )) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]])
      process.env[match[1]] = match[2].trim();
  }
}
const python =
  process.platform === "win32"
    ? resolve(root, ".venv/Scripts/python.exe")
    : resolve(root, ".venv/bin/python");
if (!existsSync(python)) {
  console.error(
    "Python environment is missing. Run the setup instructions in README.md first.",
  );
  process.exit(1);
}
if (!existsSync(resolve(root, "dist/index.html"))) {
  console.error("Frontend build is missing. Run npm run build first.");
  process.exit(1);
}
const port = process.env.PORT || "8000";
const child = spawn(
  python,
  [
    "-m",
    "uvicorn",
    "backend.app:app",
    "--host",
    process.env.HOST || "127.0.0.1",
    "--port",
    port,
  ],
  { cwd: root, stdio: "inherit", env: process.env },
);
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
child.on("error", (e) => {
  console.error(e.message);
  process.exit(1);
});
child.on("exit", (code) => process.exit(code ?? 0));
