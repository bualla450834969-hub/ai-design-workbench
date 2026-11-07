const { spawn } = require("node:child_process");
const path = require("node:path");

// Browser delivery of the desktop kernel. DESKTOP_MODE keeps project APIs on
// the server store. WEB_LOCAL_MODE would intercept POST /api/projects in the
// browser and answer 410 for anything outside the authorization allowlist.
const env = { ...process.env, DESKTOP_MODE: "true" };
delete env.WEB_MODE;
delete env.WEB_LOCAL_MODE;
delete env.NEXT_PUBLIC_WEB_LOCAL_MODE;
delete env.NEXT_PUBLIC_WEB_MODE;

const hostname = env.HOSTNAME?.trim() || "0.0.0.0";
env.HOSTNAME = hostname;
const port = String(env.PORT || "3000");
const command = process.argv[2] === "dev" ? "dev" : "start";
const nextBin = require.resolve("next/dist/bin/next");
const child = spawn(process.execPath, [nextBin, command, "--hostname", hostname, "--port", port], {
  cwd: path.join(__dirname, ".."),
  env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
