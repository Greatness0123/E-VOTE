const { test } = require("node:test");
const assert = require("node:assert/strict");
const { requireRole } = require("../src/middleware/auth");

function mockRes() {
  const res = {};
  res.statusCode = null;
  res.body = null;
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  return res;
}

test("requireRole allows a matching role through", () => {
  const req = { user: { role: "ADMIN" } };
  const res = mockRes();
  let nextCalled = false;
  requireRole("ADMIN", "ELECTION_OFFICER")(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});

test("requireRole rejects a non-matching role with 403", () => {
  const req = { user: { role: "STUDENT" } };
  const res = mockRes();
  let nextCalled = false;
  requireRole("ADMIN", "ELECTION_OFFICER")(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test("requireRole rejects when req.user is missing", () => {
  const req = {};
  const res = mockRes();
  let nextCalled = false;
  requireRole("ADMIN")(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test("requireRole distinguishes ADMIN-only routes from ADMIN+OFFICER routes", () => {
  const req = { user: { role: "ELECTION_OFFICER" } };
  const res = mockRes();
  let nextCalled = false;
  requireRole("ADMIN")(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});
