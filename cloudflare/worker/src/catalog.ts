export class Problem extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
export const TTL = 43200,
  MAX_FILE = 20 * 1024 * 1024;
export const TERMS = "portal-draft-2026-10-28";
export const packages = [
  ["p6_audit", "Primavera P6 Schedule Audit", 19900, 150, 5, 0, false],
  [
    "baseline_basic_nores",
    "Basic Baseline — Without Resources",
    49900,
    75,
    5,
    2,
    false,
  ],
  [
    "baseline_basic_withres",
    "Basic Baseline — With Resources",
    79900,
    75,
    7,
    2,
    true,
  ],
  [
    "baseline_detailed_nores",
    "Detailed Baseline — Without Resources",
    99900,
    200,
    10,
    4,
    false,
  ],
  [
    "baseline_detailed_withres",
    "Detailed Baseline — With Resources",
    149900,
    200,
    12,
    4,
    true,
  ],
  [
    "update_nores",
    "Primavera P6 Schedule Update — Without Resources",
    39900,
    200,
    4,
    4,
    false,
  ],
  [
    "update_withres",
    "Primavera P6 Schedule Update — With Resources",
    64900,
    200,
    5,
    4,
    true,
  ],
].map(([sku, name, cents, activities, days, maxBlocks, resources]) => ({
  sku: String(sku),
  name: String(name),
  cents: Number(cents),
  activities: Number(activities),
  days: Number(days),
  maxBlocks: Number(maxBlocks),
  resources: Boolean(resources),
}));
export const materials = [
  "concrete",
  "rebar",
  "formwork",
  "structural_steel",
  "piping",
];
export type Cart = {
  sku: string;
  activities: number;
  revisions: number;
  materials: { code: string; rows: number }[];
  existingResources: boolean;
};
export function object(v: unknown): Record<string, any> {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new Problem(400, "invalid_object");
  return v as Record<string, any>;
}
export function keys(v: Record<string, any>, allow: string[]) {
  if (Object.keys(v).some((k) => !allow.includes(k)))
    throw new Problem(400, "unknown_field");
}
export function integer(v: unknown, min: number, max: number) {
  if (!Number.isSafeInteger(v) || Number(v) < min || Number(v) > max)
    throw new Problem(400, "invalid_number");
  return Number(v);
}
export function quote(raw: unknown) {
  const v = object(raw);
  keys(v, ["sku", "activities", "revisions", "materials", "existingResources"]);
  const p = packages.find((p) => p.sku === v.sku);
  if (!p) throw new Problem(400, "unknown_package");
  const activities = integer(v.activities, 1, 10000),
    revisions = integer(v.revisions ?? 0, 0, 3);
  if (
    v.existingResources !== undefined &&
    typeof v.existingResources !== "boolean"
  )
    throw new Problem(400, "invalid_resources");
  const m = v.materials ?? [];
  if (!Array.isArray(m) || m.length > 5)
    throw new Problem(400, "invalid_materials");
  const selected = m.map((x) => {
    const a = object(x);
    keys(a, ["code", "rows"]);
    if (!materials.includes(a.code)) throw new Problem(400, "unknown_material");
    return { code: a.code as string, rows: integer(a.rows, 1, 10000) };
  });
  if (new Set(selected.map((x) => x.code)).size !== selected.length)
    throw new Problem(400, "duplicate_material");
  if (selected.length && !p.resources)
    throw new Problem(400, "materials_require_resources");
  const update = p.sku.startsWith("update"),
    audit = p.sku === "p6_audit";
  if (audit && (revisions || selected.length))
    throw new Problem(400, "audit_addons_unavailable");
  const blocks = Math.ceil(Math.max(0, activities - p.activities) / 50);
  const reasons: string[] = [];
  if (blocks > p.maxBlocks)
    reasons.push("Activity count requires a written quote.");
  if (selected.some((x) => x.rows > 50))
    reasons.push("More than 50 BOQ rows per category requires review.");
  if (update && selected.length)
    reasons.push(
      "Existing material assignments require operator verification before payment.",
    );
  if (update && p.resources && !v.existingResources)
    reasons.push(
      "Existing MH/cost resource assignments must be confirmed; initial setup is quote-only.",
    );
  const lines = [{ name: p.name, unit: p.cents, quantity: 1 }];
  if (blocks)
    lines.push({
      name: `Additional 50 activities (${p.resources ? "MH + cost" : "without resources"})`,
      unit: p.resources ? (update ? 15000 : 17500) : 10000,
      quantity: blocks,
    });
  for (const x of selected)
    lines.push({
      name: `Material: ${x.code.replaceAll("_", " ")} (${x.rows} BOQ rows)`,
      unit: update ? 11900 : 24900,
      quantity: 1,
    });
  if (revisions)
    lines.push({
      name: "Additional in-scope revision",
      unit: 9900,
      quantity: revisions,
    });
  const required = audit
    ? ["xer"]
    : update
      ? ["xer", "baseline", "progress"]
      : ["boq", "drawings", "scope"];
  if (p.resources) required.push("resources");
  if (selected.length) required.push("materials");
  return {
    cart: {
      sku: p.sku,
      activities,
      revisions,
      materials: selected,
      existingResources: v.existingResources === true,
    } as Cart,
    lines,
    total: lines.reduce((a, l) => a + l.unit * l.quantity, 0),
    currency: "usd",
    scopeReview: reasons,
    required,
    days: p.days,
  };
}
