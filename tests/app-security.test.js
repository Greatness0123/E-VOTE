const { test } = require("node:test");
const assert = require("node:assert/strict");
const app = require("../src/app");

test("served frontend enforces self-hosted scripts and contains no inline script", async () => {
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/`);
    const html = await response.text();
    assert.equal(response.status, 200);
    const csp = response.headers.get("content-security-policy");
    assert.match(csp, /script-src 'self'/);
    assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
    assert.doesNotMatch(html, /<script>[^<]/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
