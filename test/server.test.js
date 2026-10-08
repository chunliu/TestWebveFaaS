const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const net = require("node:net");
const http = require("node:http");
const path = require("node:path");
const os = require("node:os");
const { checkSite } = require("../scripts/check-site");

const root = path.join(__dirname, "..");

async function freePort() {
  const listener = net.createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  return port;
}

async function startServer(t, environment, useScript = false) {
  const env = { ...process.env };
  delete env.PORT;
  delete env._FAAS_RUNTIME_PORT;
  Object.assign(env, environment);
  const child = useScript
    ? spawn("/bin/sh", [path.join(root, "run.sh")], { cwd: os.tmpdir(), env })
    : spawn(process.execPath, [path.join(root, "server.js")], { cwd: root, env });
  const exited = once(child, "exit");
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    await exited;
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const deadline = Date.now() + 10000;
  while (!output.includes("is running at")) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Server exited before listening: ${output}`);
    }
    if (Date.now() > deadline) throw new Error(`Server start timed out: ${output}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.match(output, /http:\/\/0\.0\.0\.0:/);
  return { child, exited };
}

test("PORT serves the health endpoint, home page and static assets", async (t) => {
  const port = await freePort();
  await startServer(t, { PORT: String(port) });
  await checkSite(`http://127.0.0.1:${port}`, { attempts: 1 });
});

test("_FAAS_RUNTIME_PORT takes precedence over PORT and run.sh works from another directory", async (t) => {
  const port = await freePort();
  await startServer(t, { PORT: "invalid", _FAAS_RUNTIME_PORT: String(port) }, true);
  await checkSite(`http://127.0.0.1:${port}`, { attempts: 1 });
});

test("invalid ports fail before serving requests", async () => {
  for (const value of ["not-a-port", "0", "65536", "8000.5"]) {
    const child = spawn(process.execPath, [path.join(root, "server.js")], {
      env: { ...process.env, PORT: "3000", _FAAS_RUNTIME_PORT: value },
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.stdout.resume();
    const [code, signal] = await once(child, "exit");
    assert.equal(code, 1);
    assert.equal(signal, null);
    assert.match(stderr, /between 1 and 65535/);
  }
});

test("SIGINT and SIGTERM shut down the server cleanly", async (t) => {
  for (const signal of ["SIGINT", "SIGTERM"]) {
    const port = await freePort();
    const { child, exited } = await startServer(t, { PORT: String(port) });
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    await response.text();
    child.kill(signal);
    const [code, exitSignal] = await exited;
    assert.equal(code, 0);
    assert.equal(exitSignal, null);
  }
});

test("the website checker rejects an unrelated HTTP 200 health response", async (t) => {
  const server = http.createServer((_request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ status: "ok", service: "wrong-site" }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await assert.rejects(checkSite(`http://127.0.0.1:${server.address().port}`, { attempts: 1 }));
});
