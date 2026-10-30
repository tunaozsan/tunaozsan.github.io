function el(tag: string, text: string) {
  const e = document.createElement(tag);
  e.textContent = text;
  return e;
}
async function api(origin: string, path: string, body?: unknown) {
  const r = await fetch(origin + path, {
    method: body ? "POST" : "GET",
    credentials: "include",
    cache: "no-store",
    redirect: "error",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => {
    throw Error(
      "Connection failed or Access sign-in required. Click Sign in / renew admin session below, then retry Connect personal Drive. If it persists, check your network connection.",
    );
  });
  if (!r.headers.get("Content-Type")?.includes("application/json"))
    throw Error("Sign in to the staging Access application first.");
  const data = await r.json();
  if (!r.ok)
    throw Error(String(data.error || "request_failed").replaceAll("_", " "));
  return data;
}
function button(text: string, fn: () => Promise<void>, output: HTMLElement) {
  const b = el("button", text) as HTMLButtonElement;
  b.type = "button";
  b.className = "button secondary";
  b.addEventListener("click", async () => {
    b.disabled = true;
    try {
      await fn();
    } catch (e) {
      output.textContent = (e as Error).message;
    } finally {
      b.disabled = false;
    }
  });
  return b;
}
function input(parent: HTMLElement, title: string, type = "text") {
  const l = el("label", title),
    i = document.createElement("input");
  i.type = type;
  l.append(i);
  parent.append(l);
  return i;
}
export function setupDriveAdmin(origin: string, parent: HTMLElement) {
  const section = el("section", "");
  section.className = "portal-panel";
  section.id = "drive-connection";
  const message = el("p", "Drive workspace is staged separately from intake.");
  message.setAttribute("role", "status");
  section.append(el("h2", "Private working storage"), message);
  const login = el("a", "Sign in / renew admin session") as HTMLAnchorElement;
  login.href = origin + "/api/v1/admin/drive/login";
  login.className = "button secondary";
  section.append(login);
  section.append(
    button(
      "Check Drive connection",
      async () => {
        const r = await api(origin, "/api/v1/admin/drive/status");
        message.textContent = `OAuth: ${r.oauth.status}. Drive enabled: ${r.enabled}. Delivery enabled: ${r.deliveryEnabled}. Synthetic staging policy gate: ${r.policyApproved} (not production legal approval).`;
        for (const old of section.querySelectorAll("[data-transfer-alert]"))
          old.remove();
        for (const alert of r.alerts || []) {
          const warning = el(
            "p",
            `TRANSFER ALERT · ${alert.order_id} · ${alert.state} · ${alert.error_code || "R2 expiry approaching"} · attempt ${alert.attempts}`,
          );
          warning.setAttribute("role", "alert");
          warning.dataset.transferAlert = "true";
          section.append(warning);
        }
      },
      message,
    ),
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
      message,
    ),
  );
  section.append(
    button(
      "Retry due transfers",
      async () => {
        await api(origin, "/api/v1/admin/drive/retry", {});
        message.textContent =
          "Due transfers checked. Review the order transfer statuses.";
      },
      message,
    ),
  );
  section.append(
    button(
      "Disconnect Drive authorization",
      async () => {
        if (
          !confirm(
            "Disconnect private storage? Pending transfers will require reauthorization. Existing files are not deleted.",
          )
        )
          return;
        await api(origin, "/api/v1/admin/drive/oauth/revoke", {});
        message.textContent = "Drive authorization revoked.";
      },
      message,
    ),
  );
  parent.insertBefore(section, parent.querySelector("#load-admin"));
}
export async function showDeliveryAdmin(
  origin: string,
  order: string,
  parent: HTMLElement,
) {
  const box = el("section", "");
  box.className = "portal-panel";
  const status = el("p", "Loading private delivery workspace…");
  status.setAttribute("role", "status");
  box.append(el("h2", "Working files & customer delivery"), status);
  parent.append(box);
  let data: any;
  try {
    data = await api(origin, `/api/v1/admin/orders/${order}/delivery`);
  } catch (e) {
    status.textContent = (e as Error).message;
    return;
  }
  const base = `/api/v1/admin/orders/${order}/delivery`;
  const reload = async () => {
    box.remove();
    await showDeliveryAdmin(origin, order, parent);
  };
  status.textContent = `PAYMENT VERIFIED · ${data.delivery?.status || "WORK IN PROGRESS"}${data.hold ? " · HOLD: " + data.hold : ""}. Invoice: ${data.order.stripe_invoice_id || "No invoice recorded — review required"}`;
  const date = (value: number | null) =>
    value ? new Date(value * 1000).toLocaleString() : "Not scheduled";
  const summary = el("dl", "");
  for (const [label, value] of [
    [
      "Project Status",
      data.order.status + (data.hold ? " / HOLD: " + data.hold : ""),
    ],
    [
      "Drive Transfer Status",
      data.transfers.length
        ? data.transfers.map((j: any) => j.state).join(", ")
        : "No input transfer jobs",
    ],
    [
      "Delivery Published",
      (data.delivery?.status || "DRAFT") +
        " / " +
        date(data.delivery?.published_at),
    ],
    [
      "Downloads",
      `${data.downloads?.count || 0} started (not proof of complete receipt). Latest: ${date(data.downloads?.lastStartedAt)}`,
    ],
    ["Customer Access Expiration", date(data.delivery?.expires_at)],
    [
      "Archive Expiration",
      date(data.retentionAt) +
        (data.archivedAt ? " / Deleted: " + date(data.archivedAt) : ""),
    ],
  ])
    summary.append(el("dt", label), el("dd", value));
  box.append(summary);
  if (data.archivedAt)
    box.append(
      button(
        "Verify archive deletion",
        async () => {
          const result = await api(origin, base + "/archive-check");
          status.textContent = result.allAbsent
            ? `Archive deletion verified: ${result.missing}/${result.checked} objects absent.`
            : "Archive deletion incomplete. Review storage before closing the project.";
        },
        status,
      ),
    );
  if (data.workspace) {
    const link = el("a", "Open private working folder") as HTMLAnchorElement;
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
        `DRIVE TRANSFER ${job.name}: ${job.state} · attempts ${job.attempts} · SHA-256 ${job.sha256 || "pending"}${job.alert ? " · " + job.alert : ""}${job.error_code ? " · " + job.error_code : ""}`,
      ),
    );
  box.append(
    el(
      "p",
      "Final files are unapproved until you scan the exact bytes in your isolated working environment and record the scan reference. No automatic antivirus service is configured.",
    ),
  );
  const file = input(
    box,
    "Upload final XER, PDF or XLSX · 20 MiB maximum",
    "file",
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
            "Content-Type": "application/octet-stream",
          },
          body: f,
        });
        const body = await r.json();
        if (!r.ok) throw Error(body.error);
        await reload();
      },
      status,
    ),
  );
  const selected: { id: string; sha256: string; check: HTMLInputElement }[] =
    [];
  for (const f of data.files) {
    const item = el("div", "");
    item.className = "portal-panel";
    item.append(
      el("h3", f.name),
      el(
        "p",
        `${f.mime} · ${f.bytes} bytes · ${f.state} · ${f.approved_at ? "Reviewed " + date(f.approved_at) : "Awaiting review"}`,
      ),
      el("code", f.sha256 || "Upload incomplete"),
    );
    if (f.state === "STAGED") {
      const scan = input(item, "Scanner / date / scan report reference");
      const clean = input(
        item,
        "I scanned these exact bytes and found no malware, embedded active content or unsafe spreadsheet links/macros.",
        "checkbox",
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
              scanReference: scan.value,
            });
            await reload();
          },
          status,
        ),
      );
    }
    if (f.state === "APPROVED") {
      const check = input(
        item,
        "Include this exact file in this release",
        "checkbox",
      );
      selected.push({ id: f.id, sha256: f.sha256, check });
    }
    box.append(item);
  }
  box.append(
    el("h3", "Review and publish"),
    el(
      "p",
      "Select exact approved files. Confirm the order, invoice and reviewed retention policy. No email is sent automatically.",
    ),
  );
  const confirmOrder = input(box, "Type the full order ID to confirm");
  const reviewed = input(
    box,
    "I reviewed the verified payment/invoice and selected final files.",
    "checkbox",
  );
  const days = input(
    box,
    "Customer access days (1–30; 30 days is a proposal until approved)",
    "number",
  );
  days.min = "1";
  days.max = "30";
  const retention = input(
    box,
    "Working-copy retention days after publication (at least access days, max 90; approval required)",
    "number",
  );
  retention.min = "1";
  retention.max = "90";
  const passcode = input(
    box,
    "Require a separate passcode; send it through an independent channel.",
    "checkbox",
  );
  const output = el("div", "");
  box.append(output);
  const display = (r: any) => {
    output.replaceChildren(
      el("h3", "Private invitation — share securely"),
      el(
        "p",
        "Purchasing contact: " +
          (r.recipient ||
            "Use the verified Stripe purchasing email from the order."),
      ),
      el("p", r.message),
    );
    const area = document.createElement("textarea");
    area.readOnly = true;
    area.value =
      "Your deliverables are ready. Download securely via your Bluefin Tuna project portal:\n" +
      r.url +
      "\n\nActivate this invitation before " +
      new Date(r.inviteExpiresAt * 1000).toLocaleString() +
      ".";
    area.setAttribute("aria-label", "Private manual delivery message");
    output.append(area);
    if (r.passcode)
      output.append(el("p", "Separate-channel passcode: " + r.passcode));
    output.append(
      el(
        "p",
        "This link is displayed once. Never paste it into support logs or public messages.",
      ),
    );
  };
  box.append(
    button(
      "Publish Delivery",
      async () => {
        const files = selected
          .filter((x) => x.check.checked)
          .map(({ id, sha256 }) => ({ id, sha256 }));
        if (
          !confirm("Publish exactly these final documents for this paid order?")
        )
          return;
        display(
          await api(origin, base + "/publish", {
            confirmOrder: confirmOrder.value,
            invoiceReviewed: reviewed.checked,
            files,
            accessDays: Number(days.value),
            retentionDays: Number(retention.value),
            passcode: passcode.checked,
          }),
        );
        status.textContent =
          "PUBLISHED. Manually send the private invitation to the purchasing contact.";
      },
      status,
    ),
  );
  box.append(
    button(
      "Regenerate invitation / revoke previous access",
      async () => {
        display(
          await api(origin, base + "/regenerate", {
            passcode: passcode.checked,
          }),
        );
      },
      status,
    ),
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
      status,
    ),
  );
  const hold = document.createElement("select");
  hold.setAttribute("aria-label", "Hold reason");
  for (const reason of [
    "refund",
    "chargeback",
    "deletion_request",
    "compromised_access",
    "service_failed",
  ]) {
    const option = el(
      "option",
      reason.replaceAll("_", " "),
    ) as HTMLOptionElement;
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
      status,
    ),
  );
}
