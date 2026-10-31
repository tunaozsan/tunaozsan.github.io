import { test } from "node:test";
import assert from "node:assert/strict";
import { LEGACY_LINKS, legacyLinks } from "../src/legacy-links";
test("legacy retirement expires only open unpaid sessions and preserves paid history", async () => {
  const active = new Map(LEGACY_LINKS.map((id) => [id, true]));
  const expired = new Set<string>();
  const writes: string[] = [];
  const api = async (path: string, body?: URLSearchParams) => {
    const u = new URL("https://api.stripe.com/v1/" + path);
    if (path.startsWith("payment_links/")) {
      const id = path.split("/")[1];
      if (body) {
        assert.equal(body.get("active"), "false");
        active.set(id, false);
        writes.push(path);
      }
      return { id, livemode: true, active: active.get(id) };
    }
    if (path.endsWith("/expire")) {
      const id = path.split("/")[2];
      assert.ok(id.endsWith("_open"));
      assert.equal([...active.values()].filter((x) => !x).length > 0, true);
      expired.add(id);
      return { status: "expired" };
    }
    const id = u.searchParams.get("payment_link")!;
    return {
      data: [
        {
          id: id + "_open",
          status: expired.has(id + "_open") ? "expired" : "open",
          payment_status: "unpaid",
          payment_link: id,
          livemode: true,
        },
        {
          id: id + "_paid",
          status: "complete",
          payment_status: "paid",
          payment_link: id,
          livemode: true,
        },
      ],
      has_more: false,
    };
  };
  const before = await legacyLinks(api, false);
  assert.equal(writes.length, 0);
  assert.ok(
    before.links.every((x) => x.before.open === 1 && x.before.paid === 1),
  );
  const after = await legacyLinks(api, true);
  assert.equal(writes.length, 8);
  assert.equal(expired.size, 8);
  assert.ok(
    after.links.every(
      (x) =>
        x.active === false &&
        x.openRemaining === 0 &&
        x.sessions.some((s) => s.paymentStatus === "paid") &&
        !x.portalConsentCreated,
    ),
  );
  await legacyLinks(api, true);
  assert.equal(writes.length, 8);
});
test("retirement refuses incomplete or wrong-environment inventory before write", async () => {
  let writes = 0;
  await assert.rejects(
    legacyLinks(async (path, body) => {
      if (body) writes++;
      if (path.startsWith("payment_links/"))
        return { id: LEGACY_LINKS[0], livemode: true, active: true };
      return {
        data: [{ payment_link: LEGACY_LINKS[0], livemode: false }],
        has_more: false,
      };
    }, true),
    /legacy_session_mismatch/,
  );
  assert.equal(writes, 0);
});
