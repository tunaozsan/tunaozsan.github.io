import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { Problem } from "./catalog";
import { digest, type Env, type Deps } from "./security";
import { taxEvidence } from "./tax";

export async function invoiceStatement(
  e: Env,
  d: Deps,
  o: any,
  s: any,
  acceptance: any,
  event: any,
) {
  if (
    s.payment_status !== "paid" ||
    s.status !== "complete" ||
    s.metadata?.invoice_mode !== "portal_pdf" ||
    !s.metadata?.approval_id
  )
    throw new Problem(409, "invoice_payment_not_verified");
  const scope = JSON.parse(acceptance.scope_json);
  if (
    acceptance.stripe_session_id !== s.id ||
    scope.total !== s.amount_subtotal ||
    acceptance.quote_sha256 !== s.metadata?.quote_hash ||
    s.consent?.terms_of_service !== "accepted"
  )
    throw new Problem(409, "invoice_scope_not_verified");
  const customer = JSON.parse(o.customer);
  const snapshot = {
    schema: 1,
    mode: e.APP_ENV,
    issuer: {
      name: "Bluefin Tuna LLC",
      address: "1209 Mountain Road Pl NE, STE N, Albuquerque, NM 87110, USA",
      email: "support@bluefintuna.life",
    },
    orderId: o.id,
    project: customer.project,
    sessionId: s.id,
    accountId: e.STRIPE_ACCOUNT_ID,
    customer: {
      name: s.customer_details?.name || customer.name,
      business: customer.businessName || "",
      address: s.customer_details.address,
      taxIds: (s.customer_details?.tax_ids || []).map((x: any) => ({
        type: x.type,
        value: x.value,
      })),
    },
    currency: "usd",
    lines: scope.lines,
    subtotal: s.amount_subtotal,
    tax: s.total_details.amount_tax,
    total: s.amount_total,
    breakdown: taxEvidence(s),
    termsVersion: acceptance.agreement_version,
    termsHash: acceptance.agreement_sha256,
    quoteHash: acceptance.quote_sha256,
  };
  const raw = JSON.stringify(snapshot);
  return e.DB.prepare(
    "INSERT OR IGNORE INTO order_invoices(order_id,stripe_session_id,stripe_event_id,issued_at,snapshot_json,snapshot_sha256) VALUES (?,?,?,?,?,?)",
  ).bind(o.id, s.id, event.id, d.now(), raw, await digest(raw));
}
export function invoiceNumber(row: any, mode: string) {
  return `${mode === "production" ? "BT" : "TEST-BT"}-${new Date(row.issued_at * 1000).getUTCFullYear()}-${String(row.sequence).padStart(8, "0")}`;
}
export async function renderInvoice(
  row: any,
  fontBytes: Uint8Array,
  currentStatus: string,
) {
  if ((await digest(row.snapshot_json)) !== row.snapshot_sha256)
    throw new Problem(500, "invoice_integrity_failed");
  const s = JSON.parse(row.snapshot_json),
    doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: true }),
    supported = new Set(font.getCharacterSet());
  doc.setTitle("Invoice " + invoiceNumber(row, s.mode));
  doc.setAuthor("Bluefin Tuna LLC");
  doc.setCreationDate(new Date(row.issued_at * 1000));
  doc.setModificationDate(new Date(row.issued_at * 1000));
  let page = doc.addPage([595.28, 841.89]),
    y = 790;
  const ink = rgb(0.055, 0.13, 0.23),
    muted = rgb(0.28, 0.36, 0.44),
    blue = rgb(0.015, 0.32, 0.64);
  const write = (value: any, size = 10, color = ink) => {
    const text = String(value ?? "").replace(/[\x00-\x1f]/g, " ");
    if ([...text].some((c) => !supported.has(c.codePointAt(0)!)))
      throw new Problem(422, "invoice_font_unsupported_character");
    let line = "";
    const flush = () => {
      if (y < 65) {
        page = doc.addPage([595.28, 841.89]);
        y = 790;
      }
      page.drawText(line, { x: 44, y, size, font, color });
      y -= size + 6;
      line = "";
    };
    for (const char of text) {
      if (font.widthOfTextAtSize(line + char, size) > 507) flush();
      line += char;
    }
    flush();
  };
  const money = (v: number) => "USD " + (v / 100).toFixed(2);
  write("BLUEFIN TUNA", 23, blue);
  write("Project Planning & Software Solutions", 10, muted);
  y -= 20;
  write(
    s.mode === "production" ? "INVOICE" : "TEST INVOICE - NO REAL PAYMENT",
    18,
  );
  write(invoiceNumber(row, s.mode), 12);
  write(
    "Issued (UTC): " +
      new Date(row.issued_at * 1000).toISOString().slice(0, 10),
  );
  y -= 12;
  write(s.issuer.name, 12);
  write(s.issuer.address);
  write(s.issuer.email);
  y -= 16;
  write("BILL TO", 11, blue);
  write(s.customer.business || s.customer.name, 12);
  if (s.customer.business) write(s.customer.name);
  const a = s.customer.address;
  write([a.line1, a.line2].filter(Boolean).join(", "));
  write([a.city, a.state, a.postal_code, a.country].filter(Boolean).join(", "));
  for (const t of s.customer.taxIds)
    write("Customer tax ID (" + t.type + "): " + t.value);
  y -= 15;
  write("Project: " + s.project, 12);
  write("Order: " + s.orderId, 9, muted);
  y -= 10;
  for (const l of s.lines) {
    write(l.name, 11);
    write(
      `${l.quantity} x ${money(l.unit)} = ${money(l.quantity * l.unit)}  |  ${l.sku}`,
      9,
      muted,
    );
    y -= 5;
  }
  y -= 8;
  write("Subtotal (tax-exclusive): " + money(s.subtotal), 12);
  write("Tax: " + money(s.tax), 12);
  write("Total captured: " + money(s.total), 16, blue);
  write("Current order status: " + currentStatus.replaceAll("_", " "), 10);
  write(
    "Original invoice retained. Any subsequent refund is recorded separately.",
    9,
    muted,
  );
  y -= 12;
  for (const t of s.breakdown)
    write(
      `Tax: ${t.country || ""} ${t.state || ""} | ${t.taxability_reason} | ${money(t.amount)}`,
      9,
      muted,
    );
  y -= 10;
  write("Terms: " + s.termsVersion, 9, muted);
  write("Terms SHA-256: " + s.termsHash, 8, muted);
  write("Evidence SHA-256: " + row.snapshot_sha256, 8, muted);
  const pages = doc.getPages();
  pages.forEach((p, i) =>
    p.drawText(
      `bluefintuna.life   |   ${invoiceNumber(row, s.mode)}   |   ${i + 1}/${pages.length}`,
      { x: 44, y: 30, size: 8, font, color: muted },
    ),
  );
  return doc.save();
}
export async function invoiceResponse(e: Env, orderId: string) {
  const row = await e.DB.prepare(
    "SELECT i.*,o.status,o.paid_at,o.stripe_session_id AS bound_session,EXISTS(SELECT 1 FROM payment_refund_holds h WHERE h.order_id=COALESCE(o.parent_id,o.id)) AS refund_hold FROM order_invoices i JOIN orders o ON o.id=i.order_id WHERE i.order_id=?",
  )
    .bind(orderId)
    .first<any>();
  if (!row || !row.paid_at || row.stripe_session_id !== row.bound_session)
    throw new Problem(404, "verified_invoice_unavailable");
  if (!e.ASSETS) throw new Problem(503, "invoice_font_unavailable");
  const font = await e.ASSETS.fetch(
    new Request(e.PUBLIC_SITE_ORIGIN + "/assets/fonts/NotoSans-Regular.ttf"),
  );
  if (!font.ok) throw new Problem(503, "invoice_font_unavailable");
  const bytes = await renderInvoice(
    row,
    new Uint8Array(await font.arrayBuffer()),
    row.refund_hold ? "REFUND_REVIEW_REQUIRED" : row.status,
  );
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoiceNumber(row, e.APP_ENV)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
