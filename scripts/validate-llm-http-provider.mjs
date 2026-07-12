import { spawn, spawnSync } from "node:child_process";
import net from "node:net";

const rootDir = new URL("../", import.meta.url).pathname;
const token = "test-token";

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => {
        if (port) resolve(port);
        else reject(new Error("Could not allocate a local port."));
      });
    });
  });
}

function waitForFixture(child, port) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => {
      reject(new Error(`LLM HTTP fixture did not start on port ${port}. Output: ${output}`));
    }, 5000);

    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      if (output.includes(`http://127.0.0.1:${port}`)) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`LLM HTTP fixture exited before readiness with status ${code}. Output: ${output}`));
    });
  });
}

function run(label, args, env) {
  console.log(`\n== ${label} ==`);
  const result = spawnSync("npm", args, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe",
    env
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`${label} failed with status ${result.status}`);
  }
}

async function stopFixture(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 2000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

const port = await getAvailablePort();
const fixture = spawn("node", ["scripts/llm-http-fixture-server.mjs", `--port=${port}`, `--require-token=${token}`], {
  cwd: rootDir,
  stdio: ["ignore", "pipe", "pipe"],
  env: process.env
});

try {
  await waitForFixture(fixture, port);
  const env = {
    ...process.env,
    LLM_EXTRACT_URL: `http://127.0.0.1:${port}`,
    LLM_EXTRACT_API_KEY: token,
    LLM_EXTRACT_RPM: "600",
    LLM_EXTRACT_MAX_RETRIES: "1"
  };

  run("llm http status", ["run", "llm:status", "--", "--provider=http", "--require-provider=http", "--timeout-ms=5000"], env);
  run(
    "llm http extraction dry-run",
    ["run", "worker:llm", "--", "--provider=http", "--dry-run", "--only-extracted", "--limit=1", "--timeout-ms=5000"],
    env
  );
  run(
    "llm http production gate dry-run",
    ["run", "llm:verify-production", "--", "--provider=http", "--timeout-ms=5000", "--limit=1"],
    env
  );
  const openAiEnv = {
    ...env,
    LLM_EXTRACT_URL: `http://127.0.0.1:${port}/v1/chat/completions`,
    LLM_EXTRACT_MODEL: "fixture/openai-compatible"
  };
  run(
    "openai-compatible http status",
    ["run", "llm:status", "--", "--provider=http", "--require-provider=http", "--timeout-ms=5000"],
    openAiEnv
  );
  run(
    "openai-compatible extraction dry-run",
    ["run", "worker:llm", "--", "--provider=http", "--dry-run", "--only-extracted", "--limit=1", "--timeout-ms=5000"],
    openAiEnv
  );
  console.log(`LLM HTTP provider fixture verified on port ${port}.`);
} finally {
  await stopFixture(fixture);
}
