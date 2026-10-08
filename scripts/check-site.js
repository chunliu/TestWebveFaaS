const assert = require("node:assert/strict");

async function checkSite(siteUrl, { attempts = 5, delayMs = 3000 } = {}) {
  const base = new URL(siteUrl);
  assert.ok(["http:", "https:"].includes(base.protocol), "Use an HTTP or HTTPS URL.");
  assert.ok(!base.username && !base.password, "Do not put credentials in the URL.");
  assert.equal(base.pathname, "/", "Use the website's root URL without a path prefix.");
  assert.ok(!base.search && !base.hash, "Use a URL without a query or fragment.");

  async function get(path) {
    const response = await fetch(new URL(path, base), {
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });
    assert.equal(response.status, 200, `${path}: expected HTTP 200`);
    return response;
  }

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await get("/health");
      assert.match(response.headers.get("content-type") || "", /application\/json/i);
      assert.deepEqual(await response.json(), {
        status: "ok",
        service: "byteplus-ai-ecosystem-site",
      });
      break;
    } catch (error) {
      if (attempt === attempts) throw error;
      console.log(`Health check not ready; retry ${attempt}/${attempts}.`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  for (const [path, contentType, expectedContent] of [
    ["/", /text\/html/i, /<title>BytePlus AI Ecosystem<\/title>/],
    ["/styles.css", /text\/css/i, /\.site-header/],
    ["/app.js", /(?:application|text)\/javascript/i, /navToggle/],
  ]) {
    const response = await get(path);
    assert.match(response.headers.get("content-type") || "", contentType, `${path}: content type`);
    assert.match(await response.text(), expectedContent, `${path}: unexpected content`);
  }
  console.log("Website checks passed: /health, /, /styles.css, /app.js.");
}

if (require.main === module) {
  if (!process.argv[2]) {
    console.error("Usage: npm run check-site -- https://YOUR_GATEWAY_DOMAIN");
    process.exitCode = 1;
  } else {
    checkSite(process.argv[2]).catch((error) => {
      console.error(`Website check failed: ${error.message}`);
      process.exitCode = 1;
    });
  }
}

module.exports = { checkSite };
