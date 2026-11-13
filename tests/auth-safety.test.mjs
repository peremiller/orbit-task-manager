import test from "node:test";
import assert from "node:assert/strict";
import { authenticateOrbitUser, normalizeOrbitLoginInput, safeReturnTo } from "../lib/orbit-auth.ts";

test("valid credential fields keep the existing sign-in route and safe deep link", () => {
  assert.deepEqual(normalizeOrbitLoginInput({
    username: "user", password: "sample password", returnTo: "/projects/example?view=board#tasks",
  }), {
    username: "user", password: "sample password", returnTo: "/projects/example?view=board#tasks",
  });
});

test("login validation rejects malformed payloads without throwing", () => {
  for (const value of [null, [], "", 123, {}, { username: null, password: "x" },
    { username: "user", password: null }, { username: " ", password: "x" },
    { username: "user", password: "" }, { username: "user", password: "x".repeat(1025) },
    { username: "u".repeat(257), password: "x" }, { username: "u", password: "⚡".repeat(400) }]) {
    assert.equal(normalizeOrbitLoginInput(value), null);
  }
});

test("oversized inputs cannot reach password hashing from authentication entry", () => {
  assert.equal(authenticateOrbitUser("u".repeat(257), "sample password"), null);
  assert.equal(authenticateOrbitUser("user", "x".repeat(1025)), null);
  assert.equal(authenticateOrbitUser("", "sample password"), null);
});

test("untrusted return paths never navigate outside this application", () => {
  for (const unsafe of ["//evil.example/path", "https://evil.example/", "/\\evil.example",
    "/login", "/api/auth/session", "javascript:alert(1)", ""]) {
    assert.equal(safeReturnTo(unsafe), "/today");
  }
  assert.equal(normalizeOrbitLoginInput({ username: "user", password: "pass", returnTo: "//evil.example" })?.returnTo, "/today");
  assert.equal(normalizeOrbitLoginInput({ username: "user", password: "pass", returnTo: 123 })?.returnTo, "/today");
});
