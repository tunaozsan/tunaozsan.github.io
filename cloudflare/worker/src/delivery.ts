import { invoiceNumber } from "./invoice";
import { verifyWorkingRoot } from "./drive";
import { checkRefund, reconcileRefunds } from "./refunds";
import { requireFulfillmentConsent } from "./consent";
import { stripe } from "./payments";
import { Problem } from "./catalog";
import {
  admin,
  defaults,
  digest,
  equal,
  jsonBody,
  rate,
  token,
  type Deps,
} from "./security";
import {
  access,
  cookie,
  driveEnabled,
  driveEnvironmentAllowed,
  google,
  metadata,
  node,
  oauth,
  project,
  putStream,
  record,
  sameOrigin,
  transfer,
  type DriveEnv,
} from "./drive";
const COOKIE = "__Host-bt-delivery";
const DAY = 86400;
const MAX = 20 * 1024 * 1024;
const idPattern = /^[a-f0-9-]{36}$/;
const sessionCookie = (value: string, seconds: number) =>
  `${COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${seconds}`;
const fail = (code: string, status = 400): never => {
  throw new Problem(status, code);
};
const enabled = (e: DriveEnv) => {
  if (e.DELIVERY_ENABLED !== "true" || !driveEnabled(e))
    fail("delivery_not_enabled", 503);
};
const asBody = async (req: Request) => {
  const b = await jsonBody(req);
  if (!b || typeof b !== "object" || Array.isArray(b)) fail("invalid_request");
  return b as any;
};
async function snapshot(e: DriveEnv, order: string, d: Deps) {
  const o = await e.DB.prepare(
    "SELECT id,sku,status,paid_at,paid_total,stripe_invoice_id FROM orders WHERE id=?",
  )
    .bind(order)
    .first<any>();
  if (!o?.paid_at) fail("verified_payment_required", 403);
  const invoice = await e.DB.prepare(
    "SELECT sequence,issued_at FROM order_invoices WHERE order_id=?",
  )
    .bind(order)
    .first();
  o.portal_invoice_number = invoice ? invoiceNumber(invoice, e.APP_ENV) : null;
  const p = await e.DB.prepare("SELECT * FROM drive_projects WHERE order_id=?")
    .bind(order)
    .first<any>();
  const delivery = await e.DB.prepare(
    "SELECT * FROM deliveries WHERE order_id=?",
  )
    .bind(order)
    .first<any>();
  const files = await e.DB.prepare(
    "SELECT id,name,mime,bytes,sha256,state,scan_reference,approved_at FROM delivery_files WHERE order_id=? ORDER BY created_at",
  )
    .bind(order)
    .all();
  const jobs = await e.DB.prepare(
    "SELECT j.id,j.file_id,j.state,j.attempts,j.error_code,j.sha256,j.verified_at,j.next_at,f.name,f.bytes,f.expires_at FROM drive_jobs j JOIN order_files f ON f.id=j.file_id WHERE j.order_id=?",
  )
    .bind(order)
    .all<any>();
  return {
    order: o,
    workspace:
      p?.folder_id && !p.purged_at
        ? "https://drive.google.com/drive/folders/" + p.folder_id
        : null,
    hold:
      p?.hold_reason ||
      ((await e.DB.prepare(
        "SELECT h.order_id FROM orders o JOIN payment_refund_holds h ON h.order_id=COALESCE(o.parent_id,o.id) WHERE o.id=?",
      )
        .bind(order)
        .first())
        ? "refund"
        : null),
    retentionAt: p?.retention_at || null,
    archivedAt: p?.purged_at || null,
    downloads: await e.DB.prepare(
      "SELECT COUNT(*) count,MAX(created_at) lastStartedAt FROM audit_events WHERE order_id=? AND action LIKE 'delivery_download_started:%'",
    )
      .bind(order)
      .first(),
    delivery,
    files: files.results,
    transfers: jobs.results.map((j) => ({
      ...j,
      alert: j.error_code
        ? "TRANSFER NEEDS ATTENTION: " + j.error_code
        : j.state === "VERIFIED"
          ? null
          : j.expires_at <= d.now()
            ? "SOURCE EXPIRED — verified free re-upload required"
            : j.expires_at - d.now() <= 1800
              ? "URGENT — rescue before R2 expiry"
              : j.expires_at - d.now() <= 7200
                ? "TRANSFER AT RISK — two hours remain"
                : null,
    })),
  };
}
async function authorized(req: Request, e: DriveEnv, d: Deps) {
  enabled(e);
  const raw = cookie(req, COOKIE);
  if (!/^[a-f0-9]{64}$/.test(raw)) fail("delivery_sign_in_required", 401);
  const row = await e.DB.prepare(
    "SELECT s.order_id,s.version,s.expires_at,o.sku,o.paid_at,v.status,v.version AS current_version,v.published_at,v.expires_at AS delivery_expires_at,p.hold_reason,p.purged_at FROM delivery_sessions s JOIN deliveries v ON v.order_id=s.order_id JOIN orders o ON o.id=s.order_id LEFT JOIN drive_projects p ON p.order_id=s.order_id WHERE s.token_hash=?",
  )
    .bind(await digest(raw))
    .first<any>();
  if (!row || row.expires_at <= d.now()) fail("delivery_session_expired", 401);
  if (
    !row.paid_at ||
    row.hold_reason ||
    row.purged_at ||
    row.status !== "PUBLISHED" ||
    row.version !== row.current_version
  )
    fail("delivery_revoked", 403);
  if (row.delivery_expires_at <= d.now()) fail("delivery_expired", 410);
  await requireFulfillmentConsent(e, row.order_id);
  await checkRefund(e, d, row.order_id);
  return row;
}
async function invite(
  e: DriveEnv,
  order: string,
  version: number,
  expires: number,
  withPasscode: boolean,
  d: Deps,
) {
  const raw = token(),
    passcode = withPasscode ? token().slice(0, 32) : null;
  await e.DB.prepare(
    "INSERT INTO delivery_invites(token_hash,order_id,version,passcode_hash,expires_at) VALUES (?,?,?,?,?)",
  )
    .bind(
      await digest(raw),
      order,
      version,
      passcode ? await digest(raw + ":" + passcode) : null,
      Math.min(expires, d.now() + DAY),
    )
    .run();
  return {
    url: e.PUBLIC_SITE_ORIGIN + "/project-portal/delivery/#invite=" + raw,
    passcode,
    inviteExpiresAt: Math.min(expires, d.now() + DAY),
    deliveryExpiresAt: expires,
    message:
      "Send this link only to the verified purchasing email. Send the optional passcode using a separate channel. The invitation can be activated once.",
  };
}
export async function deliveryRoute(
  req: Request,
  e: DriveEnv,
  d: Deps = defaults,
): Promise<Response> {
  let response: Response;
  try {
    if (!driveEnvironmentAllowed(e))
      fail("delivery_environment_not_allowed", 503);
    const url = new URL(req.url),
      path = url.pathname;
    if (
      req.headers.get("Origin") &&
      req.headers.get("Origin") !== e.PUBLIC_SITE_ORIGIN
    )
      fail("origin_denied", 403);
    if (path.startsWith("/api/v1/admin/drive/oauth/"))
      response = await oauth(req, e, d);
    else if (path === "/api/v1/admin/drive/login" && req.method === "GET") {
      await admin(req, e, d);
      response = new Response(null, {
        status: 303,
        headers: {
          Location: e.PUBLIC_SITE_ORIGIN + "/admin/#drive-connection",
        },
      });
    } else if (path === "/api/v1/admin/drive/status" && req.method === "GET") {
      await admin(req, e, d);
      const c = await e.DB.prepare(
        "SELECT status,updated_at FROM drive_credentials WHERE id=1",
      ).first();
      const counts = await e.DB.prepare(
        "SELECT state,COUNT(*) AS count FROM drive_jobs GROUP BY state",
      ).all();
      response = Response.json({
        mode: e.APP_ENV,
        enabled: driveEnabled(e),
        deliveryEnabled: e.DELIVERY_ENABLED === "true",
        policyApproved: e.DELIVERY_POLICY_APPROVED === "true",
        oauth: c || { status: "NOT_CONNECTED" },
        jobs: counts.results,
        alerts: (
          await e.DB.prepare(
            "SELECT j.order_id,j.file_id,j.state,j.error_code,j.attempts,j.next_at,f.expires_at FROM drive_jobs j JOIN order_files f ON f.id=j.file_id WHERE j.state!='VERIFIED' AND (j.error_code IS NOT NULL OR f.expires_at<=?) ORDER BY f.expires_at LIMIT 50",
          )
            .bind(d.now() + 7200)
            .all()
        ).results,
        configured:
          !!e.GOOGLE_CLIENT_ID &&
          !!e.GOOGLE_CLIENT_SECRET &&
          !!e.DRIVE_TOKEN_KEY,
      });
    } else if (path === "/api/v1/admin/drive/verify" && req.method === "POST") {
      await admin(req, e, d);
      sameOrigin(req, e);
      response = Response.json(await verifyWorkingRoot(e, d));
    } else if (path === "/api/v1/admin/drive/retry" && req.method === "POST") {
      const actor = await admin(req, e, d);
      sameOrigin(req, e);
      if (!driveEnabled(e)) fail("drive_not_enabled", 503);
      await reconcileRefunds(e, d);
      await transfer(e, d);
      await record(e, null, actor, "drive_retry_requested", d);
      response = Response.json({ checked: true });
    } else if (path.startsWith("/api/v1/admin/orders/")) {
      const actor = await admin(req, e, d);
      const m = path.match(
        /^\/api\/v1\/admin\/orders\/([a-f0-9-]{36})\/delivery(?:\/(files|approve|publish|revoke|regenerate|hold|archive-check))?$/,
      );
      if (!m || !idPattern.test(m[1])) fail("not_found", 404);
      const order = m![1],
        action = m![2];
      if (!action && req.method === "GET")
        response = Response.json(await snapshot(e, order, d));
      else if (action === "archive-check" && req.method === "GET") {
        const p = await e.DB.prepare(
          "SELECT * FROM drive_projects WHERE order_id=?",
        )
          .bind(order)
          .first<any>();
        if (!p?.purged_at) fail("archive_not_purged", 409);
        const finals = await e.DB.prepare(
          "SELECT drive_id FROM delivery_files WHERE order_id=?",
        )
          .bind(order)
          .all<any>();
        const inputs = await e.DB.prepare(
          "SELECT n.drive_id FROM drive_nodes n JOIN order_files f ON n.node_key='input:' || f.id WHERE f.order_id=?",
        )
          .bind(order)
          .all<any>();
        const ids = [
          ...new Set(
            [
              p.folder_id,
              p.uploads_id,
              p.working_id,
              p.reports_id,
              p.finals_id,
              ...finals.results.map((f) => f.drive_id),
              ...inputs.results.map((f) => f.drive_id),
            ].filter(Boolean),
          ),
        ];
        const t = await access(e, d);
        let missing = 0;
        for (const id of ids) {
          const r = await d.fetch(
            "https://www.googleapis.com/drive/v3/files/" +
              encodeURIComponent(id) +
              "?fields=id",
            {
              headers: { Authorization: "Bearer " + t },
              signal: AbortSignal.timeout(15000),
            },
          );
          if (r.status === 404) missing++;
          else if (!r.ok) fail("archive_verification_unavailable", 503);
        }
        response = Response.json({
          checked: ids.length,
          missing,
          allAbsent: missing === ids.length,
          verifiedAt: d.now(),
        });
      } else {
        if (req.method !== "POST") fail("method_not_allowed", 405);
        sameOrigin(req, e);
        enabled(e);
        const o = await e.DB.prepare(
          "SELECT paid_at,paid_total,parent_id,stripe_session_id,stripe_invoice_id,customer FROM orders WHERE id=?",
        )
          .bind(order)
          .first<any>();
        if (!o?.paid_at) fail("verified_payment_required", 403);
        if (["files", "approve", "publish", "regenerate"].includes(action)) {
          await requireFulfillmentConsent(e, order);
          await checkRefund(e, d, order);
        }
        if (action === "files") {
          let name = "";
          try {
            name = decodeURIComponent(
              req.headers.get("X-File-Name") || "",
            ).normalize("NFKC");
          } catch {
            fail("invalid_filename");
          }
          if (!/^[\p{L}\p{N} _().-]{1,120}$/u.test(name) || name.includes(".."))
            fail("invalid_filename");
          const ext = name.split(".").pop()?.toLowerCase();
          const mime =
            ext === "xer"
              ? "application/octet-stream"
              : ext === "pdf"
                ? "application/pdf"
                : ext === "xlsx"
                  ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  : fail("final_type_not_allowed", 415);
          const size = Number(req.headers.get("Content-Length"));
          if (
            !Number.isSafeInteger(size) ||
            size < 1 ||
            size > MAX ||
            !req.body
          )
            fail("file_size_required_or_exceeded", 413);
          const count = await e.DB.prepare(
            "SELECT COUNT(*) n FROM delivery_files WHERE order_id=? AND state!='FAILED'",
          )
            .bind(order)
            .first<any>();
          if (count.n >= 20) fail("final_file_limit", 409);
          const t = await access(e, d),
            p = await project(e, t, order, d);
          const id = crypto.randomUUID(),
            driveId = await node(
              e,
              t,
              "final:" + id,
              name,
              p.finals_id,
              mime,
              d,
            );
          await e.DB.prepare(
            "INSERT INTO delivery_files(id,order_id,drive_id,name,mime,bytes,created_at) VALUES (?,?,?,?,?,?,?)",
          )
            .bind(id, order, driveId, name, mime, size, d.now())
            .run();
          try {
            let head = new Uint8Array();
            const validated = req.body!.pipeThrough(
              new TransformStream<Uint8Array, Uint8Array>({
                transform(chunk, c) {
                  if (head.length < 8) {
                    const add = chunk.subarray(0, 8 - head.length),
                      combined = new Uint8Array(head.length + add.length);
                    combined.set(head);
                    combined.set(add, head.length);
                    head = combined;
                  }
                  c.enqueue(chunk);
                },
                flush() {
                  const text = new TextDecoder().decode(head);
                  if (
                    (ext === "xer" && !text.startsWith("ERMHDR")) ||
                    (ext === "pdf" && !text.startsWith("%PDF-")) ||
                    (ext === "xlsx" &&
                      !(
                        head[0] === 80 &&
                        head[1] === 75 &&
                        head[2] === 3 &&
                        head[3] === 4
                      ))
                  )
                    throw new Problem(415, "signature_mismatch");
                },
              }),
            );
            const sha = await putStream(t, driveId, validated, size, mime, d);
            await e.DB.prepare(
              "UPDATE delivery_files SET state='STAGED',sha256=?,revision_id=? WHERE id=?",
            )
              .bind(sha, (await metadata(t, driveId, d)).headRevisionId, id)
              .run();
            await record(e, order, actor, "final_staged:" + id, d);
            response = Response.json(
              {
                id,
                name,
                bytes: size,
                sha256: sha,
                state: "STAGED",
                scanRequired: true,
              },
              { status: 201 },
            );
          } catch (err) {
            await e.DB.prepare(
              "UPDATE delivery_files SET state='FAILED' WHERE id=?",
            )
              .bind(id)
              .run();
            throw err;
          }
        } else {
          const body = await asBody(req);
          if (action === "approve") {
            if (
              typeof body.fileId !== "string" ||
              !idPattern.test(body.fileId) ||
              body.clean !== true ||
              typeof body.scanReference !== "string" ||
              body.scanReference.length < 8 ||
              body.scanReference.length > 200 ||
              !/^\w[\w .:/-]+$/.test(body.scanReference)
            )
              fail("document_scan_attestation_required");
            const f = await e.DB.prepare(
              "SELECT * FROM delivery_files WHERE id=? AND order_id=? AND state='STAGED'",
            )
              .bind(body.fileId, order)
              .first<any>();
            if (!f || body.sha256 !== f.sha256)
              fail("review_hash_mismatch", 409);
            const p = await e.DB.prepare(
              "SELECT finals_id,hold_reason,purged_at FROM drive_projects WHERE order_id=?",
            )
              .bind(order)
              .first<any>();
            if (p?.hold_reason || p?.purged_at) fail("project_on_hold", 409);
            const meta = await metadata(await access(e, d), f.drive_id, d);
            if (
              meta.headRevisionId !== f.revision_id ||
              meta.sha256Checksum !== f.sha256 ||
              Number(meta.size) !== f.bytes ||
              !meta.parents?.includes(p?.finals_id)
            )
              fail("review_file_changed", 409);
            await e.DB.prepare(
              "UPDATE delivery_files SET state='APPROVED',scan_reference=?,approved_by=?,approved_at=? WHERE id=? AND state='STAGED'",
            )
              .bind(body.scanReference, actor, d.now(), f.id)
              .run();
            await record(e, order, actor, "final_scan_attested:" + f.id, d);
            response = Response.json({ approved: true });
          } else if (action === "revoke" || action === "hold") {
            if (
              action === "hold" &&
              ![
                "refund",
                "chargeback",
                "deletion_request",
                "compromised_access",
                "service_failed",
              ].includes(body.reason)
            )
              fail("hold_reason_required");
            await e.DB.batch([
              e.DB.prepare(
                "UPDATE deliveries SET status='REVOKED',version=version+1 WHERE order_id=?",
              ).bind(order),
              e.DB.prepare(
                "DELETE FROM delivery_invites WHERE order_id=?",
              ).bind(order),
              e.DB.prepare(
                "DELETE FROM delivery_sessions WHERE order_id=?",
              ).bind(order),
            ]);
            if (action === "hold") {
              if (
                ![
                  "refund",
                  "chargeback",
                  "deletion_request",
                  "compromised_access",
                  "service_failed",
                ].includes(body.reason)
              )
                fail("hold_reason_required");
              await e.DB.prepare(
                "UPDATE drive_projects SET hold_reason=? WHERE order_id=?",
              )
                .bind(body.reason, order)
                .run();
            }
            await record(e, order, actor, "delivery_" + action, d);
            response = Response.json({ revoked: true });
          } else if (action === "regenerate") {
            const v = await e.DB.prepare(
              "SELECT * FROM deliveries WHERE order_id=? AND status='PUBLISHED' AND expires_at>?",
            )
              .bind(order, d.now())
              .first<any>();
            if (!v) fail("delivery_not_published", 409);
            const p = await e.DB.prepare(
              "SELECT hold_reason,purged_at FROM drive_projects WHERE order_id=?",
            )
              .bind(order)
              .first<any>();
            if (p?.hold_reason || p?.purged_at) fail("project_on_hold", 409);
            await e.DB.batch([
              e.DB.prepare(
                "UPDATE deliveries SET version=version+1 WHERE order_id=?",
              ).bind(order),
              e.DB.prepare(
                "DELETE FROM delivery_invites WHERE order_id=?",
              ).bind(order),
              e.DB.prepare(
                "DELETE FROM delivery_sessions WHERE order_id=?",
              ).bind(order),
            ]);
            const current = await e.DB.prepare(
              "SELECT version FROM deliveries WHERE order_id=?",
            )
              .bind(order)
              .first<any>();
            response = Response.json(
              await invite(
                e,
                order,
                current.version,
                v.expires_at,
                body.passcode === true,
                d,
              ),
            );
            await record(e, order, actor, "delivery_invite_regenerated", d);
          } else if (action === "publish") {
            if (e.DELIVERY_POLICY_APPROVED !== "true")
              fail("delivery_policy_review_required", 503);
            if (
              body.confirmOrder !== order ||
              body.invoiceReviewed !== true ||
              !Number.isInteger(body.accessDays) ||
              body.accessDays < 1 ||
              body.accessDays > 30 ||
              !Number.isInteger(body.retentionDays) ||
              body.retentionDays < body.accessDays ||
              body.retentionDays > 90
            )
              fail("explicit_release_review_required");
            if (
              !Array.isArray(body.files) ||
              body.files.length < 1 ||
              body.files.length > 20 ||
              new Set(body.files.map((f: any) => f.id)).size !==
                body.files.length
            )
              fail("release_file_list_required");
            const payer = o.parent_id
              ? await e.DB.prepare(
                  "SELECT id,paid_at,paid_total,stripe_session_id FROM orders WHERE id=?",
                )
                  .bind(o.parent_id)
                  .first<any>()
              : { ...o, id: order };
            if (
              !payer?.paid_at ||
              !payer.stripe_session_id ||
              payer.paid_total !== o.paid_total
            )
              fail("payment_review_required", 409);
            const paidSession = await stripe(
              e,
              d,
              "checkout/sessions/" +
                encodeURIComponent(payer.stripe_session_id),
            );
            if (
              paidSession.livemode !== (e.APP_ENV === "production") ||
              paidSession.payment_status !== "paid" ||
              paidSession.status !== "complete" ||
              paidSession.metadata?.order_id !== payer.id ||
              paidSession.amount_total !== o.paid_total ||
              typeof paidSession.customer_details?.email !== "string"
            )
              fail("payment_review_required", 409);
            const intent = await stripe(
              e,
              d,
              "payment_intents/" +
                encodeURIComponent(paidSession.payment_intent),
            );
            const charge = await stripe(
              e,
              d,
              "charges/" + encodeURIComponent(intent.latest_charge),
            );
            if (
              charge.livemode !== (e.APP_ENV === "production") ||
              charge.refunded ||
              charge.disputed ||
              charge.amount_refunded > 0
            )
              fail("payment_hold_required", 409);
            const t = await access(e, d),
              p = await project(e, t, order, d);
            const selected = [];
            for (const choice of body.files) {
              const f = await e.DB.prepare(
                "SELECT * FROM delivery_files WHERE id=? AND order_id=? AND state='APPROVED'",
              )
                .bind(String(choice.id), order)
                .first<any>();
              if (!f || choice.sha256 !== f.sha256)
                fail("release_file_not_approved", 409);
              const meta = await metadata(t, f.drive_id, d);
              if (
                meta.headRevisionId !== f.revision_id ||
                meta.sha256Checksum !== f.sha256 ||
                Number(meta.size) !== f.bytes ||
                !meta.parents?.includes(p.finals_id)
              )
                fail("release_file_changed", 409);
              if (!f.revision_id) fail("release_revision_missing", 409);
              await google(
                t,
                "files/" +
                  encodeURIComponent(f.drive_id) +
                  "/revisions/" +
                  encodeURIComponent(f.revision_id),
                d,
                {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ keepForever: true }),
                },
              );
              selected.push(f);
            }
            const expires = d.now() + body.accessDays * DAY;
            await e.DB.batch([
              e.DB.prepare(
                "INSERT INTO deliveries(order_id,status,version,published_at,expires_at) VALUES (?,'PUBLISHED',1,?,?) ON CONFLICT(order_id) DO UPDATE SET status='PUBLISHED',version=deliveries.version+1,published_at=excluded.published_at,expires_at=excluded.expires_at",
              ).bind(order, d.now(), expires),
              e.DB.prepare(
                "DELETE FROM delivery_invites WHERE order_id=?",
              ).bind(order),
              e.DB.prepare(
                "DELETE FROM delivery_sessions WHERE order_id=?",
              ).bind(order),
              e.DB.prepare(
                "DELETE FROM delivery_members WHERE order_id=?",
              ).bind(order),
              ...selected.map((f) =>
                e.DB.prepare(
                  "INSERT INTO delivery_members(order_id,file_id,sha256,revision_id) VALUES (?,?,?,?)",
                ).bind(order, f.id, f.sha256, f.revision_id),
              ),
              e.DB.prepare(
                "UPDATE drive_projects SET retention_at=? WHERE order_id=?",
              ).bind(d.now() + body.retentionDays * DAY, order),
            ]);
            const v = await e.DB.prepare(
              "SELECT version FROM deliveries WHERE order_id=?",
            )
              .bind(order)
              .first<any>();
            const invited = await invite(
              e,
              order,
              v.version,
              expires,
              body.passcode === true,
              d,
            );
            await record(
              e,
              order,
              actor,
              "delivery_published:v" + v.version,
              d,
            );
            response = Response.json({
              ...invited,
              recipient: paidSession.customer_details.email,
              invoiceId: o.stripe_invoice_id,
              version: v.version,
            });
          } else fail("not_found", 404);
        }
      }
    } else if (path.startsWith("/api/v1/delivery/")) {
      enabled(e);
      const ip = req.headers.get("CF-Connecting-IP") || "local";
      await rate(e, "delivery-ip:" + ip, 90, d.now());
      if (path === "/api/v1/delivery/activate" && req.method === "POST") {
        sameOrigin(req, e);
        await rate(e, "delivery-activate:" + ip, 10, d.now());
        const b = await asBody(req);
        if (typeof b.invite !== "string" || !/^[a-f0-9]{64}$/.test(b.invite))
          fail("invite_invalid", 401);
        const hash = await digest(b.invite);
        const row = await e.DB.prepare(
          "SELECT i.*,v.status,v.version AS current_version,v.expires_at AS release_expiry,p.hold_reason,p.purged_at,o.paid_at FROM delivery_invites i JOIN deliveries v ON v.order_id=i.order_id JOIN orders o ON o.id=i.order_id LEFT JOIN drive_projects p ON p.order_id=i.order_id WHERE i.token_hash=?",
        )
          .bind(hash)
          .first<any>();
        if (
          !row ||
          row.used_at ||
          row.expires_at <= d.now() ||
          row.release_expiry <= d.now() ||
          row.status !== "PUBLISHED" ||
          row.version !== row.current_version ||
          row.hold_reason ||
          row.purged_at ||
          !row.paid_at
        )
          fail("invite_invalid_or_expired", 401);
        await checkRefund(e, d, row.order_id);
        await rate(e, "delivery-order:" + row.order_id, 20, d.now());
        if (
          row.passcode_hash &&
          (typeof b.passcode !== "string" ||
            b.passcode.length > 64 ||
            !equal(
              await digest(b.invite + ":" + b.passcode),
              row.passcode_hash,
            ))
        )
          fail("invite_invalid_or_expired", 401);
        const used = await e.DB.prepare(
          "UPDATE delivery_invites SET used_at=? WHERE token_hash=? AND used_at IS NULL AND expires_at>?",
        )
          .bind(d.now(), hash, d.now())
          .run();
        if (!used.meta.changes) fail("invite_already_used", 401);
        const raw = token(),
          expires = Math.min(d.now() + 3600, row.release_expiry);
        await e.DB.prepare(
          "INSERT INTO delivery_sessions(token_hash,order_id,version,expires_at) VALUES (?,?,?,?)",
        )
          .bind(await digest(raw), row.order_id, row.version, expires)
          .run();
        await record(e, row.order_id, "customer", "delivery_activated", d);
        response = Response.json(
          { active: true, sessionExpiresAt: expires },
          { headers: { "Set-Cookie": sessionCookie(raw, expires - d.now()) } },
        );
      } else if (path === "/api/v1/delivery/logout" && req.method === "POST") {
        sameOrigin(req, e);
        const raw = cookie(req, COOKIE);
        if (raw)
          await e.DB.prepare("DELETE FROM delivery_sessions WHERE token_hash=?")
            .bind(await digest(raw))
            .run();
        response = Response.json(
          { loggedOut: true },
          { headers: { "Set-Cookie": sessionCookie("", 0) } },
        );
      } else {
        const s = await authorized(req, e, d);
        await rate(e, "delivery-download:" + s.order_id, 60, d.now());
        if (
          (path === "/api/v1/delivery/session" ||
            path === "/api/v1/delivery/files") &&
          req.method === "GET"
        ) {
          const files = await e.DB.prepare(
            "SELECT f.id,f.name,f.mime,f.bytes FROM delivery_members m JOIN delivery_files f ON f.id=m.file_id WHERE m.order_id=? AND f.state='APPROVED'",
          )
            .bind(s.order_id)
            .all();
          response = Response.json({
            orderReference: s.order_id,
            package: s.sku,
            publishedAt: s.published_at,
            expiresAt: s.delivery_expires_at,
            sessionExpiresAt: s.expires_at,
            files: files.results,
          });
        } else {
          const m = path.match(
            /^\/api\/v1\/delivery\/files\/([a-f0-9-]{36})\/download$/,
          );
          if (!m || req.method !== "GET") fail("not_found", 404);
          const f = await e.DB.prepare(
            "SELECT f.*,m.sha256 AS released_hash,m.revision_id AS released_revision,p.finals_id FROM delivery_members m JOIN delivery_files f ON f.id=m.file_id JOIN drive_projects p ON p.order_id=m.order_id WHERE m.order_id=? AND f.id=? AND f.state='APPROVED'",
          )
            .bind(s.order_id, m![1])
            .first<any>();
          if (!f) fail("file_unavailable", 404);
          const t = await access(e, d),
            meta = await metadata(t, f.drive_id, d);
          if (
            meta.sha256Checksum !== f.released_hash ||
            Number(meta.size) !== f.bytes ||
            !meta.parents?.includes(f.finals_id)
          )
            fail("download_unavailable", 409);
          const range = req.headers.get("Range");
          if (range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range))
            fail("invalid_range", 416);
          if (range) {
            const match = range.match(/^bytes=(\d*)-(\d*)$/)!;
            if (
              (match[1] && Number(match[1]) >= f.bytes) ||
              (match[1] && match[2] && Number(match[2]) < Number(match[1])) ||
              (!match[1] && Number(match[2]) === 0)
            )
              fail("invalid_range", 416);
          }
          const r = await d.fetch(
            "https://www.googleapis.com/drive/v3/files/" +
              encodeURIComponent(f.drive_id) +
              "/revisions/" +
              encodeURIComponent(f.released_revision) +
              "?alt=media",
            {
              headers: {
                Authorization: "Bearer " + t,
                ...(range ? { Range: range } : {}),
              },
              signal: AbortSignal.timeout(
                Math.max(
                  1,
                  Math.min(
                    30000,
                    (Math.min(s.expires_at, s.delivery_expires_at) - d.now()) *
                      1000,
                  ),
                ),
              ),
            },
          );
          if (r.status === 416) fail("invalid_range", 416);
          if (![200, 206].includes(r.status) || !r.body)
            fail("download_unavailable", 502);
          // Recheck revocation/expiry after the provider request before releasing any bytes.
          await authorized(req, e, d);
          const headers = new Headers({
            "Content-Type": f.mime,
            "Content-Disposition": `attachment; filename="document.${f.name.split(".").pop()}"; filename*=UTF-8''${encodeURIComponent(f.name)}`,
            "Accept-Ranges": "bytes",
          });
          for (const key of ["Content-Length", "Content-Range"])
            if (r.headers.has(key)) headers.set(key, r.headers.get(key)!);
          await record(
            e,
            s.order_id,
            "customer",
            "delivery_download_started:" + f.id,
            d,
          );
          response = new Response(r.body, { status: r.status, headers });
        }
      }
    } else fail("not_found", 404);
  } catch (err) {
    response = Response.json(
      { error: err instanceof Problem ? err.code : "delivery_request_failed" },
      { status: err instanceof Problem ? err.status : 500 },
    );
  }
  const headers = new Headers(response!.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'",
  );
  return new Response(response!.body, { status: response!.status, headers });
}
export async function deliveryMaintenance(e: DriveEnv, d: Deps = defaults) {
  if (!driveEnabled(e)) return;
  await reconcileRefunds(e, d);
  await transfer(e, d);
  await e.DB.batch([
    e.DB.prepare("DELETE FROM delivery_sessions WHERE expires_at<=?").bind(
      d.now(),
    ),
    e.DB.prepare("DELETE FROM delivery_invites WHERE expires_at<=?").bind(
      d.now(),
    ),
    e.DB.prepare(
      "UPDATE deliveries SET status='EXPIRED' WHERE status='PUBLISHED' AND expires_at<=?",
    ).bind(d.now()),
  ]);
  if (e.DELIVERY_POLICY_APPROVED !== "true") return;
  const due = await e.DB.prepare(
    "SELECT order_id,folder_id FROM drive_projects WHERE retention_at<=? AND purged_at IS NULL AND hold_reason IS NULL LIMIT 2",
  )
    .bind(d.now())
    .all<any>();
  for (const p of due.results) {
    try {
      const t = await access(e, d);
      // The persisted folder belongs to this application. A prior successful delete
      // followed by a D1 outage must be recoverable without an endless 404 retry.
      const check = await d.fetch(
        "https://www.googleapis.com/drive/v3/files/" +
          encodeURIComponent(p.folder_id) +
          "?fields=id,shared,ownedByMe,trashed",
        {
          headers: { Authorization: "Bearer " + t },
          signal: AbortSignal.timeout(15000),
        },
      );
      if (check.status !== 404) {
        if (!check.ok) throw new Problem(503, "drive_retention_retry_required");
        const meta = (await check.json()) as any;
        if (meta.shared || meta.ownedByMe !== true)
          throw new Problem(409, "drive_file_not_private");
        const removed = await d.fetch(
          "https://www.googleapis.com/drive/v3/files/" +
            encodeURIComponent(p.folder_id),
          {
            method: "DELETE",
            headers: { Authorization: "Bearer " + t },
            signal: AbortSignal.timeout(30000),
          },
        );
        if (!removed.ok && removed.status !== 404)
          throw new Problem(503, "drive_retention_retry_required");
      }
      await e.DB.prepare(
        "UPDATE drive_projects SET purged_at=? WHERE order_id=?",
      )
        .bind(d.now(), p.order_id)
        .run();
      await record(e, p.order_id, "system", "drive_retention_deleted", d);
    } catch {
      await record(
        e,
        p.order_id,
        "system",
        "drive_retention_retry_required",
        d,
      );
    }
  }
}
