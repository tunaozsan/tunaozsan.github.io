import { requireFulfillmentConsent } from "./consent";
import { stripe } from "./payments";
import { sha256 } from "@noble/hashes/sha2.js";
import {
  admin,
  defaults,
  digest,
  token,
  type Deps,
  type Env,
} from "./security";
import { Problem } from "./catalog";
import { LIVE_ACCOUNT_ID } from "./live-catalog";
export type DriveEnv = Env & {
  DRIVE_ENABLED?: string;
  DELIVERY_ENABLED?: string;
  DELIVERY_POLICY_APPROVED?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  DRIVE_TOKEN_KEY?: string;
};
const SCOPE = "https://www.googleapis.com/auth/drive.file";
const API = "https://www.googleapis.com/drive/v3/";
const FIELDS =
  "id,size,sha256Checksum,headRevisionId,mimeType,parents,shared,ownedByMe,trashed";
const encoder = new TextEncoder();
const hex = (b: Uint8Array) =>
  Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export function driveEnvironmentAllowed(e: DriveEnv) {
  return (
    e.APP_ENV === "test" ||
    (e.APP_ENV === "production" &&
      e.LEGAL_APPROVED === "true" &&
      e.STRIPE_ACCOUNT_ID === LIVE_ACCOUNT_ID &&
      e.PUBLIC_SITE_ORIGIN ===
        "https://bluefin-project-portal-api.bluefintuna-llc.workers.dev")
  );
}
export function driveEnabled(e: DriveEnv) {
  return driveEnvironmentAllowed(e) && e.DRIVE_ENABLED === "true";
}
export function driveConfig(e: DriveEnv) {
  if (
    !driveEnabled(e) ||
    !e.GOOGLE_CLIENT_ID ||
    !e.GOOGLE_CLIENT_SECRET ||
    !e.DRIVE_TOKEN_KEY
  )
    throw new Problem(503, "drive_not_configured");
}
export async function seal(e: DriveEnv, value: string, context: string) {
  const raw = unb64(e.DRIVE_TOKEN_KEY || "");
  if (raw.length !== 32) throw new Problem(503, "drive_key_invalid");
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
  ]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(context) },
    key,
    encoder.encode(value),
  );
  return "v1." + b64(iv) + "." + b64(new Uint8Array(encrypted));
}
export async function unseal(e: DriveEnv, value: string, context: string) {
  try {
    const [v, iv, data] = value.split(".");
    if (v !== "v1") throw Error();
    const key = await crypto.subtle.importKey(
      "raw",
      unb64(e.DRIVE_TOKEN_KEY || ""),
      "AES-GCM",
      false,
      ["decrypt"],
    );
    return new TextDecoder().decode(
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: unb64(iv),
          additionalData: encoder.encode(context),
        },
        key,
        unb64(data),
      ),
    );
  } catch {
    throw new Problem(503, "drive_reauthorization_required");
  }
}
export async function record(
  e: DriveEnv,
  order: string | null,
  actor: string,
  action: string,
  d = defaults,
) {
  await e.DB.prepare(
    "INSERT INTO audit_events(order_id,actor,action,created_at) VALUES (?,?,?,?)",
  )
    .bind(order, actor, action, d.now())
    .run();
}
export function cookie(req: Request, name: string) {
  return (
    req.headers
      .get("Cookie")
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith(name + "="))
      ?.slice(name.length + 1) || ""
  );
}
export function sameOrigin(req: Request, e: DriveEnv) {
  if (req.headers.get("Origin") !== e.PUBLIC_SITE_ORIGIN)
    throw new Problem(403, "origin_denied");
}
const oauthCookie = (value: string, maxAge: number) =>
  `__Host-bt-drive-state=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
export async function oauth(req: Request, e: DriveEnv, d: Deps = defaults) {
  const actor = await admin(req, e, d);
  driveConfig(e);
  const path = new URL(req.url).pathname;
  const redirect = e.PUBLIC_SITE_ORIGIN + "/api/v1/admin/drive/oauth/callback";
  if (path.endsWith("/start") && req.method === "POST") {
    sameOrigin(req, e);
    const state = token(),
      verifier = token();
    await e.DB.prepare(
      "INSERT INTO drive_oauth_states(state_hash,verifier_cipher,actor,expires_at) VALUES (?,?,?,?)",
    )
      .bind(
        await digest(state),
        await seal(e, verifier, "oauth-pkce"),
        actor,
        d.now() + 600,
      )
      .run();
    const hash = await crypto.subtle.digest(
      "SHA-256",
      encoder.encode(verifier),
    );
    const challenge = b64(new Uint8Array(hash))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: e.GOOGLE_CLIENT_ID!,
      redirect_uri: redirect,
      response_type: "code",
      scope: SCOPE,
      access_type: "offline",
      prompt: "consent",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      include_granted_scopes: "false",
    }).toString();
    return Response.json(
      { authorizationUrl: url.href },
      { headers: { "Set-Cookie": oauthCookie(state, 600) } },
    );
  }
  if (path.endsWith("/callback") && req.method === "GET") {
    const url = new URL(req.url),
      state = url.searchParams.get("state") || "";
    if (
      !/^[a-f0-9]{64}$/.test(state) ||
      cookie(req, "__Host-bt-drive-state") !== state
    )
      throw new Problem(403, "oauth_state_invalid");
    const row = await e.DB.prepare(
      "DELETE FROM drive_oauth_states WHERE state_hash=? AND actor=? AND expires_at>? RETURNING verifier_cipher",
    )
      .bind(await digest(state), actor, d.now())
      .first<any>();
    if (!row) throw new Problem(403, "oauth_state_expired");
    const code = url.searchParams.get("code");
    if (!code || url.searchParams.has("error"))
      throw new Problem(400, "oauth_consent_not_granted");
    const r = await d.fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: e.GOOGLE_CLIENT_ID!,
        client_secret: e.GOOGLE_CLIENT_SECRET!,
        code,
        redirect_uri: redirect,
        grant_type: "authorization_code",
        code_verifier: await unseal(e, row.verifier_cipher, "oauth-pkce"),
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = (await r.json()) as any;
    if (
      !r.ok ||
      !data.refresh_token ||
      !String(data.scope || "")
        .split(" ")
        .includes(SCOPE)
    )
      throw new Problem(502, "oauth_authorization_failed");
    if (
      String(data.scope)
        .split(" ")
        .some((x) => x !== SCOPE)
    )
      throw new Problem(403, "oauth_scope_excess");
    await e.DB.prepare(
      "INSERT INTO drive_credentials(id,refresh_cipher,status,updated_at) VALUES (1,?,'CONNECTED',?) ON CONFLICT(id) DO UPDATE SET refresh_cipher=excluded.refresh_cipher,status='CONNECTED',updated_at=excluded.updated_at",
    )
      .bind(await seal(e, data.refresh_token, "drive-refresh"), d.now())
      .run();
    await record(e, null, actor, "drive_connected", d);
    return new Response(null, {
      status: 303,
      headers: {
        Location: e.PUBLIC_SITE_ORIGIN + "/admin/?drive=connected",
        "Set-Cookie": oauthCookie("", 0),
      },
    });
  }
  if (path.endsWith("/revoke") && req.method === "POST") {
    sameOrigin(req, e);
    const row = await e.DB.prepare(
      "SELECT refresh_cipher FROM drive_credentials WHERE id=1",
    ).first<any>();
    if (row) {
      const refresh = await unseal(e, row.refresh_cipher, "drive-refresh");
      const r = await d.fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        body: new URLSearchParams({ token: refresh }),
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok && r.status !== 400)
        throw new Problem(502, "drive_revoke_failed");
      await e.DB.prepare("DELETE FROM drive_credentials WHERE id=1").run();
    }
    await record(e, null, actor, "drive_revoked", d);
    return Response.json({ revoked: true });
  }
  throw new Problem(405, "method_not_allowed");
}
export async function access(e: DriveEnv, d: Deps = defaults) {
  driveConfig(e);
  const row = await e.DB.prepare(
    "SELECT refresh_cipher,status FROM drive_credentials WHERE id=1",
  ).first<any>();
  if (!row || row.status !== "CONNECTED")
    throw new Problem(503, "drive_reauthorization_required");
  const r = await d.fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: e.GOOGLE_CLIENT_ID!,
      client_secret: e.GOOGLE_CLIENT_SECRET!,
      refresh_token: await unseal(e, row.refresh_cipher, "drive-refresh"),
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(15000),
  });
  const data = (await r.json()) as any;
  if (!r.ok) {
    if (data.error === "invalid_grant")
      await e.DB.prepare(
        "UPDATE drive_credentials SET status='REAUTH_REQUIRED',updated_at=? WHERE id=1",
      )
        .bind(d.now())
        .run();
    throw new Problem(
      503,
      data.error === "invalid_grant"
        ? "drive_reauthorization_required"
        : "drive_temporarily_unavailable",
    );
  }
  if (typeof data.access_token !== "string")
    throw new Problem(502, "drive_token_unavailable");
  return data.access_token as string;
}
export async function google(
  t: string,
  path: string,
  d: Deps = defaults,
  init: RequestInit = {},
) {
  const r = await d.fetch(API + path, {
    ...init,
    headers: {
      ...Object.fromEntries(new Headers(init.headers)),
      Authorization: "Bearer " + t,
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok)
    throw new Problem(
      r.status === 429 || r.status === 403 ? 503 : 502,
      r.status === 429 || r.status === 403
        ? "drive_quota_or_permission"
        : "drive_request_failed",
    );
  return r;
}
export async function metadata(t: string, id: string, d: Deps = defaults) {
  const r = await google(
    t,
    "files/" + encodeURIComponent(id) + "?fields=" + FIELDS,
    d,
  );
  const m = (await r.json()) as any;
  if (m.trashed || m.shared || m.ownedByMe !== true)
    throw new Problem(409, "drive_file_not_private");
  return m;
}
async function reservedId(e: DriveEnv, t: string, key: string, d: Deps) {
  let row = await e.DB.prepare(
    "SELECT drive_id,ready FROM drive_nodes WHERE node_key=?",
  )
    .bind(key)
    .first<any>();
  if (row) return row;
  const ids = (await (
    await google(t, "files/generateIds?count=1&space=drive&type=files", d)
  ).json()) as any;
  await e.DB.prepare(
    "INSERT OR IGNORE INTO drive_nodes(node_key,drive_id) VALUES (?,?)",
  )
    .bind(key, ids.ids[0])
    .run();
  return await e.DB.prepare(
    "SELECT drive_id,ready FROM drive_nodes WHERE node_key=?",
  )
    .bind(key)
    .first<any>();
}
export async function node(
  e: DriveEnv,
  t: string,
  key: string,
  name: string,
  parent: string | null,
  mime: string,
  d: Deps = defaults,
) {
  const row = await reservedId(e, t, key, d);
  if (!row.ready) {
    const r = await d.fetch(API + "files?fields=id", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + t,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: row.drive_id,
        name,
        mimeType: mime,
        ...(parent ? { parents: [parent] } : {}),
        appProperties: { bluefinKey: key },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok && r.status !== 409) throw new Problem(503, "drive_create_retry");
    await metadata(t, row.drive_id, d);
    await e.DB.prepare("UPDATE drive_nodes SET ready=1 WHERE node_key=?")
      .bind(key)
      .run();
  }
  await metadata(t, row.drive_id, d);
  if (parent) await metadata(t, parent, d);
  return row.drive_id as string;
}
export async function project(
  e: DriveEnv,
  t: string,
  order: string,
  d: Deps = defaults,
) {
  const o = await e.DB.prepare(
    "SELECT id,created_at,paid_at FROM orders WHERE id=?",
  )
    .bind(order)
    .first<any>();
  if (!o?.paid_at) throw new Problem(403, "verified_payment_required");
  const existing = await e.DB.prepare(
    "SELECT * FROM drive_projects WHERE order_id=?",
  )
    .bind(order)
    .first<any>();
  if (existing?.purged_at || existing?.hold_reason)
    throw new Problem(409, "project_on_hold");
  if (existing?.finals_id) {
    for (const id of [
      existing.folder_id,
      existing.uploads_id,
      existing.finals_id,
    ])
      await metadata(t, id, d);
    return existing;
  }
  const folderMime = "application/vnd.google-apps.folder";
  const root = await node(
    e,
    t,
    e.APP_ENV === "production" ? "production-root" : "staging-root",
    e.APP_ENV === "production"
      ? "Bluefin Tuna Client Projects"
      : "Bluefin Tuna Staging Client Projects",
    null,
    folderMime,
    d,
  );
  await metadata(t, root, d);
  const year = String(new Date(o.created_at * 1000).getUTCFullYear());
  const yr = await node(e, t, "year:" + year, year, root, folderMime, d);
  const main = await node(
    e,
    t,
    "order:" + order,
    "BT-" + year + "-" + order,
    yr,
    folderMime,
    d,
  );
  const ids = [];
  for (const n of [
    "01_Client_Uploads",
    "02_Working_Files",
    "03_Reports",
    "04_Final_Deliverables",
  ])
    ids.push(await node(e, t, order + ":" + n, n, main, folderMime, d));
  await e.DB.prepare(
    "INSERT INTO drive_projects(order_id,folder_id,uploads_id,working_id,reports_id,finals_id) VALUES (?,?,?,?,?,?) ON CONFLICT(order_id) DO UPDATE SET folder_id=excluded.folder_id,uploads_id=excluded.uploads_id,working_id=excluded.working_id,reports_id=excluded.reports_id,finals_id=excluded.finals_id",
  )
    .bind(order, main, ...ids)
    .run();
  return await e.DB.prepare("SELECT * FROM drive_projects WHERE order_id=?")
    .bind(order)
    .first<any>();
}
export async function putStream(
  t: string,
  id: string,
  body: ReadableStream<Uint8Array>,
  size: number,
  mime: string,
  d: Deps = defaults,
  deadline = Number.MAX_SAFE_INTEGER,
) {
  const start = await d.fetch(
    "https://www.googleapis.com/upload/drive/v3/files/" +
      encodeURIComponent(id) +
      "?uploadType=resumable",
    {
      method: "PATCH",
      headers: {
        Authorization: "Bearer " + t,
        "Content-Type": "application/json",
        "X-Upload-Content-Type": mime,
        "X-Upload-Content-Length": String(size),
      },
      body: "{}",
      signal: AbortSignal.timeout(15000),
    },
  );
  const location = start.headers.get("Location");
  if (!start.ok || !location)
    throw new Problem(503, "drive_upload_start_failed");
  const u = new URL(location);
  if (
    u.protocol !== "https:" ||
    u.hostname !== "www.googleapis.com" ||
    !u.pathname.startsWith("/upload/drive/")
  )
    throw new Problem(502, "drive_upload_target_invalid");
  const hash = sha256.create();
  let bytes = 0;
  const stream = body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, c) {
        if (d.now() >= deadline) throw new Problem(410, "source_expired");
        bytes += chunk.length;
        if (bytes > size) throw new Problem(413, "size_mismatch");
        hash.update(chunk);
        c.enqueue(chunk);
      },
      flush() {
        if (bytes !== size) throw new Problem(400, "size_mismatch");
      },
    }),
  );
  const fixed =
    typeof FixedLengthStream !== "undefined"
      ? new FixedLengthStream(size)
      : null;
  const controller = new AbortController();
  const signal = AbortSignal.any([
    controller.signal,
    AbortSignal.timeout(
      Math.min(120000, Math.max(1, (deadline - d.now()) * 1000)),
    ),
  ]);
  const pump = fixed
    ? stream.pipeTo(fixed.writable, { signal }).catch((error) => {
        controller.abort();
        throw error;
      })
    : Promise.resolve();
  const send = d
    .fetch(location, {
      method: "PUT",
      headers: {
        Authorization: "Bearer " + t,
        "Content-Length": String(size),
        "Content-Type": mime,
      },
      body: fixed ? fixed.readable : stream,
      signal,
    })
    .catch((error) => {
      controller.abort();
      throw error;
    });
  const [r] = await Promise.all([send, pump]);
  if (!r.ok) throw new Problem(503, "drive_upload_retry");
  const digestHex = hex(hash.digest());
  const m = await metadata(t, id, d);
  if (Number(m.size) !== size || m.sha256Checksum !== digestHex)
    throw new Problem(502, "drive_integrity_unverified");
  return digestHex;
}
export async function enqueue(e: DriveEnv, d: Deps = defaults) {
  if (!driveEnabled(e)) return;
  await e.DB.prepare(
    "INSERT OR IGNORE INTO drive_jobs(id,order_id,file_id,next_at) SELECT lower(hex(randomblob(16))),o.id,f.id,? FROM order_files f JOIN orders o ON o.id=f.order_id WHERE EXISTS (SELECT 1 FROM orders payer JOIN agreement_acceptances a ON a.order_id=payer.id WHERE payer.id=COALESCE(o.parent_id,o.id) AND a.stripe_terms_status='ACCEPTED' AND a.stripe_session_id=payer.stripe_session_id AND a.quote_sha256=payer.quote_hash) AND o.paid_at IS NOT NULL AND o.status='PAID' AND f.state='READY' AND f.expires_at>?",
  )
    .bind(d.now(), d.now())
    .run();
}
export async function transfer(e: DriveEnv, d: Deps = defaults) {
  if (!driveEnabled(e)) return;
  await enqueue(e, d);
  await e.DB.prepare(
    "UPDATE drive_jobs SET state='FAILED',error_code='source_expired',lease_until=NULL WHERE state!='VERIFIED' AND file_id IN (SELECT id FROM order_files WHERE expires_at<=?)",
  )
    .bind(d.now())
    .run();
  const jobs = await e.DB.prepare(
    "SELECT j.*,f.r2_key,f.name,f.bytes,f.expires_at FROM drive_jobs j JOIN order_files f ON f.id=j.file_id JOIN orders o ON o.id=j.order_id WHERE j.state IN ('PENDING','RETRY','RUNNING') AND j.next_at<=? AND COALESCE(j.lease_until,0)<=? AND f.state='READY' AND f.expires_at>? AND o.paid_at IS NOT NULL AND o.status='PAID' ORDER BY f.expires_at LIMIT 4",
  )
    .bind(d.now(), d.now(), d.now())
    .all<any>();
  for (const job of jobs.results) {
    const lease = token();
    const claim = await e.DB.prepare(
      "UPDATE drive_jobs SET state='RUNNING',lease_until=?,lease_token=?,attempts=attempts+1 WHERE id=? AND state IN ('PENDING','RETRY','RUNNING') AND next_at<=? AND COALESCE(lease_until,0)<=?",
    )
      .bind(d.now() + 600, lease, job.id, d.now(), d.now())
      .run();
    if (!claim.meta.changes) continue;
    try {
      await verifiedTransferPayment(e, job.order_id, d);
      const t = await access(e, d),
        p = await project(e, t, job.order_id, d);
      if (d.now() >= job.expires_at) throw new Problem(410, "source_expired");
      const obj = await e.UPLOADS.get(job.r2_key);
      if (!obj || obj.size !== job.bytes)
        throw new Problem(410, "source_unavailable");
      const id = await node(
        e,
        t,
        "input:" + job.file_id,
        job.name,
        p.uploads_id,
        "application/octet-stream",
        d,
      );
      const sha = await putStream(
        t,
        id,
        obj.body,
        job.bytes,
        "application/octet-stream",
        d,
        job.expires_at,
      );
      await e.DB.prepare(
        "UPDATE drive_jobs SET state='VERIFIED',sha256=?,verified_at=?,lease_until=NULL,error_code=NULL WHERE id=? AND lease_token=?",
      )
        .bind(sha, d.now(), job.id, lease)
        .run();
      await record(
        e,
        job.order_id,
        "system",
        "drive_input_verified:" + job.file_id,
        d,
      );
    } catch (err) {
      const code = err instanceof Problem ? err.code : "drive_transfer_retry";
      await record(
        e,
        job.order_id,
        "system",
        "drive_transfer_alert:" + job.file_id + ":" + code,
        d,
      );
      await e.DB.prepare(
        "UPDATE drive_jobs SET state=?,error_code=?,next_at=?,lease_until=NULL WHERE id=? AND lease_token=?",
      )
        .bind(
          d.now() >= job.expires_at ? "FAILED" : "RETRY",
          code,
          d.now() + Math.min(3600, 60 * 2 ** Math.min(job.attempts, 6)),
          job.id,
          lease,
        )
        .run();
    }
  }
  await e.DB.prepare("DELETE FROM drive_oauth_states WHERE expires_at<=?")
    .bind(d.now())
    .run();
}

// Re-uploads inherit a verified payment, but only after their documents are locked PAID.
// Resolve just one parent, recheck the actual Sandbox session and reject refunds/disputes.
export async function verifiedTransferPayment(
  e: DriveEnv,
  order: string,
  d: Deps = defaults,
) {
  const o = await e.DB.prepare(
    "SELECT id,status,paid_at,parent_id,stripe_session_id,paid_total FROM orders WHERE id=?",
  )
    .bind(order)
    .first<any>();
  if (!o?.paid_at || o.status !== "PAID")
    throw new Problem(403, "verified_payment_required");
  const payer = o.parent_id
    ? await e.DB.prepare(
        "SELECT id,paid_at,stripe_session_id,paid_total FROM orders WHERE id=?",
      )
        .bind(o.parent_id)
        .first<any>()
    : o;
  if (
    !payer?.paid_at ||
    !payer.stripe_session_id ||
    payer.paid_total !== o.paid_total ||
    !new RegExp(
      `^(sk|rk)_${e.APP_ENV === "production" ? "live" : "test"}_[A-Za-z0-9]+$`,
    ).test(e.STRIPE_SECRET_KEY?.trim() || "")
  )
    throw new Problem(403, "verified_payment_required");
  await requireFulfillmentConsent(e, order);
  const account = await stripe(e, d, "account");
  if (account.id !== e.STRIPE_ACCOUNT_ID)
    throw new Problem(503, "merchant_not_verified");
  const session = await stripe(
    e,
    d,
    "checkout/sessions/" + encodeURIComponent(payer.stripe_session_id),
  );
  if (
    session.livemode !== (e.APP_ENV === "production") ||
    session.payment_status !== "paid" ||
    session.status !== "complete" ||
    session.metadata?.order_id !== payer.id ||
    session.amount_total !== payer.paid_total ||
    session.currency !== "usd"
  )
    throw new Problem(403, "verified_payment_required");
  if (typeof session.payment_intent !== "string")
    throw new Problem(403, "verified_payment_required");
  const intent = await stripe(
    e,
    d,
    "payment_intents/" + encodeURIComponent(session.payment_intent),
  );
  const charge =
    typeof intent.latest_charge === "string"
      ? await stripe(
          e,
          d,
          "charges/" + encodeURIComponent(intent.latest_charge),
        )
      : null;
  if (
    !charge ||
    charge.livemode !== (e.APP_ENV === "production") ||
    charge.id !== intent.latest_charge ||
    charge.payment_intent !== session.payment_intent ||
    charge.refunded ||
    charge.disputed ||
    charge.amount_refunded > 0
  )
    throw new Problem(409, "payment_on_hold");
}
