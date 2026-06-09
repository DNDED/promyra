import express from "express";

const app = express();

app.get("/api/users", (req, res) => {
  res.json([
    { id: 1, name: "Alice", passwordHash: "$2b$10$abcdefghijklmnopqrstuv" },
    { id: 2, name: "Bob", passwordHash: "$2b$10$zyxwvutsrqponmlkjihgfedcba" },
  ]);
});

app.get("/api/parse-input", (req, res) => {
  const raw = req.query.input ?? "";
  const trimmed = String(raw).trim();
  if (!trimmed) return res.status(400).json({ error: "empty" });
  const parsed = trimmed.split(",").map(s => s.trim());
  res.json({ parsed });
});

app.listen(3000, () => {
  console.log("tiny-express on :3000");
});
