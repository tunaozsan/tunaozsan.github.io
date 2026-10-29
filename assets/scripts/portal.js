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
var TERMS = "portal-draft-2026-10-29";
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
  const lines = [{ name: p.name, unit: p.cents, quantity: 1 }];
  if (blocks)
    lines.push({
      name: `Additional 50 activities (${p.resources ? "MH + cost" : "without resources"})`,
      unit: p.resources ? update ? 15e3 : 17500 : 1e4,
      quantity: blocks
    });
  for (const x of selected)
    lines.push({
      name: `Material: ${x.code.replaceAll("_", " ")} (${x.rows} BOQ rows)`,
      unit: update ? 11900 : 24900,
      quantity: 1
    });
  if (revisions)
    lines.push({
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
var API_ORIGIN = "";
var TURNSTILE_SITE_KEY = "";

// src/portal-client.ts
var $ = (id) => document.getElementById(id);
var el = (tag, text) => {
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
async function api(path, method = "GET", body, admin = false) {
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
        const n = el("div", "");
        n.className = "portal-line";
        n.append(
          el("span", l.name + (l.quantity > 1 ? " \xD7 " + l.quantity : "")),
          el("strong", money(l.unit * l.quantity))
        );
        return n;
      })
    );
    $("scope-warning").textContent = q.scopeReview.join(" ");
    $("create-order").disabled = !enabled || q.scopeReview.length > 0 || !challenge;
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
  const data = await api(route("files"));
  $("file-list").replaceChildren(
    ...data.files.map((f) => {
      const li = el(
        "li",
        `${f.name} \xB7 ${Math.ceil(f.bytes / 1024)} KiB \xB7 ${f.category} `
      );
      const b = el("button", "Remove");
      b.type = "button";
      b.addEventListener("click", async () => {
        try {
          await api(route("files/" + f.id), "DELETE");
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
  const status2 = await api(route("status"));
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
      const link = el("a", "View verified status");
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
async function status() {
  if (!session) {
    notice(
      "No access code is present in this browser. Resume your workspace using your private code."
    );
    return;
  }
  const s = await api(route("status"));
  offset = s.serverTime - Math.floor(Date.now() / 1e3);
  session.expiresAt = s.expiresAt;
  save(session);
  notice(
    `${s.paid ? "Payment verified. " + (s.paidTotal == null ? "" : money(s.paidTotal) + " paid including " + money(s.paidTax ?? 0) + " tax. ") : "Payment not yet verified. "}${s.status.replaceAll("_", " ")} \xB7 ${s.orderId}`
  );
  $("request-reupload").hidden = !s.canRequestReupload;
  tick();
}
async function start() {
  if ($("configure-form")) {
    $("package").replaceChildren(
      ...packages.map((p) => {
        const o = el(
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
        const row = el("div", "");
        row.className = "material-row";
        const label = el("label", m.replaceAll("_", " "));
        const input = document.createElement("input");
        input.type = "checkbox";
        input.id = "material-" + m;
        label.prepend(input);
        const rows = el("label", "BOQ rows");
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
      const option = el("option", c);
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
        const r = await api("/api/v1/orders", "POST", {
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
        serverQuote = await api(route("quote"), "POST", {});
        $("review-panel").hidden = false;
        $("server-summary").textContent = `Policy version: ${serverQuote.termsVersion}. Server subtotal: ${money(serverQuote.total)}. ${serverQuote.missing.length ? "Missing: " + serverQuote.missing.join(", ") : "Required document categories received; usability and scope still require review."}`;
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
        const r = await api(route("checkout"), "POST", {
          quoteHash: serverQuote.quoteHash,
          consent: $("consent").checked,
          termsVersion: TERMS
        });
        const u = new URL(r.url);
        if (u.protocol !== "https:" || u.hostname !== "checkout.stripe.com")
          throw Error("Unexpected checkout destination");
        location.assign(u.href);
      } catch (e) {
        notice(e.message);
        $("checkout").disabled = false;
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
        const r = await api(route("reupload"), "POST", {});
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
      const health = await api("/health");
      enabled = health.enabled;
      notice(
        enabled ? `${health.mode === "test" ? "TEST MODE \xB7 synthetic data only. " : "Portal available. "}Files are private and time-limited.` : "The secure portal is not enabled. Uploads and payments remain unavailable."
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
      if (session && $("configure-form")) await workspace();
    } catch (e) {
      notice(
        "Secure service unavailable. No payment or upload has been started. " + e.message
      );
    }
  }
  setInterval(tick, 1e3);
}
function adminUI() {
  let orders = [], before, cursorId;
  const draw = () => {
    const term = $("admin-search").value.toLowerCase();
    $("admin-orders").replaceChildren(
      ...orders.filter((o) => (o.id + " " + o.sku).includes(term)).map((o) => {
        const b = el(
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
      const r = await api(
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
      const health = await api(
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
    const o = await api("/api/v1/admin/orders/" + id, "GET", void 0, true);
    const panel = $("admin-detail");
    panel.hidden = false;
    panel.replaceChildren(
      el("h2", o.sku),
      el("p", o.id + " \xB7 " + o.status),
      el(
        "p",
        o.parentId ? "Re-upload for " + o.parentId + ". Existing payment; no new charge." : "Original order"
      ),
      el(
        "p",
        `${o.cart.activities} activities \xB7 ${o.paidTotal == null ? "Subtotal " + money(o.subtotal) : "Verified paid total " + money(o.paidTotal) + " (tax " + money(o.paidTax ?? 0) + ")"}`
      ),
      el(
        "p",
        o.invoiceId ? "Stripe invoice reference: " + o.invoiceId : "No verified invoice reference recorded. Check Stripe before promising a PDF invoice."
      ),
      el(
        "p",
        o.retrievedAt ? "Operator confirmed retrieval: " + new Date(o.retrievedAt * 1e3).toISOString() : "Retrieval not confirmed. Download and scan every file, verify working copies, then mark retrieved."
      ),
      el(
        "p",
        "Files inaccessible after " + new Date(o.expiresAt * 1e3).toISOString()
      )
    );
    for (const f of o.files) {
      const b = el("button", `Download ${f.name}`);
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
      const b = el("button", action.replaceAll("-", " "));
      b.className = "button secondary";
      b.addEventListener("click", async () => {
        try {
          const r = await api(
            `/api/v1/admin/orders/${id}/actions`,
            "POST",
            { action },
            true
          );
          panel.append(
            el(
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
