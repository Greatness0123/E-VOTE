const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const publicDir = path.join(__dirname, "..", "public");
const htmlFiles = ["index.html", "pages/admin.html", "pages/forgot-password.html", "pages/reset-password.html", "pages/vote.html"];

test("HTML pages contain no executable inline scripts", () => {
  for (const file of htmlFiles) {
    const html = fs.readFileSync(path.join(publicDir, file), "utf8");
    assert.doesNotMatch(html, /<script(?:\s[^>]*)?>\s*(?!<\/script>)[^<]/i, file);
  }
});

test("application frontend scripts do not inject dynamic HTML", () => {
  for (const file of ["admin.js", "vote.js"]) {
    const source = fs.readFileSync(path.join(publicDir, "js", file), "utf8");
    assert.doesNotMatch(source, /\.innerHTML\s*=/, file);
  }
});
