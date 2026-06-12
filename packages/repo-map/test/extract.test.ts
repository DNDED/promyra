import { describe, it, expect } from "vitest";
import { extractSymbolsFromFile, patternsFor } from "../src/extract.js";

describe("extractSymbolsFromFile — TypeScript", () => {
  it("extracts exported function", () => {
    const src = `export function add(a, b) { return a + b; }`;
    const syms = extractSymbolsFromFile("a.ts", src);
    expect(syms).toHaveLength(1);
    expect(syms[0].name).toBe("add");
    expect(syms[0].kind).toBe("function");
    expect(syms[0].line).toBe(1);
  });

  it("extracts class and method", () => {
    const src = [
      "export class AuthService {",
      "  login(user) { return user; }",
      "  logout() {}",
      "}",
    ].join("\n");
    const syms = extractSymbolsFromFile("auth.ts", src);
    const names = syms.map(s => s.name);
    expect(names).toContain("AuthService");
    // At least one of the methods
    expect(names.some(n => n === "login" || n === "logout")).toBe(true);
  });

  it("extracts interface and type", () => {
    const src = [
      "export interface User { id: string; }",
      "export type Role = 'admin' | 'user';",
    ].join("\n");
    const syms = extractSymbolsFromFile("types.ts", src);
    const names = syms.map(s => s.name);
    expect(names).toContain("User");
    expect(names).toContain("Role");
  });

  it("extracts const arrow function", () => {
    const src = "export const compute = (x) => x * 2;";
    const syms = extractSymbolsFromFile("a.ts", src);
    expect(syms[0]?.name).toBe("compute");
  });

  it("skips commented lines", () => {
    const src = [
      "// export function nope() {}",
      "export function real() {}",
    ].join("\n");
    const syms = extractSymbolsFromFile("a.ts", src);
    expect(syms.map(s => s.name)).toEqual(["real"]);
  });

  it("respects cap", () => {
    const src = Array.from({ length: 20 }, (_, i) => `export function fn${i}() {}`).join("\n");
    const syms = extractSymbolsFromFile("a.ts", src, 5);
    expect(syms.length).toBeLessThanOrEqual(5);
  });
});

describe("extractSymbolsFromFile — Python", () => {
  it("extracts function and class", () => {
    const src = [
      "def helper(x): return x",
      "class Calculator:",
      "    def add(self, a, b): return a + b",
    ].join("\n");
    const syms = extractSymbolsFromFile("calc.py", src);
    const names = syms.map(s => s.name);
    expect(names).toContain("helper");
    expect(names).toContain("Calculator");
  });

  it("extracts async def", () => {
    const src = "async def fetch(url): pass";
    const syms = extractSymbolsFromFile("a.py", src);
    expect(syms.some(s => s.name === "fetch" && s.kind === "function")).toBe(true);
  });
});

describe("extractSymbolsFromFile — Go", () => {
  it("extracts function and type", () => {
    const src = [
      "func (s *Server) Listen() error { return nil }",
      "type Config struct { Port int }",
      "type Router interface { Handle() }",
    ].join("\n");
    const syms = extractSymbolsFromFile("a.go", src);
    const names = syms.map(s => s.name);
    expect(names).toContain("Listen");
    expect(names).toContain("Config");
  });
});

describe("extractSymbolsFromFile — Rust", () => {
  it("extracts fn, struct, trait, enum", () => {
    const src = [
      "pub fn hello() {}",
      "pub struct Point { x: i32 }",
      "pub trait Greet {}",
      "pub enum Color { Red, Green }",
    ].join("\n");
    const syms = extractSymbolsFromFile("a.rs", src);
    const names = syms.map(s => s.name);
    expect(names).toContain("hello");
    expect(names).toContain("Point");
    expect(names).toContain("Greet");
    expect(names).toContain("Color");
  });
});

describe("patternsFor", () => {
  it("returns patterns for known extensions", () => {
    expect(patternsFor("ts")).toBeDefined();
    expect(patternsFor("py")).toBeDefined();
    expect(patternsFor("go")).toBeDefined();
    expect(patternsFor("rs")).toBeDefined();
  });

  it("returns undefined for unknown extensions", () => {
    expect(patternsFor("xyz")).toBeUndefined();
  });
});
