const $ = (id: string) => document.getElementById(id)!;
const label = (tag: string, text: string) => {
  const e = document.createElement(tag);
  e.textContent = text;
  return e;
};
const stamp = (n: number) => new Date(n * 1000).toLocaleString();
const errors: Record<string, string> = {
  delivery_not_enabled:
    "Secure delivery is not available yet. Please contact support.",
  delivery_sign_in_required: "Activate your private invitation to continue.",
  delivery_session_expired:
    "Your session expired. Ask Bluefin Tuna for a new invitation.",
  invite_invalid_or_expired:
    "This invitation or access code is invalid, already used, revoked or expired. Ask Bluefin Tuna for a new invitation.",
  invite_already_used:
    "This invitation was already activated. Ask Bluefin Tuna for a new invitation.",
  delivery_revoked: "This delivery has been revoked. Please contact support.",
  delivery_expired:
    "The delivery access window has ended. Please contact support.",
  download_unavailable:
    "This file is temporarily unavailable. Please contact support.",
};
async function request(path: string, method = "GET", body?: unknown) {
  const r = await fetch("/api/v1/delivery/" + path, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok)
    throw Error(
      errors[data.error] ||
        "The request could not be completed. Please contact support.",
    );
  return data;
}
let invitation =
  new URLSearchParams(location.hash.slice(1)).get("invite") || "";
history.replaceState(null, "", location.pathname);
const notice = (s: string) => {
  $("delivery-status").textContent = s;
};
async function refresh() {
  const s = await request("session");
  $("delivery-files").replaceChildren(
    label("h2", "Your final documents"),
    label("p", "Order " + s.orderReference),
    label(
      "p",
      "Published " +
        stamp(s.publishedAt) +
        " · Available until " +
        stamp(s.expiresAt),
    ),
    label(
      "p",
      "Session ends " +
        stamp(s.sessionExpiresAt) +
        ". A new invitation may be required after this time.",
    ),
  );
  for (const f of s.files) {
    const row = label("div", "");
    row.className = "portal-line";
    const text = label(
      "span",
      `${f.name} · ${(f.bytes / 1024).toFixed(1)} KiB`,
    );
    const a = document.createElement("a");
    a.className = "button secondary";
    a.href = "/api/v1/delivery/files/" + encodeURIComponent(f.id) + "/download";
    a.textContent = "Download";
    a.setAttribute("download", f.name);
    row.append(text, a);
    $("delivery-files").append(row);
  }
  $("delivery-files").hidden = false;
  $("delivery-logout").hidden = false;
  ($("delivery-activate") as HTMLFormElement).hidden = true;
  notice(
    "Your private delivery is ready. Download only on a device you trust.",
  );
}
$("delivery-activate").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("delivery-open") as HTMLButtonElement;
  button.disabled = true;
  try {
    if (!invitation)
      throw Error("Open the private invitation provided by Bluefin Tuna.");
    await request("activate", "POST", {
      invite: invitation,
      passcode: ($("delivery-passcode") as HTMLInputElement).value,
    });
    invitation = "";
    ($("delivery-passcode") as HTMLInputElement).value = "";
    await refresh();
  } catch (e) {
    notice((e as Error).message);
  } finally {
    button.disabled = false;
  }
});
$("delivery-logout").addEventListener("click", async () => {
  try {
    await request("logout", "POST");
    $("delivery-files").replaceChildren();
    $("delivery-files").hidden = true;
    $("delivery-logout").hidden = true;
    notice("Signed out. Ask Bluefin Tuna for a new invitation when needed.");
  } catch (e) {
    notice((e as Error).message);
  }
});
if (invitation)
  notice(
    "Activate your private invitation. If a separate access code was provided, enter it below.",
  );
else refresh().catch((e) => notice(e.message));
