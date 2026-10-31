import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { Problem } from "./catalog";
export interface Env {
  ASSETS?: Fetcher;
  REVIEWED_INVOICE_MODE?: string;
  DB: D1Database;
  UPLOADS: R2Bucket;
  APP_ENV: string;
  PORTAL_ENABLED: string;
  LEGAL_APPROVED: string;
  PUBLIC_SITE_ORIGIN: string;
  ALLOWED_ORIGINS: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_ACCOUNT_ID: string;
  ACCESS_ISSUER: string;
  ACCESS_AUD: string;
  ADMIN_EMAILS: string;
  TURNSTILE_SECRET_KEY?: string;
  RATE_LIMIT_SALT?: string;
  TAX_MODE: string;
  INVOICE_CREATION: string;
  UNAVAILABLE_SKUS?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
}
export type Deps = {
  now: () => number;
  fetch: typeof fetch;
  adminKeys?: JWTVerifyGetKey;
};
export const defaults: Deps = {
  now: () => Math.floor(Date.now() / 1000),
  fetch: (...a) => fetch(...a),
};
export const id = () => crypto.randomUUID();
export const token = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
export async function digest(s: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
}
export function equal(a: string, b: string) {
  let v = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    v |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return v === 0;
}
export function authConfigured(e: Env) {
  return (
    /^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(e.ACCESS_ISSUER) &&
    !!e.ACCESS_AUD &&
    e.ADMIN_EMAILS.split(",").some((x) => x.includes("@"))
  );
}
export function ready(e: Env) {
  const live = e.APP_ENV === "production";
  return (
    ["test", "production"].includes(e.APP_ENV) &&
    e.PORTAL_ENABLED === "true" &&
    e.LEGAL_APPROVED === "true" &&
    authConfigured(e) &&
    new RegExp(`^(sk|rk)_${live ? "live" : "test"}_[A-Za-z0-9]{8,}$`).test(
      e.STRIPE_SECRET_KEY?.trim() || "",
    ) &&
    /^whsec_.{8,}$/.test(e.STRIPE_WEBHOOK_SECRET || "") &&
    /^acct_[A-Za-z0-9]+$/.test(e.STRIPE_ACCOUNT_ID) &&
    !!e.TURNSTILE_SECRET_KEY &&
    (e.RATE_LIMIT_SALT?.length ?? 0) >= 32 &&
    ["automatic", "owner_reviewed_manual"].includes(e.TAX_MODE)
  );
}
export function enabled(e: Env) {
  if (!ready(e)) throw new Problem(503, "portal_not_enabled");
}
export async function bounded(req: Request, max: number) {
  const reader = req.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) throw new Problem(413, "body_too_large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const out = new Uint8Array(size);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}
export async function jsonBody(req: Request) {
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    throw new Problem(415, "json_required");
  try {
    return JSON.parse(new TextDecoder().decode(await bounded(req, 16384)));
  } catch (e) {
    if (e instanceof Problem) throw e;
    throw new Problem(400, "invalid_json");
  }
}
export async function rate(e: Env, key: string, limit: number, now: number) {
  const k = await digest(
    `${e.RATE_LIMIT_SALT}:${key}:${Math.floor(now / 600)}`,
  );
  const r = await e.DB.prepare(
    "INSERT INTO rate_limits(key,hits,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 RETURNING hits",
  )
    .bind(k, now + 1200)
    .first<{ hits: number }>();
  if (!r || r.hits > limit) throw new Problem(429, "rate_limited");
}
const jwks = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export async function admin(req: Request, e: Env, d: Deps = defaults) {
  if (!authConfigured(e)) throw new Problem(503, "admin_not_configured");
  const value = req.headers.get("Cf-Access-Jwt-Assertion");
  if (!value) throw new Problem(401, "admin_sign_in_required");
  try {
    if (d.adminKeys) return await verifyAdminJWT(value, e, d.adminKeys);
    let j = jwks.get(e.ACCESS_ISSUER);
    if (!j) {
      j = createRemoteJWKSet(
        new URL(e.ACCESS_ISSUER + "/cdn-cgi/access/certs"),
      );
      jwks.set(e.ACCESS_ISSUER, j);
    }
    return await verifyAdminJWT(value, e, j);
  } catch {
    throw new Problem(403, "admin_access_denied");
  }
}
export async function signature(
  raw: string,
  header: string,
  secret: string,
  now: number,
) {
  const parts = header.split(",");
  const t = parts.find((x) => x.startsWith("t="))?.slice(2);
  if (!t || !/^\d+$/.test(t) || Math.abs(now - Number(t)) > 300)
    throw new Problem(400, "invalid_signature");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const result = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(t + "." + raw),
  );
  const hex = Array.from(new Uint8Array(result), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
  if (
    !parts
      .filter((x) => x.startsWith("v1="))
      .some((x) => equal(hex, x.slice(3)))
  )
    throw new Problem(400, "invalid_signature");
}

export async function verifyAdminJWT(
  value: string,
  e: Env,
  key: JWTVerifyGetKey,
) {
  const { payload } = await jwtVerify(value, key, {
    issuer: e.ACCESS_ISSUER,
    audience: e.ACCESS_AUD,
    algorithms: ["RS256"],
  });
  if (
    typeof payload.email !== "string" ||
    !e.ADMIN_EMAILS.split(",")
      .map((x) => x.trim().toLowerCase())
      .includes(payload.email.toLowerCase()) ||
    !payload.exp
  )
    throw new Problem(403, "admin_access_denied");
  return "access-admin";
}
