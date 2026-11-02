import { Problem } from "./catalog";

// Customer facts are evidence inputs, never a tax exemption or an automatic rule.
export function transactionFacts(c: any) {
  const facts: Record<string, string | boolean> = {};
  if (typeof c.businessUse !== "boolean")
    throw new Problem(409, "transaction_facts_required");
  facts.businessUse = c.businessUse;
  for (const key of ["billingCountry", "projectCountry", "firstUseCountry"]) {
    if (typeof c[key] !== "string" || !/^[A-Z]{2}$/.test(c[key]))
      throw new Problem(409, "transaction_facts_required");
    facts[key] = c[key];
  }
  for (const [key, max] of Object.entries({
    billingState: 100,
    projectState: 100,
    firstUseState: 100,
    firstUseLocation: 240,
    serviceNature: 500,
  })) {
    if (
      typeof c[key] !== "string" ||
      c[key].length > max ||
      /[\x00-\x1f]/.test(c[key])
    )
      throw new Problem(409, "transaction_facts_required");
    facts[key] = c[key].trim();
  }
  for (const prefix of ["billing", "project", "firstUse"])
    if (
      facts[prefix + "Country"] === "US" &&
      !/^[A-Z]{2}$/.test(String(facts[prefix + "State"]))
    )
      throw new Problem(409, "us_state_code_required");
  if (String(facts.serviceNature).length < 8 || !facts.firstUseLocation)
    throw new Problem(409, "transaction_facts_required");
  return facts;
}

export function documentedDecision(
  b: any,
  facts: ReturnType<typeof transactionFacts>,
) {
  if (
    b.jurisdictionsReviewed !== true ||
    typeof b.decisionSummary !== "string" ||
    b.decisionSummary.trim().length < 30 ||
    b.decisionSummary.length > 2000 ||
    /[\x00-\x1f]/.test(b.decisionSummary)
  )
    throw new Problem(400, "documented_transaction_decision_required");
  const collecting = b.reasonCodes.some((r: string) =>
    ["standard_rated", "reduced_rated"].includes(r),
  );
  if (
    b.kind === "documented_no_collection" &&
    (b.noCollectionObligation !== true || collecting)
  )
    throw new Problem(400, "documented_no_collection_required");
  if (
    b.reasonCodes.includes("not_collecting") &&
    (b.kind !== "documented_no_collection" || b.noCollectionObligation !== true)
  )
    throw new Problem(400, "not_collecting_is_not_exemption");
  return {
    version: 2,
    facts,
    decisionSummary: b.decisionSummary.trim(),
    jurisdictionsReviewed: true,
    noCollectionObligation:
      b.kind === "documented_no_collection" &&
      b.noCollectionObligation === true,
    kind: b.kind,
    registrationId: b.kind === "registered" ? b.registrationId : null,
    reasonCodes: b.reasonCodes,
    scopeReviewed: true,
    pilotReady: b.pilotReady === true,
  };
}
