import { AGREEMENT_HASH } from "../cloudflare/worker/src/agreement";
import { setupDriveAdmin, showDeliveryAdmin } from "./delivery-admin";
import {
  packages,
  materials,
  quote,
  TERMS,
} from "../cloudflare/worker/src/catalog";
// Public deployment settings, no secrets.
import {
  API_ORIGIN,
  TURNSTILE_SITE_KEY,
} from "../assets/scripts/portal-config.js";
const $ = (id: string) => document.getElementById(id) as any;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text: string) => {
  const n = document.createElement(tag);
  n.textContent = text;
  return n;
};
const money = (c: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    c / 100,
  );
let session: any = null,
  serverQuote: any = null,
  activeXHR: XMLHttpRequest | null = null,
  enabled = false,
  applicationMode = false,
  challenge = "",
  offset = 0;
try {
  session = JSON.parse(sessionStorage.getItem("bluefin-session") || "null");
} catch {}
function notice(message: string) {
  const n = $("portal-notice") || $("status-message");
  if (n) n.textContent = message;
}
function save(s: any) {
  session = s;
  sessionStorage.setItem("bluefin-session", JSON.stringify(s));
}
function code() {
  return session.orderId + "." + session.token;
}
async function api(
  path: string,
  method = "GET",
  body?: unknown,
  admin = false,
) {
  if (!API_ORIGIN) throw Error("Preview only. The secure API is not enabled.");
  const r = await fetch(API_ORIGIN + path, {
    method,
    credentials: admin ? "include" : "omit",
    headers: {
      ...(session && !admin
        ? { Authorization: "Bearer " + session.token }
        : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  let data: any;
  try {
    data = await r.json();
  } catch {
    throw Error(
      "API unavailable or sign-in required. No payment has been confirmed.",
    );
  }
  if (!r.ok)
    throw Error(String(data.error || "Request failed").replaceAll("_", " "));
  return data;
}
const route = (suffix: string) => `/api/v1/orders/${session.orderId}/${suffix}`;
function cart() {
  return {
    sku: $("package").value,
    activities: Number($("activities").value),
    revisions: Number($("revisions").value),
    existingResources: $("existing-resources").checked,
    materials: materials
      .filter((m) => $("material-" + m).checked)
      .map((m) => ({ code: m, rows: Number($("rows-" + m).value) })),
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
          el("span", l.name + (l.quantity > 1 ? " × " + l.quantity : "")),
          el("strong", money(l.unit * l.quantity)),
        );
        return n;
      }),
    );
    $("scope-warning").textContent = q.scopeReview.join(" ");
    $("create-order").disabled =
      !enabled ||
      (!applicationMode && q.scopeReview.length > 0) ||
      !challenge ||
      (applicationMode && !$("application-consent").checked);
    $("package-info").textContent =
      `${q.days} business days after complete usable inputs and scope confirmation. Required: ${q.required.join(", ")}.`;
    return q;
  } catch (err) {
    $("scope-warning").textContent = (err as Error).message.replaceAll(
      "_",
      " ",
    );
    $("create-order").disabled = true;
  }
}
function packageChanged() {
  const p = packages.find((x) => x.sku === $("package").value)!;
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
    session.expiresAt - Math.floor(Date.now() / 1000) - offset,
  );
  $("countdown").textContent = seconds
    ? `Files accessible for ${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ${seconds % 60}s`
    : "File access expired. Payment never extends retention.";
  if (!seconds) {
    if ($("checkout")) $("checkout").disabled = true;
    if ($("upload-file")) $("upload-file").disabled = true;
  }
}
async function files() {
  const data = await api(route("files"));
  $("file-list").replaceChildren(
    ...data.files.map((f: any) => {
      const li = el(
        "li",
        `${f.name} · ${Math.ceil(f.bytes / 1024)} KiB · ${f.category} `,
      );
      const b = el("button", "Remove");
      b.type = "button";
      b.addEventListener("click", async () => {
        try {
          await api(route("files/" + f.id), "DELETE");
          await files();
        } catch (e) {
          notice((e as Error).message);
        }
      });
      li.append(b);
      return li;
    }),
  );
}
async function workspace() {
  if (!session) return;
  const status = await api(route("status"));
  offset = status.serverTime - Math.floor(Date.now() / 1000);
  session.expiresAt = status.expiresAt;
  session.required = status.required;
  session.paid = status.paid;
  save(session);
  tick();
  if (!["DRAFT"].includes(status.status)) {
    notice(
      `Order ${status.orderId}: ${status.status.replaceAll("_", " ")}. Check your verified status before another payment.`,
    );
    if (status.status !== "DRAFT") {
      const link = el("a", "View verified status");
      link.href = "/payment/success/";
      $("upload-panel")?.before(link);
      return;
    }
  }
  $("configure-form").hidden = true;
  $("upload-panel").hidden = false;
  $("order-reference").textContent = "Order " + session.orderId;
  $("required-documents").textContent =
    "Required categories: " + (session.required || []).join(", ");
  await files();
}
async function status() {
  if (!session) {
    notice(
      "No access code is present in this browser. Resume your workspace using your private code.",
    );
    return;
  }
  const s = await api(route("status"));
  offset = s.serverTime - Math.floor(Date.now() / 1000);
  session.expiresAt = s.expiresAt;
  save(session);
  notice(
    `${s.paid ? "Payment verified. " + (s.paidTotal == null ? "" : money(s.paidTotal) + " paid including " + money(s.paidTax ?? 0) + " tax. ") : "Payment not yet verified. "}${s.status.replaceAll("_", " ")} · ${s.orderId}`,
  );
  $("request-reupload").hidden = !s.canRequestReupload;
  tick();
}
async function start() {
  if (API_ORIGIN && location.hostname === "bluefintuna.life") {
    location.replace(
      API_ORIGIN + location.pathname + location.search + location.hash,
    );
    return;
  }
  if ($("configure-form")) {
    $("package").replaceChildren(
      ...packages.map((p) => {
        const o = el(
          "option",
          p.name + " · " + money(p.cents),
        ) as HTMLOptionElement;
        o.value = p.sku;
        return o;
      }),
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
      }),
    );
    for (const c of [
      "xer",
      "baseline",
      "progress",
      "boq",
      "drawings",
      "scope",
      "resources",
      "materials",
    ]) {
      const option = el("option", c) as HTMLOptionElement;
      option.value = c;
      $("file-category").append(option);
    }
    $("package").addEventListener("change", packageChanged);
    $("configure-form").addEventListener("input", preview);
    packageChanged();
    $("configure-form").addEventListener("submit", async (ev: Event) => {
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
                new TextEncoder().encode(JSON.stringify(q)),
              ),
            ),
            (n) => n.toString(16).padStart(2, "0"),
          ).join("");
          const customer: any = {};
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
            "projectCountry",
          ])
            customer[key] = String(form.get(key) || "");
          customer.businessUse = $("business-use").checked;
          const r = await api("/api/v1/applications", "POST", {
            cart: cart(),
            customer,
            turnstileToken: challenge,
            acceptance: {
              accepted: $("application-consent").checked,
              version: TERMS,
              hash: AGREEMENT_HASH,
              quoteHash,
            },
          });
          notice(
            `Request ${r.applicationId} saved. Online checkout is temporarily unavailable, so no payment has been taken. Please keep this reference. We will contact you at the supplied email.`,
          );
          $("configure-form").hidden = true;
          $("portal-notice").scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
          return;
        }
        const r = await api("/api/v1/orders", "POST", {
          cart: cart(),
          customer: {
            name: form.get("name"),
            email: form.get("email"),
            project: form.get("project"),
            dataDate: form.get("dataDate") || "",
          },
          turnstileToken: challenge,
        });
        save({ ...r, required: r.quote.required });
        await workspace();
        notice("Secure session created. The 12-hour clock has started.");
      } catch (e) {
        notice((e as Error).message);
      } finally {
        challenge = "";
        (window as any).turnstile?.reset();
        preview();
      }
    });
    $("resume-form").addEventListener("submit", async (ev: Event) => {
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
        notice((e as Error).message);
      }
    });
    $("copy-access").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(code());
        notice("Private access code copied. Store it securely.");
      } catch {
        notice(
          "Clipboard unavailable. Keep this browser session open; contact the operator for verified recovery.",
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
        f.name.toLowerCase().endsWith(".xer")
          ? "text/plain"
          : f.type || "application/octet-stream",
      );
      x.setRequestHeader("X-File-Name", encodeURIComponent(f.name));
      x.setRequestHeader("X-File-Category", $("file-category").value);
      x.upload.onprogress = (e) => {
        $("upload-progress").value = e.lengthComputable
          ? (e.loaded / e.total) * 100
          : 0;
      };
      x.onload = async () => {
        let reason =
          "Service unavailable or access denied. Retry after checking your workspace.";
        try {
          reason = JSON.parse(x.responseText).error || reason;
        } catch {}
        notice(
          x.status >= 200 && x.status < 300
            ? "Upload completed."
            : "Upload rejected. " + reason,
        );
        await files().catch((e) => notice(e.message));
      };
      x.onerror = () =>
        notice(
          "Upload interrupted. Retry this file; quotas and retention still apply.",
        );
      x.onabort = () =>
        notice("Upload cancelled. Any incomplete object will be cleaned up.");
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
        $("consent").checked = false;
        const lineItems = el("ul", "");
        for (const line of serverQuote.lines)
          lineItems.append(
            el(
              "li",
              `${line.quantity} × ${line.name} — ${money(line.unit * line.quantity)}`,
            ),
          );
        $("server-summary").replaceChildren(
          el(
            "p",
            `Agreement version: ${serverQuote.termsVersion} · ${serverQuote.agreementStatus}. One project / one reporting period where applicable.`,
          ),
          el(
            "p",
            `${serverQuote.cart.activities} requested activities; ${serverQuote.cart.revisions} additional in-scope revisions. Proposed turnaround: ${serverQuote.days} business days after complete inputs are accepted and scope is confirmed.`,
          ),
          lineItems,
          el(
            "p",
            `Server subtotal: ${money(serverQuote.total)} USD before applicable tax. ${serverQuote.missing.length ? "Missing: " + serverQuote.missing.join(", ") : "Required document categories received; usability and scope still require review."}`,
          ),
        );
        $("checkout").hidden = !!session.paid;
        $("consent").closest("label").hidden = !!session.paid;
        if (session.paid && !serverQuote.missing.length) {
          notice(
            "Re-upload received. Your existing payment is verified; no further payment is required.",
          );
          return;
        }
        $("checkout").disabled =
          serverQuote.missing.length > 0 || !$("consent").checked;
        notice("Review your server-verified quote.");
      } catch (e) {
        notice((e as Error).message);
      }
    });
    $("consent").addEventListener("change", () => {
      $("checkout").disabled =
        !serverQuote || serverQuote.missing.length > 0 || !$("consent").checked;
      tick();
    });
    $("checkout").addEventListener("click", async () => {
      $("checkout").disabled = true;
      try {
        const r = await api(route("checkout"), "POST", {
          quoteHash: serverQuote.quoteHash,
          consent: $("consent").checked,
          termsVersion: serverQuote.termsVersion,
        });
        const u = new URL(r.url);
        if (u.protocol !== "https:" || u.hostname !== "checkout.stripe.com")
          throw Error("Unexpected checkout destination");
        location.assign(u.href);
      } catch (e) {
        notice((e as Error).message);
        $("checkout").disabled = !$("consent").checked;
      }
    });
  }
  if ($("refresh-status")) {
    $("refresh-status").addEventListener("click", () =>
      status().catch((e) => notice(e.message)),
    );
    $("request-reupload").addEventListener("click", async () => {
      try {
        const r = await api(route("reupload"), "POST", {});
        notice(r.message);
      } catch (e) {
        notice((e as Error).message);
      }
    });
    await status().catch((e) => notice(e.message));
    setInterval(() => {
      if (document.visibilityState === "visible")
        status().catch((e) => notice(e.message));
    }, 15000);
  }
  if ($("load-admin")) adminUI();
  if (API_ORIGIN) {
    try {
      const health = await api("/health");
      applicationMode = health.applicationsEnabled === true;
      enabled = health.enabled || applicationMode;
      if (applicationMode && $("configure-form")) {
        $("application-fields").hidden = false;
        $("application-fields").disabled = false;
        $("create-order").textContent = "Save request — no payment ↗";
        $("business-use").addEventListener("change", () => {
          $("application-fields").querySelector(
            '[name="businessName"]',
          ).required = $("business-use").checked;
        });
        $("resume-form").closest("details").hidden = true;
        const steps = document.querySelector(".portal-steps");
        if (steps)
          steps.replaceChildren(
            el("li", "01 · Select scope"),
            el("li", "02 · Billing & project facts"),
            el("li", "03 · Save request"),
          );
      }
      if (applicationMode && $("load-admin")) {
        const button = el("a", "Open protected application inbox ↗");
        button.href = API_ORIGIN + "/admin/applications/";
        button.className = "button";
        $("load-admin").before(button);
      }
      notice(
        applicationMode && $("load-admin")
          ? "Project requests are open. Customer payments and file intake are closed. Protected administration and Drive setup remain available."
          : applicationMode
            ? "Online checkout is temporarily unavailable. You can save your project request below; submitting this form will not take a payment. File uploads are also unavailable."
            : enabled
              ? `${health.mode === "test" ? "TEST MODE · synthetic data only. " : "Portal available. "}Files are private and time-limited.`
              : $("load-admin")
                ? "Customer orders and payments are closed. Authorized administrators can connect Drive below."
                : "The secure portal is not enabled. Uploads and payments remain unavailable.",
      );
      if (enabled && $("configure-form") && TURNSTILE_SITE_KEY) {
        const script = document.createElement("script");
        script.src =
          "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.onload = () => {
          (window as any).turnstile.render("#challenge", {
            sitekey: TURNSTILE_SITE_KEY,
            action: "create-order",
            callback: (t: string) => {
              challenge = t;
              preview();
            },
            "expired-callback": () => {
              challenge = "";
              preview();
            },
          });
        };
        document.head.append(script);
      }
      if (session && !applicationMode && $("configure-form")) await workspace();
    } catch (e) {
      notice(
        "Secure service unavailable. No payment or upload has been started. " +
          (e as Error).message,
      );
    }
  }
  setInterval(tick, 1000);
}
function adminUI() {
  setupDriveAdmin(API_ORIGIN, $("load-admin").parentElement!);
  let orders: any[] = [],
    before: number | undefined,
    cursorId: string | undefined;
  const draw = () => {
    const term = $("admin-search").value.toLowerCase();
    $("admin-orders").replaceChildren(
      ...orders
        .filter((o) => (o.id + " " + o.sku).includes(term))
        .map((o) => {
          const b = el(
            "button",
            `${o.sku} · ${money(o.paid_total ?? o.subtotal)} ${o.paid_total == null ? "subtotal" : "paid"} · ${o.status} · ${o.id}`,
          );
          b.className = "portal-panel";
          b.addEventListener("click", () =>
            detail(o.id).catch((e) => notice(e.message)),
          );
          return b;
        }),
    );
  };
  const load = async () => {
    try {
      const r = await api(
        "/api/v1/admin/orders" +
          (before
            ? "?before=" +
              before +
              "&cursorId=" +
              encodeURIComponent(cursorId || "")
            : ""),
        "GET",
        undefined,
        true,
      );
      orders.push(...r.orders);
      before = r.orders.at(-1)?.created_at;
      cursorId = r.orders.at(-1)?.id;
      $("more-admin").hidden = r.orders.length < 50;
      draw();
      const health = await api(
        "/api/v1/admin/operations",
        "GET",
        undefined,
        true,
      );
      $("admin-operations").textContent = health.alerts.length
        ? "Operator attention: " + health.alerts.join(", ").replaceAll("_", " ")
        : "Cleanup and notification checks are healthy.";
      notice(
        "Protected order data loaded. Mark retrieved only after verifying all copies in approved working storage.",
      );
    } catch (e) {
      notice(
        "Cloudflare Access sign-in is required on the API domain. " +
          (e as Error).message,
      );
    }
  };
  async function detail(id: string) {
    const o = await api("/api/v1/admin/orders/" + id, "GET", undefined, true);
    const panel = $("admin-detail");
    panel.hidden = false;
    panel.replaceChildren(
      el("h2", o.sku),
      el("p", o.id + " · " + o.status),
      el(
        "p",
        o.parentId
          ? "Re-upload for " + o.parentId + ". Existing payment; no new charge."
          : "Original order",
      ),
      el(
        "p",
        `${o.cart.activities} activities · ${o.paidTotal == null ? "Subtotal " + money(o.subtotal) : "Verified paid total " + money(o.paidTotal) + " (tax " + money(o.paidTax ?? 0) + ")"}`,
      ),
      el(
        "p",
        o.invoiceId
          ? "Stripe invoice reference: " + o.invoiceId
          : "No verified invoice reference recorded. Check Stripe before promising a PDF invoice.",
      ),
      el(
        "p",
        o.retrievedAt
          ? "Operator confirmed retrieval: " +
              new Date(o.retrievedAt * 1000).toISOString()
          : "Retrieval not confirmed. Download and scan every file, verify working copies, then mark retrieved.",
      ),
      el(
        "p",
        "Files inaccessible after " +
          new Date(o.expiresAt * 1000).toISOString(),
      ),
    );
    for (const f of o.files) {
      const b = el("button", `Download ${f.name}`);
      b.className = "button";
      b.disabled = !o.paid;
      b.addEventListener("click", async () => {
        try {
          const r = await fetch(
            API_ORIGIN + `/api/v1/admin/orders/${id}/files/${f.id}`,
            { credentials: "include", cache: "no-store" },
          );
          if (!r.ok) throw Error("Download denied or expired");
          const u = URL.createObjectURL(await r.blob());
          const a = document.createElement("a");
          a.href = u;
          a.download = f.name;
          a.click();
          setTimeout(() => URL.revokeObjectURL(u), 1000);
        } catch (e) {
          notice((e as Error).message);
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
            true,
          );
          panel.append(
            el(
              "p",
              r.token
                ? `Private re-upload access code: ${r.orderId}.${r.token}. Share only via a verified private channel.`
                : "Action recorded.",
            ),
          );
        } catch (e) {
          notice((e as Error).message);
        }
      });
      panel.append(b);
    }
    await showDeliveryAdmin(API_ORIGIN, id, panel);
  }
  $("load-admin").addEventListener("click", () => {
    orders = [];
    before = undefined;
    load();
  });
  $("more-admin").addEventListener("click", load);
  $("admin-search").addEventListener("input", draw);
}
start().catch((e) => notice(e.message));

window.addEventListener("pageshow", () => {
  const consent = document.getElementById("consent") as HTMLInputElement | null;
  const checkout = document.getElementById(
    "checkout",
  ) as HTMLButtonElement | null;
  if (consent) consent.checked = false;
  const applicationConsent = $("application-consent");
  if (applicationConsent) applicationConsent.checked = false;
  if (checkout) checkout.disabled = true;
});
