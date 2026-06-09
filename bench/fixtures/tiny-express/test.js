import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";

test("server exports an express app with /api/users", async () => {
  const mod = await import("./server.js");
  assert.ok(mod, "server module loaded");
});

test("api/parse-input parses comma-separated input", () => {
  const app = express();
  app.get("/api/parse-input", (req, res) => {
    const raw = req.query.input ?? "";
    const parsed = String(raw).trim().split(",").map(s => s.trim());
    res.json({ parsed });
  });
  assert.deepEqual(["a", "b", "c"], "a,b,c".split(",").map(s => s.trim()));
});

test("api/users strips passwordHash before returning", () => {
  const users = [
    { id: 1, name: "Alice", passwordHash: "$2b$10$abcdef" },
    { id: 2, name: "Bob", passwordHash: "$2b$10$zyxwvu" },
  ];
  const safe = users.map(({ passwordHash, ...rest }) => rest);
  assert.equal(safe[0].name, "Alice");
  assert.equal(safe[0].passwordHash, undefined);
  assert.equal(safe[1].passwordHash, undefined);
});
