import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";

export const ORBIT_SESSION_COOKIE = "orbit_session";

export type OrbitRole = "owner" | "admin" | "member";

export type OrbitUser = {
  id: string;
  username: string;
  displayName: string;
  role: OrbitRole;
};

type SessionPayload = OrbitUser & {
  expiresAt: number;
};

const DEFAULT_USER: OrbitUser = {
  id: "aj-miller",
  username: "aj.miller",
  displayName: "AJ Miller",
  role: "owner",
};

const PASSWORD_SALT = "orbit-aj-2026-v1";
const PASSWORD_HASH = "ade74ee4ae698477cc7077e0aff407cd6a65e450f731a763e43d799ea484a508f5a4abdbfc9f267e03dd9784eda27cb6707f4f30294de24b71bdd815d00fc476";
const DEVELOPMENT_SESSION_SECRET = "orbit-local-development-session-secret";
const SESSION_LIFETIME_SECONDS = 60 * 60 * 24 * 7;

export function authenticateOrbitUser(username: string, password: string): OrbitUser | null {
  const normalizedUsername = normalizeUsername(username);
  const expectedUsername = normalizeUsername(process.env.ORBIT_ADMIN_USERNAME ?? DEFAULT_USER.username);
  if (!safeTextEqual(normalizedUsername, expectedUsername)) return null;

  const suppliedHash = scryptSync(password, process.env.ORBIT_PASSWORD_SALT ?? PASSWORD_SALT, 64);
  const expectedHash = Buffer.from(process.env.ORBIT_PASSWORD_HASH ?? PASSWORD_HASH, "hex");
  if (suppliedHash.length !== expectedHash.length || !timingSafeEqual(suppliedHash, expectedHash)) return null;

  return {
    id: process.env.ORBIT_ADMIN_USER_ID ?? DEFAULT_USER.id,
    username: expectedUsername,
    displayName: process.env.ORBIT_ADMIN_DISPLAY_NAME ?? DEFAULT_USER.displayName,
    role: privilegedRole(process.env.ORBIT_ADMIN_ROLE, expectedUsername),
  };
}

export function createOrbitSession(user: OrbitUser): string {
  const payload: SessionPayload = {
    ...user,
    expiresAt: Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifyOrbitSession(token: string | undefined): OrbitUser | null {
  if (!token) return null;
  const [encodedPayload, suppliedSignature, extra] = token.split(".");
  if (!encodedPayload || !suppliedSignature || extra) return null;
  if (!safeTextEqual(suppliedSignature, sign(encodedPayload))) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<SessionPayload>;
    if (!payload.id || !payload.username || !payload.displayName || typeof payload.expiresAt !== "number" || payload.expiresAt <= Math.floor(Date.now() / 1000)) return null;
    return {
      id: payload.id,
      username: payload.username,
      displayName: payload.displayName,
      role: normalizeRole(payload.role) ?? privilegedRole(undefined, payload.username),
    };
  } catch {
    return null;
  }
}

export function canEditSelectionManager(user: Pick<OrbitUser, "username" | "role">): boolean {
  return normalizeUsername(user.username) === DEFAULT_USER.username && (user.role === "owner" || user.role === "admin");
}

export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/today";
  try {
    const url = new URL(value, "https://orbit.local");
    if (url.origin !== "https://orbit.local" || url.pathname === "/login" || url.pathname.startsWith("/api/auth")) return "/today";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/today";
  }
}

function sign(value: string): string {
  const sessionSecret = process.env.ORBIT_SESSION_SECRET;
  if (!sessionSecret && process.env.NODE_ENV === "production") {
    throw new Error("ORBIT_SESSION_SECRET is required in production");
  }
  return createHmac("sha256", sessionSecret ?? DEVELOPMENT_SESSION_SECRET).update(value).digest("base64url");
}

function safeTextEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase().replace(/^@/, "");
}

function normalizeRole(role: unknown): OrbitRole | null {
  return role === "owner" || role === "admin" || role === "member" ? role : null;
}

function privilegedRole(role: unknown, username: string): Extract<OrbitRole, "owner" | "admin"> {
  const normalizedRole = normalizeRole(role);
  if (normalizedRole === "owner" || normalizedRole === "admin") return normalizedRole;
  return normalizeUsername(username) === DEFAULT_USER.username ? "owner" : "admin";
}
