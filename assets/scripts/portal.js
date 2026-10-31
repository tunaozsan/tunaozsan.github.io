// cloudflare/worker/src/agreement.ts
var AGREEMENT_VERSION = "service-terms-2026-10-30-v2";
var AGREEMENT_HASH = "85197b0cc77544c400f826dab4a50091d13d916f326fc0ac5cea4ebfab1d7f9c";

// src/delivery-admin.ts
function el(tag, text) {
  const e = document.createElement(tag);
  e.textContent = text;
  return e;
}
async function api(origin, path, body) {
  const r = await fetch(origin + path, {
    method: body ? "POST" : "GET",
    credentials: "include",
    cache: "no-store",
    redirect: "error",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : void 0
  }).catch(() => {
    throw Error(
      "Connection failed or Access sign-in required. Click Sign in / renew admin session below, then retry Connect personal Drive. If it persists, check your network connection."
    );
  });
  if (!r.headers.get("Content-Type")?.includes("application/json"))
    throw Error("Sign in to this portal's Access application first.");
  const data = await r.json();
  if (!r.ok)
    throw Error(String(data.error || "request_failed").replaceAll("_", " "));
  return data;
}
function button(text, fn, output) {
  const b = el("button", text);
  b.type = "button";
  b.className = "button secondary";
  b.addEventListener("click", async () => {
    b.disabled = true;
    try {
      await fn();
    } catch (e) {
      output.textContent = e.message;
    } finally {
      b.disabled = false;
    }
  });
  return b;
}
function input(parent, title, type = "text") {
  const l = el("label", title), i = document.createElement("input");
  i.type = type;
  l.append(i);
  parent.append(l);
  return i;
}
function setupDriveAdmin(origin, parent) {
  const section = el("section", "");
  section.className = "portal-panel";
  section.id = "drive-connection";
  const message = el(
    "p",
    "Private working storage and customer intake are controlled separately."
  );
  message.setAttribute("role", "status");
  section.append(el("h2", "Private working storage"), message);
  const login = el("a", "Sign in / renew admin session");
  login.href = origin + "/api/v1/admin/drive/login";
  login.className = "button secondary";
  section.append(login);
  section.append(
    button(
      "Check Drive connection",
      async () => {
        const r = await api(origin, "/api/v1/admin/drive/status");
        message.textContent = `OAuth: ${r.oauth.status}. Drive enabled: ${r.enabled}. Delivery enabled: ${r.deliveryEnabled}. ${r.mode === "production" ? "Owner-approved retention policy" : "Synthetic staging policy gate (not production legal approval)"}: ${r.policyApproved}.`;
        for (const old of section.querySelectorAll("[data-transfer-alert]"))
          old.remove();
        for (const alert of r.alerts || []) {
          const warning = el(
            "p",
            `TRANSFER ALERT \xB7 ${alert.order_id} \xB7 ${alert.state} \xB7 ${alert.error_code || "R2 expiry approaching"} \xB7 attempt ${alert.attempts}`
          );
          warning.setAttribute("role", "alert");
          warning.dataset.transferAlert = "true";
          section.append(warning);
        }
      },
      message
    )
  );
  section.append(
    button(
      "Verify refresh and private root",
      async () => {
        const r = await api(origin, "/api/v1/admin/drive/verify", {});
        message.textContent = `OAuth: ${r.oauth}. Refresh: verified. Private ${r.rootEnvironment} root: verified.`;
      },
      message
    )
  );
  section.append(
    button(
      "Connect personal Drive",
      async () => {
        const r = await api(origin, "/api/v1/admin/drive/oauth/start", {});
        const u = new URL(r.authorizationUrl);
        if (u.hostname !== "accounts.google.com" || u.protocol !== "https:")
          throw Error("Unexpected authorization target");
        location.assign(u.href);
      },
      message
    )
  );
  section.append(
    button(
      "Retry due transfers",
      async () => {
        await api(origin, "/api/v1/admin/drive/retry", {});
        message.textContent = "Due transfers checked. Review the order transfer statuses.";
      },
      message
    )
  );
  section.append(
    button(
      "Disconnect Drive authorization",
      async () => {
        if (!confirm(
          "Disconnect private storage? Pending transfers will require reauthorization. Existing files are not deleted."
        ))
          return;
        await api(origin, "/api/v1/admin/drive/oauth/revoke", {});
        message.textContent = "Drive authorization revoked.";
      },
      message
    )
  );
  parent.insertBefore(section, parent.querySelector("#load-admin"));
}
async function showDeliveryAdmin(origin, order, parent) {
  const box = el("section", "");
  box.className = "portal-panel";
  const status2 = el("p", "Loading private delivery workspace\u2026");
  status2.setAttribute("role", "status");
  box.append(el("h2", "Working files & customer delivery"), status2);
  parent.append(box);
  let data;
  try {
    data = await api(origin, `/api/v1/admin/orders/${order}/delivery`);
  } catch (e) {
    status2.textContent = e.message;
    return;
  }
  const base = `/api/v1/admin/orders/${order}/delivery`;
  const reload = async () => {
    box.remove();
    await showDeliveryAdmin(origin, order, parent);
  };
  status2.textContent = `PAYMENT VERIFIED \xB7 ${data.delivery?.status || "WORK IN PROGRESS"}${data.hold ? " \xB7 HOLD: " + data.hold : ""}. Invoice: ${data.order.portal_invoice_number || data.order.stripe_invoice_id || "No invoice recorded \u2014 review required"}`;
  const date = (value) => value ? new Date(value * 1e3).toLocaleString() : "Not scheduled";
  const summary = el("dl", "");
  for (const [label, value] of [
    [
      "Project Status",
      data.order.status + (data.hold ? " / HOLD: " + data.hold : "")
    ],
    [
      "Drive Transfer Status",
      data.transfers.length ? data.transfers.map((j) => j.state).join(", ") : "No input transfer jobs"
    ],
    [
      "Delivery Published",
      (data.delivery?.status || "DRAFT") + " / " + date(data.delivery?.published_at)
    ],
    [
      "Downloads",
      `${data.downloads?.count || 0} started (not proof of complete receipt). Latest: ${date(data.downloads?.lastStartedAt)}`
    ],
    ["Customer Access Expiration", date(data.delivery?.expires_at)],
    [
      "Archive Expiration",
      date(data.retentionAt) + (data.archivedAt ? " / Deleted: " + date(data.archivedAt) : "")
    ]
  ])
    summary.append(el("dt", label), el("dd", value));
  box.append(summary);
  if (data.archivedAt)
    box.append(
      button(
        "Verify archive deletion",
        async () => {
          const result = await api(origin, base + "/archive-check");
          status2.textContent = result.allAbsent ? `Archive deletion verified: ${result.missing}/${result.checked} objects absent.` : "Archive deletion incomplete. Review storage before closing the project.";
        },
        status2
      )
    );
  if (data.workspace) {
    const link = el("a", "Open private working folder");
    link.href = data.workspace;
    link.target = "_blank";
    link.rel = "noreferrer noopener";
    link.className = "button secondary";
    box.append(link);
  }
  for (const job of data.transfers)
    box.append(
      el(
        "p",
        `DRIVE TRANSFER ${job.name}: ${job.state} \xB7 attempts ${job.attempts} \xB7 SHA-256 ${job.sha256 || "pending"}${job.alert ? " \xB7 " + job.alert : ""}${job.error_code ? " \xB7 " + job.error_code : ""}`
      )
    );
  box.append(
    el(
      "p",
      "Final files are unapproved until you scan the exact bytes in your isolated working environment and record the scan reference. No automatic antivirus service is configured."
    )
  );
  const file = input(
    box,
    "Upload final XER, PDF or XLSX \xB7 20 MiB maximum",
    "file"
  );
  file.accept = ".xer,.pdf,.xlsx";
  box.append(
    button(
      "Upload final for review",
      async () => {
        const f = file.files?.[0];
        if (!f) throw Error("Choose a final document");
        const r = await fetch(origin + base + "/files", {
          method: "POST",
          credentials: "include",
          headers: {
            "X-File-Name": encodeURIComponent(f.name),
            "Content-Type": "application/octet-stream"
          },
          body: f
        });
        const body = await r.json();
        if (!r.ok) throw Error(body.error);
        await reload();
      },
      status2
    )
  );
  const selected = [];
  for (const f of data.files) {
    const item = el("div", "");
    item.className = "portal-panel";
    item.append(
      el("h3", f.name),
      el(
        "p",
        `${f.mime} \xB7 ${f.bytes} bytes \xB7 ${f.state} \xB7 ${f.approved_at ? "Reviewed " + date(f.approved_at) : "Awaiting review"}`
      ),
      el("code", f.sha256 || "Upload incomplete")
    );
    if (f.state === "STAGED") {
      const scan = input(item, "Scanner / date / scan report reference");
      const clean = input(
        item,
        "I scanned these exact bytes and found no malware, embedded active content or unsafe spreadsheet links/macros.",
        "checkbox"
      );
      item.append(
        button(
          "Approve scanned file",
          async () => {
            if (!clean.checked) throw Error("Scan confirmation required");
            await api(origin, base + "/approve", {
              fileId: f.id,
              sha256: f.sha256,
              clean: true,
              scanReference: scan.value
            });
            await reload();
          },
          status2
        )
      );
    }
    if (f.state === "APPROVED") {
      const check = input(
        item,
        "Include this exact file in this release",
        "checkbox"
      );
      selected.push({ id: f.id, sha256: f.sha256, check });
    }
    box.append(item);
  }
  box.append(
    el("h3", "Review and publish"),
    el(
      "p",
      "Select exact approved files. Confirm the order, invoice and reviewed retention policy. No email is sent automatically."
    )
  );
  const confirmOrder = input(box, "Type the full order ID to confirm");
  const reviewed = input(
    box,
    "I reviewed the verified payment/invoice and selected final files.",
    "checkbox"
  );
  const days = input(
    box,
    "Customer access days (1\u201330; 30 days is a proposal until approved)",
    "number"
  );
  days.min = "1";
  days.max = "30";
  const retention = input(
    box,
    "Working-copy retention days after publication (at least access days, max 90; approval required)",
    "number"
  );
  retention.min = "1";
  retention.max = "90";
  const passcode = input(
    box,
    "Require a separate passcode; send it through an independent channel.",
    "checkbox"
  );
  const output = el("div", "");
  box.append(output);
  const display = (r) => {
    output.replaceChildren(
      el("h3", "Private invitation \u2014 share securely"),
      el(
        "p",
        "Purchasing contact: " + (r.recipient || "Use the verified Stripe purchasing email from the order.")
      ),
      el("p", r.message)
    );
    const area = document.createElement("textarea");
    area.readOnly = true;
    area.value = "Your deliverables are ready. Download securely via your Bluefin Tuna project portal:\n" + r.url + "\n\nActivate this invitation before " + new Date(r.inviteExpiresAt * 1e3).toLocaleString() + ".";
    area.setAttribute("aria-label", "Private manual delivery message");
    output.append(area);
    if (r.passcode)
      output.append(el("p", "Separate-channel passcode: " + r.passcode));
    output.append(
      el(
        "p",
        "This link is displayed once. Never paste it into support logs or public messages."
      )
    );
  };
  box.append(
    button(
      "Publish Delivery",
      async () => {
        const files2 = selected.filter((x) => x.check.checked).map(({ id, sha256 }) => ({ id, sha256 }));
        if (!confirm("Publish exactly these final documents for this paid order?"))
          return;
        display(
          await api(origin, base + "/publish", {
            confirmOrder: confirmOrder.value,
            invoiceReviewed: reviewed.checked,
            files: files2,
            accessDays: Number(days.value),
            retentionDays: Number(retention.value),
            passcode: passcode.checked
          })
        );
        status2.textContent = "PUBLISHED. Manually send the private invitation to the purchasing contact.";
      },
      status2
    )
  );
  box.append(
    button(
      "Regenerate invitation / revoke previous access",
      async () => {
        display(
          await api(origin, base + "/regenerate", {
            passcode: passcode.checked
          })
        );
      },
      status2
    )
  );
  box.append(
    button(
      "Revoke customer delivery",
      async () => {
        if (!confirm("Revoke all invitations and sessions for this order?"))
          return;
        await api(origin, base + "/revoke", {});
        await reload();
      },
      status2
    )
  );
  const hold = document.createElement("select");
  hold.setAttribute("aria-label", "Hold reason");
  for (const reason of [
    "refund",
    "chargeback",
    "deletion_request",
    "compromised_access",
    "service_failed"
  ]) {
    const option = el(
      "option",
      reason.replaceAll("_", " ")
    );
    option.value = reason;
    hold.append(option);
  }
  box.append(
    hold,
    button(
      "Place project on hold",
      async () => {
        await api(origin, base + "/hold", { reason: hold.value });
        await reload();
      },
      status2
    )
  );
}

// cloudflare/worker/src/catalog.ts
var Problem = class extends Error {
  constructor(status2, code2) {
    super(code2);
    this.status = status2;
    this.code = code2;
  }
  status;
  code;
};
var MAX_FILE = 20 * 1024 * 1024;
var packages = [
  ["p6_audit", "Primavera P6 Schedule Audit", 19900, 150, 5, 0, false],
  [
    "baseline_basic_nores",
    "Basic Baseline \u2014 Without Resources",
    49900,
    75,
    5,
    2,
    false
  ],
  [
    "baseline_basic_withres",
    "Basic Baseline \u2014 With Resources",
    79900,
    75,
    7,
    2,
    true
  ],
  [
    "baseline_detailed_nores",
    "Detailed Baseline \u2014 Without Resources",
    99900,
    200,
    10,
    4,
    false
  ],
  [
    "baseline_detailed_withres",
    "Detailed Baseline \u2014 With Resources",
    149900,
    200,
    12,
    4,
    true
  ],
  [
    "update_nores",
    "Primavera P6 Schedule Update \u2014 Without Resources",
    39900,
    200,
    4,
    4,
    false
  ],
  [
    "update_withres",
    "Primavera P6 Schedule Update \u2014 With Resources",
    64900,
    200,
    5,
    4,
    true
  ]
].map(([sku, name, cents, activities, days, maxBlocks, resources]) => ({
  sku: String(sku),
  name: String(name),
  cents: Number(cents),
  activities: Number(activities),
  days: Number(days),
  maxBlocks: Number(maxBlocks),
  resources: Boolean(resources)
}));
var materials = [
  "concrete",
  "rebar",
  "formwork",
  "structural_steel",
  "piping"
];
function object(v) {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new Problem(400, "invalid_object");
  return v;
}
function keys(v, allow) {
  if (Object.keys(v).some((k) => !allow.includes(k)))
    throw new Problem(400, "unknown_field");
}
function integer(v, min, max) {
  if (!Number.isSafeInteger(v) || Number(v) < min || Number(v) > max)
    throw new Problem(400, "invalid_number");
  return Number(v);
}
function quote(raw) {
  const v = object(raw);
  keys(v, ["sku", "activities", "revisions", "materials", "existingResources"]);
  const p = packages.find((p2) => p2.sku === v.sku);
  if (!p) throw new Problem(400, "unknown_package");
  const activities = integer(v.activities, 1, 1e4), revisions = integer(v.revisions ?? 0, 0, 3);
  if (v.existingResources !== void 0 && typeof v.existingResources !== "boolean")
    throw new Problem(400, "invalid_resources");
  const m = v.materials ?? [];
  if (!Array.isArray(m) || m.length > 5)
    throw new Problem(400, "invalid_materials");
  const selected = m.map((x) => {
    const a = object(x);
    keys(a, ["code", "rows"]);
    if (!materials.includes(a.code)) throw new Problem(400, "unknown_material");
    return { code: a.code, rows: integer(a.rows, 1, 1e4) };
  });
  if (new Set(selected.map((x) => x.code)).size !== selected.length)
    throw new Problem(400, "duplicate_material");
  if (selected.length && !p.resources)
    throw new Problem(400, "materials_require_resources");
  const update = p.sku.startsWith("update"), audit = p.sku === "p6_audit";
  if (audit && (revisions || selected.length))
    throw new Problem(400, "audit_addons_unavailable");
  const blocks = Math.ceil(Math.max(0, activities - p.activities) / 50);
  const reasons = [];
  if (blocks > p.maxBlocks)
    reasons.push("Activity count requires a written quote.");
  if (selected.some((x) => x.rows > 50))
    reasons.push("More than 50 BOQ rows per category requires review.");
  if (update && selected.length)
    reasons.push(
      "Existing material assignments require operator verification before payment."
    );
  if (update && p.resources && !v.existingResources)
    reasons.push(
      "Existing MH/cost resource assignments must be confirmed; initial setup is quote-only."
    );
  const lines = [{ sku: p.sku, name: p.name, unit: p.cents, quantity: 1 }];
  if (blocks)
    lines.push({
      sku: p.resources ? update ? "EXTRA-50-UPDATE-R" : "EXTRA-50-BASE-R" : "EXTRA-50-NR",
      name: `Additional 50 activities (${p.resources ? "MH + cost" : "without resources"})`,
      unit: p.resources ? update ? 15e3 : 17500 : 1e4,
      quantity: blocks
    });
  for (const x of selected)
    lines.push({
      sku: `${update ? "UPDATE" : "BASELINE"}-MAT-${x.code.toUpperCase()}`,
      name: `Material: ${x.code.replaceAll("_", " ")} (${x.rows} BOQ rows)`,
      unit: update ? 11900 : 24900,
      quantity: 1
    });
  if (revisions)
    lines.push({
      sku: "REVISION",
      name: "Additional in-scope revision",
      unit: 9900,
      quantity: revisions
    });
  const required = audit ? ["xer"] : update ? ["xer", "baseline", "progress"] : ["boq", "drawings", "scope"];
  if (p.resources) required.push("resources");
  if (selected.length) required.push("materials");
  return {
    cart: {
      sku: p.sku,
      activities,
      revisions,
      materials: selected,
      existingResources: v.existingResources === true
    },
    lines,
    total: lines.reduce((a, l) => a + l.unit * l.quantity, 0),
    currency: "usd",
    scopeReview: reasons,
    required,
    days: p.days
  };
}

// assets/scripts/portal-config.js
var API_ORIGIN = "https://bluefin-project-portal-api.bluefintuna-llc.workers.dev";
var TURNSTILE_SITE_KEY = "0x4AAAAAAFqzcQjgbI_eP7Le";

// src/portal-client.ts
var $ = (id) => document.getElementById(id);
var el2 = (tag, text) => {
  const n = document.createElement(tag);
  n.textContent = text;
  return n;
};
var money = (c) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
  c / 100
);
var session = null;
var serverQuote = null;
var activeXHR = null;
var enabled = false;
var applicationMode = false;
var unavailableSkus = [];
var challenge = "";
var offset = 0;
try {
  session = JSON.parse(sessionStorage.getItem("bluefin-session") || "null");
} catch {
}
function notice(message) {
  const n = $("portal-notice") || $("status-message");
  if (n) n.textContent = message;
}
function save(s) {
  session = s;
  sessionStorage.setItem("bluefin-session", JSON.stringify(s));
}
function code() {
  return session.orderId + "." + session.token;
}
async function api2(path, method = "GET", body, admin = false) {
  if (!API_ORIGIN) throw Error("Preview only. The secure API is not enabled.");
  const r = await fetch(API_ORIGIN + path, {
    method,
    credentials: admin ? "include" : "omit",
    headers: {
      ...session && !admin ? { Authorization: "Bearer " + session.token } : {},
      ...body !== void 0 ? { "Content-Type": "application/json" } : {}
    },
    body: body === void 0 ? void 0 : JSON.stringify(body),
    cache: "no-store"
  });
  let data;
  try {
    data = await r.json();
  } catch {
    throw Error(
      "API unavailable or sign-in required. No payment has been confirmed."
    );
  }
  if (!r.ok)
    throw Error(String(data.error || "Request failed").replaceAll("_", " "));
  return data;
}
var route = (suffix) => `/api/v1/orders/${session.orderId}/${suffix}`;
function cart() {
  return {
    sku: $("package").value,
    activities: Number($("activities").value),
    revisions: Number($("revisions").value),
    existingResources: $("existing-resources").checked,
    materials: materials.filter((m) => $("material-" + m).checked).map((m) => ({ code: m, rows: Number($("rows-" + m).value) }))
  };
}
function preview() {
  try {
    const q = quote(cart());
    $("preview-price").textContent = money(q.total);
    $("preview-lines").replaceChildren(
      ...q.lines.map((l) => {
        const n = el2("div", "");
        n.className = "portal-line";
        n.append(
          el2("span", l.name + (l.quantity > 1 ? " \xD7 " + l.quantity : "")),
          el2("strong", money(l.unit * l.quantity))
        );
        return n;
      })
    );
    $("scope-warning").textContent = q.scopeReview.join(" ") + (q.lines.some((l) => unavailableSkus.includes(l.sku)) ? " This add-on is currently unavailable for payment; other packages remain available for review." : "");
    $("create-order").disabled = !enabled || !applicationMode && q.scopeReview.length > 0 || !challenge || applicationMode && !$("application-consent").checked;
    $("package-info").textContent = `${q.days} business days after complete usable inputs and scope confirmation. Required: ${q.required.join(", ")}.`;
    return q;
  } catch (err) {
    $("scope-warning").textContent = err.message.replaceAll(
      "_",
      " "
    );
    $("create-order").disabled = true;
  }
}
function packageChanged() {
  const p = packages.find((x) => x.sku === $("package").value);
  const update = p.sku.startsWith("update");
  $("activities").value = p.activities;
  $("materials").hidden = !p.resources;
  $("existing-label").hidden = !(update && p.resources);
  $("date-label").hidden = !update;
  $("date-label").querySelector("input").required = update;
  $("revision-label").hidden = p.sku === "p6_audit";
  $("revisions").value = "0";
  for (const m of materials) $("material-" + m).checked = false;
  preview();
}
function tick() {
  if (!$("countdown") || !session) return;
  const seconds = Math.max(
    0,
    session.expiresAt - Math.floor(Date.now() / 1e3) - offset
  );
  $("countdown").textContent = seconds ? `Files accessible for ${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m ${seconds % 60}s` : "File access expired. Payment never extends retention.";
  if (!seconds) {
    if ($("checkout")) $("checkout").disabled = true;
    if ($("upload-file")) $("upload-file").disabled = true;
  }
}
async function files() {
  const data = await api2(route("files"));
  $("file-list").replaceChildren(
    ...data.files.map((f) => {
      const li = el2(
        "li",
        `${f.name} \xB7 ${Math.ceil(f.bytes / 1024)} KiB \xB7 ${f.category} `
      );
      const b = el2("button", "Remove");
      b.type = "button";
      b.addEventListener("click", async () => {
        try {
          await api2(route("files/" + f.id), "DELETE");
          await files();
        } catch (e) {
          notice(e.message);
        }
      });
      li.append(b);
      return li;
    })
  );
}
async function workspace() {
  if (!session) return;
  const status2 = await api2(route("status"));
  offset = status2.serverTime - Math.floor(Date.now() / 1e3);
  session.expiresAt = status2.expiresAt;
  session.required = status2.required;
  session.paid = status2.paid;
  save(session);
  tick();
  if (!["DRAFT"].includes(status2.status)) {
    notice(
      `Order ${status2.orderId}: ${status2.status.replaceAll("_", " ")}. Check your verified status before another payment.`
    );
    if (status2.status !== "DRAFT") {
      const link = el2("a", "View verified status");
      link.href = "/payment/success/";
      $("upload-panel")?.before(link);
      return;
    }
  }
  $("configure-form").hidden = true;
  $("upload-panel").hidden = false;
  $("order-reference").textContent = "Order " + session.orderId;
  $("required-documents").textContent = "Required categories: " + (session.required || []).join(", ");
  await files();
}
function invoiceButton(path, admin = false) {
  const b = el2("button", "Download PDF invoice");
  b.className = "button";
  b.onclick = async () => {
    b.disabled = true;
    try {
      const headers = admin ? {} : { Authorization: "Bearer " + session.token };
      const r = await fetch(API_ORIGIN + path, {
        headers,
        credentials: admin ? "include" : "omit",
        cache: "no-store"
      });
      if (!r.ok || !r.headers.get("Content-Type")?.includes("application/pdf"))
        throw Error(
          "Invoice unavailable; contact support with your order reference."
        );
      const u = URL.createObjectURL(await r.blob()), a = document.createElement("a");
      a.href = u;
      a.download = "Bluefin-Tuna-invoice.pdf";
      a.click();
      setTimeout(() => URL.revokeObjectURL(u), 1e3);
    } catch (e) {
      notice(e.message);
    } finally {
      b.disabled = false;
    }
  };
  return b;
}
async function status() {
  if (!session) {
    notice(
      "No access code is present in this browser. Resume your workspace using your private code."
    );
    return;
  }
  const s = await api2(route("status"));
  offset = s.serverTime - Math.floor(Date.now() / 1e3);
  session.expiresAt = s.expiresAt;
  save(session);
  notice(
    `${s.paid ? "Payment verified. " + (s.paidTotal == null ? "" : money(s.paidTotal) + " paid including " + money(s.paidTax ?? 0) + " tax. ") : "Payment not yet verified. "}${s.status.replaceAll("_", " ")} \xB7 ${s.orderId}`
  );
  $("request-reupload").hidden = !s.canRequestReupload;
  document.getElementById("customer-invoice")?.remove();
  if (s.portalInvoice && s.serverTime < s.expiresAt) {
    const b = invoiceButton(route("invoice"));
    b.id = "customer-invoice";
    $("request-reupload").parentElement?.append(b);
  }
  tick();
}
async function start() {
  if (API_ORIGIN && location.hostname === "bluefintuna.life") {
    location.replace(
      API_ORIGIN + location.pathname + location.search + location.hash
    );
    return;
  }
  if ($("configure-form")) {
    $("package").replaceChildren(
      ...packages.map((p) => {
        const o = el2(
          "option",
          p.name + " \xB7 " + money(p.cents)
        );
        o.value = p.sku;
        return o;
      })
    );
    const selected = new URLSearchParams(location.search).get("sku");
    if (packages.some((p) => p.sku === selected)) $("package").value = selected;
    $("material-options").replaceChildren(
      ...materials.map((m) => {
        const row = el2("div", "");
        row.className = "material-row";
        const label = el2("label", m.replaceAll("_", " "));
        const input2 = document.createElement("input");
        input2.type = "checkbox";
        input2.id = "material-" + m;
        label.prepend(input2);
        const rows = el2("label", "BOQ rows");
        const count = document.createElement("input");
        count.type = "number";
        count.min = "1";
        count.max = "10000";
        count.value = "1";
        count.id = "rows-" + m;
        rows.append(count);
        row.append(label, rows);
        return row;
      })
    );
    for (const c of [
      "xer",
      "baseline",
      "progress",
      "boq",
      "drawings",
      "scope",
      "resources",
      "materials"
    ]) {
      const option = el2("option", c);
      option.value = c;
      $("file-category").append(option);
    }
    $("package").addEventListener("change", packageChanged);
    $("configure-form").addEventListener("input", preview);
    packageChanged();
    $("configure-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      $("create-order").disabled = true;
      try {
        const form = new FormData($("configure-form"));
        if (applicationMode) {
          const q = quote(cart());
          const quoteHash = Array.from(
            new Uint8Array(
              await crypto.subtle.digest(
                "SHA-256",
                new TextEncoder().encode(JSON.stringify(q))
              )
            ),
            (n) => n.toString(16).padStart(2, "0")
          ).join("");
          const customer = {};
          for (const key of [
            "name",
            "email",
            "project",
            "dataDate",
            "businessName",
            "billingCountry",
            "billingState",
            "billingAddress",
            "billingCity",
            "billingPostal",
            "projectCountry"
          ])
            customer[key] = String(form.get(key) || "");
          customer.businessUse = $("business-use").checked;
          const r2 = await api2("/api/v1/applications", "POST", {
            cart: cart(),
            customer,
            turnstileToken: challenge,
            acceptance: {
              accepted: $("application-consent").checked,
              version: AGREEMENT_VERSION,
              hash: AGREEMENT_HASH,
              quoteHash
            }
          });
          notice(
            `Request ${r2.applicationId} saved. Online checkout is temporarily unavailable, so no payment has been taken. Please keep this reference. We will contact you at the supplied email.`
          );
          $("configure-form").hidden = true;
          $("portal-notice").scrollIntoView({
            behavior: "smooth",
            block: "center"
          });
          return;
        }
        const r = await api2("/api/v1/orders", "POST", {
          cart: cart(),
          customer: {
            name: form.get("name"),
            email: form.get("email"),
            project: form.get("project"),
            dataDate: form.get("dataDate") || ""
          },
          turnstileToken: challenge
        });
        save({ ...r, required: r.quote.required });
        await workspace();
        notice("Secure session created. The 12-hour clock has started.");
      } catch (e) {
        notice(e.message);
      } finally {
        challenge = "";
        window.turnstile?.reset();
        preview();
      }
    });
    $("resume-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const [orderId, token] = $("resume-code").value.trim().split(".");
      if (!/^[a-f0-9-]{36}$/.test(orderId) || !/^[a-f0-9]{64}$/.test(token)) {
        notice("Invalid private access code.");
        return;
      }
      save({ orderId, token });
      try {
        await workspace();
      } catch (e) {
        notice(e.message);
      }
    });
    $("copy-access").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(code());
        notice("Private access code copied. Store it securely.");
      } catch {
        notice(
          "Clipboard unavailable. Keep this browser session open; contact the operator for verified recovery."
        );
      }
    });
    $("upload-file").addEventListener("click", () => {
      const f = $("file-input").files[0];
      if (!f) {
        notice("Choose a file first.");
        return;
      }
      if (f.size > 20 * 1024 * 1024) {
        notice("File exceeds 20 MiB.");
        return;
      }
      $("upload-file").disabled = true;
      $("review-order").disabled = true;
      $("cancel-upload").disabled = false;
      const x = new XMLHttpRequest();
      activeXHR = x;
      x.open("POST", API_ORIGIN + route("files"));
      x.setRequestHeader("Authorization", "Bearer " + session.token);
      x.setRequestHeader(
        "Content-Type",
        f.name.toLowerCase().endsWith(".xer") ? "text/plain" : f.type || "application/octet-stream"
      );
      x.setRequestHeader("X-File-Name", encodeURIComponent(f.name));
      x.setRequestHeader("X-File-Category", $("file-category").value);
      x.upload.onprogress = (e) => {
        $("upload-progress").value = e.lengthComputable ? e.loaded / e.total * 100 : 0;
      };
      x.onload = async () => {
        let reason = "Service unavailable or access denied. Retry after checking your workspace.";
        try {
          reason = JSON.parse(x.responseText).error || reason;
        } catch {
        }
        notice(
          x.status >= 200 && x.status < 300 ? "Upload completed." : "Upload rejected. " + reason
        );
        await files().catch((e) => notice(e.message));
      };
      x.onerror = () => notice(
        "Upload interrupted. Retry this file; quotas and retention still apply."
      );
      x.onabort = () => notice("Upload cancelled. Any incomplete object will be cleaned up.");
      x.onloadend = () => {
        activeXHR = null;
        $("upload-file").disabled = false;
        $("review-order").disabled = false;
        $("cancel-upload").disabled = true;
        tick();
      };
      x.send(f);
    });
    $("cancel-upload").addEventListener("click", () => activeXHR?.abort());
    $("review-order").addEventListener("click", async () => {
      try {
        serverQuote = await api2(route("quote"), "POST", {});
        $("review-panel").hidden = false;
        $("consent").checked = false;
        const lineItems = el2("ul", "");
        for (const line of serverQuote.lines)
          lineItems.append(
            el2(
              "li",
              `${line.quantity} \xD7 ${line.name} \u2014 ${money(line.unit * line.quantity)}`
            )
          );
        $("server-summary").replaceChildren(
          el2(
            "p",
            `Agreement version: ${serverQuote.termsVersion} \xB7 ${serverQuote.agreementStatus}. One project / one reporting period where applicable.`
          ),
          el2(
            "p",
            `${serverQuote.cart.activities} requested activities; ${serverQuote.cart.revisions} additional in-scope revisions. Proposed turnaround: ${serverQuote.days} business days after complete inputs are accepted and scope is confirmed.`
          ),
          lineItems,
          el2(
            "p",
            `Server subtotal: ${money(serverQuote.total)} USD before applicable tax. ${serverQuote.missing.length ? "Missing: " + serverQuote.missing.join(", ") : "Required document categories received; usability and scope still require review."}`
          )
        );
        if (serverQuote.scopeApproved) {
          const c = serverQuote.reviewedBilling;
          $("server-summary").append(
            el2(
              "p",
              `Approved billing address: ${c.billingAddress}, ${c.billingCity}, ${c.billingState} ${c.billingPostal}, ${c.billingCountry}. Use this exact address at Checkout. A change requires a new review; any temporary card authorization is released without collection.`
            )
          );
        }
        $("checkout").hidden = !!session.paid;
        $("consent").closest("label").hidden = !!session.paid;
        if (session.paid && !serverQuote.missing.length) {
          notice(
            "Re-upload received. Your existing payment is verified; no further payment is required."
          );
          return;
        }
        $("checkout").disabled = serverQuote.missing.length > 0 || !$("consent").checked;
        notice("Review your server-verified quote.");
      } catch (e) {
        notice(e.message);
      }
    });
    $("consent").addEventListener("change", () => {
      $("checkout").disabled = !serverQuote || serverQuote.missing.length > 0 || !$("consent").checked;
      tick();
    });
    $("checkout").addEventListener("click", async () => {
      $("checkout").disabled = true;
      try {
        const r = await api2(route("checkout"), "POST", {
          quoteHash: serverQuote.quoteHash,
          consent: $("consent").checked,
          termsVersion: serverQuote.termsVersion
        });
        const u = new URL(r.url);
        if (u.protocol !== "https:" || u.hostname !== "checkout.stripe.com")
          throw Error("Unexpected checkout destination");
        location.assign(u.href);
      } catch (e) {
        notice(e.message);
        $("checkout").disabled = !$("consent").checked;
      }
    });
  }
  if ($("refresh-status")) {
    $("refresh-status").addEventListener(
      "click",
      () => status().catch((e) => notice(e.message))
    );
    $("request-reupload").addEventListener("click", async () => {
      try {
        const r = await api2(route("reupload"), "POST", {});
        notice(r.message);
      } catch (e) {
        notice(e.message);
      }
    });
    await status().catch((e) => notice(e.message));
    setInterval(() => {
      if (document.visibilityState === "visible")
        status().catch((e) => notice(e.message));
    }, 15e3);
  }
  if ($("load-admin")) adminUI();
  if (API_ORIGIN) {
    try {
      const health = await api2("/health");
      applicationMode = health.applicationsEnabled === true;
      unavailableSkus = health.unavailableSkus || [];
      const invite = new URLSearchParams(location.hash.slice(1)).get(
        "approved"
      );
      if (invite && $("configure-form")) {
        history.replaceState(null, "", location.pathname + location.search);
        const r = await api2("/api/v1/approved-orders/redeem", "POST", {
          invitation: invite
        });
        save({ ...r, required: r.quote.required });
      }
      enabled = health.enabled || applicationMode;
      if (applicationMode && $("configure-form")) {
        $("application-fields").hidden = false;
        $("application-fields").disabled = false;
        $("create-order").textContent = "Save request \u2014 no payment \u2197";
        $("business-use").addEventListener("change", () => {
          $("application-fields").querySelector(
            '[name="businessName"]'
          ).required = $("business-use").checked;
        });
        $("resume-form").closest("details").hidden = !health.reviewedOrdersEnabled;
        const steps = document.querySelector(".portal-steps");
        if (steps)
          steps.replaceChildren(
            el2("li", "01 \xB7 Select scope"),
            el2("li", "02 \xB7 Billing & project facts"),
            el2("li", "03 \xB7 Save request")
          );
      }
      if (applicationMode && $("load-admin")) {
        const button2 = el2("a", "Open protected application inbox \u2197");
        button2.href = API_ORIGIN + "/admin/applications/";
        button2.className = "button";
        $("load-admin").before(button2);
      }
      notice(
        applicationMode && $("load-admin") ? "Project requests are open. Customer payments and file intake are closed. Protected administration and Drive setup remain available." : applicationMode ? "Online checkout is temporarily unavailable. You can save your project request below; submitting this form will not take a payment. File uploads are also unavailable." : enabled ? `${health.mode === "test" ? "TEST MODE \xB7 synthetic data only. " : "Portal available. "}Files are private and time-limited.` : $("load-admin") ? "Customer orders and payments are closed. Authorized administrators can connect Drive below." : "The secure portal is not enabled. Uploads and payments remain unavailable."
      );
      if (enabled && $("configure-form") && TURNSTILE_SITE_KEY) {
        const script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.onload = () => {
          window.turnstile.render("#challenge", {
            sitekey: TURNSTILE_SITE_KEY,
            action: "create-order",
            callback: (t) => {
              challenge = t;
              preview();
            },
            "expired-callback": () => {
              challenge = "";
              preview();
            }
          });
        };
        document.head.append(script);
      }
      if (session && (!applicationMode || session.approvedApplication) && $("configure-form"))
        await workspace();
    } catch (e) {
      notice(
        "Secure service unavailable. No payment or upload has been started. " + e.message
      );
    }
  }
  setInterval(tick, 1e3);
}
function adminUI() {
  setupDriveAdmin(API_ORIGIN, $("load-admin").parentElement);
  let orders = [], before, cursorId;
  const draw = () => {
    const term = $("admin-search").value.toLowerCase();
    $("admin-orders").replaceChildren(
      ...orders.filter((o) => (o.id + " " + o.sku).includes(term)).map((o) => {
        const b = el2(
          "button",
          `${o.sku} \xB7 ${money(o.paid_total ?? o.subtotal)} ${o.paid_total == null ? "subtotal" : "paid"} \xB7 ${o.status} \xB7 ${o.id}`
        );
        b.className = "portal-panel";
        b.addEventListener(
          "click",
          () => detail(o.id).catch((e) => notice(e.message))
        );
        return b;
      })
    );
  };
  const load = async () => {
    try {
      const r = await api2(
        "/api/v1/admin/orders" + (before ? "?before=" + before + "&cursorId=" + encodeURIComponent(cursorId || "") : ""),
        "GET",
        void 0,
        true
      );
      orders.push(...r.orders);
      before = r.orders.at(-1)?.created_at;
      cursorId = r.orders.at(-1)?.id;
      $("more-admin").hidden = r.orders.length < 50;
      draw();
      const health = await api2(
        "/api/v1/admin/operations",
        "GET",
        void 0,
        true
      );
      $("admin-operations").textContent = health.alerts.length ? "Operator attention: " + health.alerts.join(", ").replaceAll("_", " ") : "Cleanup and notification checks are healthy.";
      notice(
        "Protected order data loaded. Mark retrieved only after verifying all copies in approved working storage."
      );
    } catch (e) {
      notice(
        "Cloudflare Access sign-in is required on the API domain. " + e.message
      );
    }
  };
  async function detail(id) {
    const o = await api2("/api/v1/admin/orders/" + id, "GET", void 0, true);
    const panel = $("admin-detail");
    panel.hidden = false;
    panel.replaceChildren(
      el2("h2", o.sku),
      el2("p", o.id + " \xB7 " + o.status),
      el2(
        "p",
        o.parentId ? "Re-upload for " + o.parentId + ". Existing payment; no new charge." : "Original order"
      ),
      el2(
        "p",
        `${o.cart.activities} activities \xB7 ${o.paidTotal == null ? "Subtotal " + money(o.subtotal) : "Verified paid total " + money(o.paidTotal) + " (tax " + money(o.paidTax ?? 0) + ")"}`
      ),
      el2(
        "p",
        o.portalInvoice ? "Verified portal PDF invoice available. Original financial evidence is immutable." : o.invoiceId ? "Stripe invoice reference: " + o.invoiceId : "No verified invoice reference recorded. Check Stripe before promising a PDF invoice."
      ),
      el2(
        "p",
        o.retrievedAt ? "Operator confirmed retrieval: " + new Date(o.retrievedAt * 1e3).toISOString() : "Retrieval not confirmed. Download and scan every file, verify working copies, then mark retrieved."
      ),
      el2(
        "p",
        "Files inaccessible after " + new Date(o.expiresAt * 1e3).toISOString()
      )
    );
    if (o.portalInvoice)
      panel.append(invoiceButton(`/api/v1/admin/orders/${id}/invoice`, true));
    for (const f of o.files) {
      const b = el2("button", `Download ${f.name}`);
      b.className = "button";
      b.disabled = !o.paid;
      b.addEventListener("click", async () => {
        try {
          const r = await fetch(
            API_ORIGIN + `/api/v1/admin/orders/${id}/files/${f.id}`,
            { credentials: "include", cache: "no-store" }
          );
          if (!r.ok) throw Error("Download denied or expired");
          const u = URL.createObjectURL(await r.blob());
          const a = document.createElement("a");
          a.href = u;
          a.download = f.name;
          a.click();
          setTimeout(() => URL.revokeObjectURL(u), 1e3);
        } catch (e) {
          notice(e.message);
        }
      });
      panel.append(b);
    }
    for (const action of ["mark-retrieved", "issue-reupload"]) {
      const b = el2("button", action.replaceAll("-", " "));
      b.className = "button secondary";
      b.addEventListener("click", async () => {
        try {
          const r = await api2(
            `/api/v1/admin/orders/${id}/actions`,
            "POST",
            { action },
            true
          );
          panel.append(
            el2(
              "p",
              r.token ? `Private re-upload access code: ${r.orderId}.${r.token}. Share only via a verified private channel.` : "Action recorded."
            )
          );
        } catch (e) {
          notice(e.message);
        }
      });
      panel.append(b);
    }
    await showDeliveryAdmin(API_ORIGIN, id, panel);
  }
  $("load-admin").addEventListener("click", () => {
    orders = [];
    before = void 0;
    load();
  });
  $("more-admin").addEventListener("click", load);
  $("admin-search").addEventListener("input", draw);
}
start().catch((e) => notice(e.message));
window.addEventListener("pageshow", () => {
  const consent = document.getElementById("consent");
  const checkout = document.getElementById(
    "checkout"
  );
  if (consent) consent.checked = false;
  const applicationConsent = $("application-consent");
  if (applicationConsent) applicationConsent.checked = false;
  if (checkout) checkout.disabled = true;
});
