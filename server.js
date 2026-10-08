const express = require("express");
const path = require("path");

const app = express();
const port = Number(process.env._FAAS_RUNTIME_PORT || process.env.PORT || 3000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("The listening port must be an integer between 1 and 65535.");
  process.exit(1);
}

app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "byteplus-ai-ecosystem-site" });
});

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`BytePlus AI ecosystem site is running at http://0.0.0.0:${port}`);
});

server.on("error", (error) => {
  console.error(`Unable to start the HTTP server: ${error.message}`);
  process.exit(1);
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; closing the HTTP server.`);
  const timeout = setTimeout(() => {
    console.error("Graceful shutdown timed out.");
    process.exit(1);
  }, 10000);
  timeout.unref();
  server.close((error) => {
    clearTimeout(timeout);
    process.exit(error ? 1 : 0);
  });
  server.closeIdleConnections?.();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
