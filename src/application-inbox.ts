export {};
const box = document.getElementById("inbox")!,
  status = document.getElementById("inbox-status")!;
const el = (tag: string, text = "") => {
  const n = document.createElement(tag);
  n.textContent = text;
  return n;
};
async function api(path: string, body?: unknown) {
  const r = await fetch(path, {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.headers.get("content-type")?.includes("application/json"))
    throw Error("Renew admin sign-in using the protected records link.");
  const data = await r.json();
  if (!r.ok) throw Error(data.error || "Request failed");
  return data;
}
function field(parent: HTMLElement, label: string) {
  const l = el("label", label),
    i = document.createElement("input");
  i.required = true;
  l.append(i);
  parent.append(l);
  return i;
}
document.getElementById("load-applications")!.onclick = async () => {
  try {
    const data = await api("/api/v1/admin/applications");
    box.replaceChildren();
    for (const a of data.applications) {
      const section = el("section");
      section.className = "portal-panel";
      const c = JSON.parse(a.customer_json),
        q = JSON.parse(a.scope_json),
        existing = data.approvals.find((x: any) => x.application_id === a.id);
      for (const text of [
        a.id,
        c.project,
        `${c.name} · ${c.email}`,
        c.businessName,
        `Status: ${a.status} · Business purchase: ${c.businessUse === true ? "Yes" : "No"}`,
        `${c.billingAddress}, ${c.billingCity}, ${c.billingState} ${c.billingPostal}, ${c.billingCountry} · Project: ${c.projectCountry}`,
        `Project state: ${c.projectState || "Not supplied"} · Service: ${c.serviceNature || "Not supplied"}`,
        `First use: ${c.firstUseLocation || "Not supplied"}, ${c.firstUseState || ""}, ${c.firstUseCountry || "Not supplied"}`,
        JSON.stringify(q.lines),
        `USD ${(q.total / 100).toFixed(2)} before tax`,
        a.terms_version,
      ])
        section.append(el("p", text));
      const result = el("p");
      result.setAttribute("role", "status");
      section.append(result);
      if (existing) {
        result.textContent = `Review ${existing.revoked_at ? "revoked" : existing.redeemed_at ? "redeemed" : "approved"} · ${existing.order_id} · ${existing.basis_reference} · expires ${new Date(existing.expires_at * 1000).toISOString()}`;
        const revoke = el("button", "Revoke approval");
        revoke.onclick = async () => {
          try {
            await api("/api/v1/admin/applications/" + a.id + "/revoke", {});
            result.textContent =
              "Approval revoked; any uncollected authorization will not be captured.";
          } catch (e) {
            result.textContent = (e as Error).message;
          }
        };
        section.append(revoke);
        section.append(
          el(
            "p",
            JSON.parse(existing.decision_json).decisionSummary ||
              "Historical review; no new facts inferred.",
          ),
        );
      } else if (
        !c.serviceNature ||
        !c.firstUseCountry ||
        !c.firstUseLocation
      ) {
        result.textContent =
          "This earlier application is missing service / first-use facts. Ask the customer to submit a complete new application. The original acceptance will not be changed.";
      } else {
        const form = document.createElement("form");
        form.append(
          el(
            "p",
            "Review applies only to this exact business customer, billing address, project and scope. A change requires a new review. No legal/tax basis is inferred from Stripe returning zero.",
          ),
        );
        const basis = field(
            form,
            "Existing transaction-tax decision / document reference",
          ),
          hash = field(form, "SHA-256 of that decision document");
        hash.pattern = "[a-f0-9]{64}";
        const summary = field(
          form,
          "Documented decision: applicable jurisdictions, service classification, collection / no-collection conclusion and its legal basis",
        );
        summary.minLength = 30;
        summary.maxLength = 2000;
        const jurisdictions = field(
          form,
          "I verified the documented decision covers the billing, project and first-use locations and the actual service",
        );
        jurisdictions.type = "checkbox";
        jurisdictions.checked = false;
        const noCollection = field(
          form,
          "For a no-collection decision: the document establishes no seller collection obligation for this transaction; Stripe not_collecting alone is not evidence of exemption",
        );
        noCollection.type = "checkbox";
        noCollection.required = false;
        noCollection.checked = false;
        const kind = document.createElement("select");
        for (const [value, text] of [
          ["", "Select documented basis"],
          ["registered", "Verified active tax registration"],
          ["documented_no_collection", "Documented no-collection basis"],
        ]) {
          const o = new Option(text, value);
          kind.add(o);
        }
        kind.required = true;
        form.append(kind);
        const registration = field(
          form,
          "Stripe registration ID (required for registered basis)",
        );
        registration.required = false;
        kind.onchange = () => {
          registration.required = kind.value === "registered";
          noCollection.required = kind.value === "documented_no_collection";
        };
        const reasons = field(
            form,
            "Approved Stripe taxability reasons (comma separated)",
          ),
          review = field(
            form,
            "I reviewed scope, resources/material mappings, business use and this exact location",
          );
        review.type = "checkbox";
        review.checked = false;
        const pilot = field(
          form,
          "Pilot human review and deliverable ready (pilot only)",
        );
        pilot.type = "checkbox";
        pilot.required = false;
        const submit = el(
          "button",
          "Approve scope and create private invitation",
        ) as HTMLButtonElement;
        submit.type = "submit";
        form.append(submit);
        form.onsubmit = async (ev) => {
          ev.preventDefault();
          submit.disabled = true;
          try {
            const r = await api(
              "/api/v1/admin/applications/" + a.id + "/approve",
              {
                basisReference: basis.value,
                basisHash: hash.value,
                decisionSummary: summary.value,
                jurisdictionsReviewed: jurisdictions.checked,
                noCollectionObligation: noCollection.checked,
                kind: kind.value,
                registrationId: registration.value,
                reasonCodes: reasons.value.split(",").map((s) => s.trim()),
                scopeReviewed: review.checked,
                pilotReady: pilot.checked,
              },
            );
            result.replaceChildren(
              el(
                "span",
                r.intakeEnabled
                  ? "Approved. Share this private, single-use link only with this customer. "
                  : "Approval recorded. Customer intake is still closed. ",
              ),
            );
            const link = el(
              "a",
              "Private customer invitation",
            ) as HTMLAnchorElement;
            link.href = r.invitationUrl;
            result.append(link);
            form.remove();
          } catch (e) {
            result.textContent = (e as Error).message;
            submit.disabled = false;
          }
        };
        section.append(form);
      }
      box.append(section);
    }
    status.textContent = `${data.applications.length} applications loaded. No payment is taken by an approval.`;
  } catch (e) {
    status.textContent = (e as Error).message;
  }
};
