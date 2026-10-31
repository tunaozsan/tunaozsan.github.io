import { Problem } from "./catalog";
export const LEGACY_LINKS = [
  "plink_1UWCmlBzdKYgwVw6SNrqjGdI",
  "plink_1UVAMfBzdKYgwVw6pow909cB",
  "plink_1UVAL1BzdKYgwVw6uosQvzep",
  "plink_1UVAJ4BzdKYgwVw6nVq5vgGQ",
  "plink_1UVAGtBzdKYgwVw6WTiViWrl",
  "plink_1UVAElBzdKYgwVw6DvU7Biee",
  "plink_1UVAC5BzdKYgwVw6aKsnuS6z",
  "plink_1UV74WBzdKYgwVw6EYEHxMeJ",
];
type API = (path: string, body?: URLSearchParams, key?: string) => Promise<any>;
export async function legacyLinks(
  api: API,
  retire: boolean,
  selected?: string,
) {
  const result = [];
  if (selected && !LEGACY_LINKS.includes(selected))
    throw new Problem(400, "unknown_legacy_link");
  for (const id of selected ? [selected] : LEGACY_LINKS) {
    const link = await api("payment_links/" + id);
    if (link.id !== id || link.livemode !== true)
      throw new Problem(409, "legacy_link_mismatch");
    const sessions = async () => {
      const all: any[] = [];
      let cursor = "";
      for (let n = 0; n < 20; n++) {
        const p = await api(
          "checkout/sessions?" +
            new URLSearchParams({
              payment_link: id,
              limit: "100",
              ...(cursor ? { starting_after: cursor } : {}),
            }),
        );
        if (!Array.isArray(p.data))
          throw new Problem(502, "legacy_session_inventory_invalid");
        if (
          p.data.some((s: any) => s.payment_link !== id || s.livemode !== true)
        )
          throw new Problem(409, "legacy_session_mismatch");
        all.push(...p.data);
        if (!p.has_more) return all;
        cursor = p.data.at(-1)?.id;
        if (!cursor) break;
      }
      throw new Problem(409, "legacy_session_inventory_incomplete");
    };
    const before = await sessions();
    if (retire) {
      // Disable new visits first, then reconcile all sessions again to cover concurrent creation.
      if (link.active) {
        const closed = await api(
          "payment_links/" + id,
          new URLSearchParams({
            active: "false",
            inactive_message:
              "New project requests: https://bluefintuna.life/project-portal/ . Existing purchases remain valid; contact support@bluefintuna.life.",
          }),
          "bluefin-retire-20261031-" + id,
        );
        if (closed.active !== false)
          throw new Problem(502, "link_retirement_not_verified");
      }
      for (const s of await sessions())
        if (s.status === "open" && s.payment_status === "unpaid") {
          const expired = await api(
            "checkout/sessions/" + s.id + "/expire",
            new URLSearchParams(),
            "retire-session-" + s.id,
          );
          if (expired.status !== "expired")
            throw new Problem(502, "legacy_expiry_not_verified");
        }
    }
    const after = retire ? await sessions() : before;
    const current = retire ? await api("payment_links/" + id) : link;
    result.push({
      id,
      url: link.url,
      active: current.active,
      termsRequired:
        current.consent_collection?.terms_of_service === "required",
      before: {
        open: before.filter((s) => s.status === "open").length,
        paid: before.filter((s) => s.payment_status === "paid").length,
      },
      sessions: after.map((s) => ({
        id: s.id,
        status: s.status,
        paymentStatus: s.payment_status,
        total: s.amount_total,
        currency: s.currency,
        paymentIntent:
          typeof s.payment_intent === "string" ? s.payment_intent : null,
      })),
      openRemaining: after.filter((s) => s.status === "open").length,
      pending: after.filter(
        (s) => s.status === "complete" && s.payment_status === "unpaid",
      ).length,
      portalConsentCreated: false,
    });
  }
  return {
    action: retire ? "retire-legacy-links" : "inspect-legacy-links",
    links: result,
    historyDeleted: false,
  };
}
