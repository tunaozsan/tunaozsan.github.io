import { object, keys, Problem } from "./catalog";
import { transactionFacts } from "./transaction-review";

// Direct Checkout uses the billing address; reviewed applications retain their
// original project/use-location evidence below. Never infer missing tax facts.
export function directCustomer(raw: unknown, sku: string) {
  const c = object(raw);
  const fields = {
    name: 100,
    email: 254,
    project: 160,
    dataDate: 10,
    businessName: 160,
    billingCountry: 2,
    billingState: 100,
    billingAddress: 240,
    billingCity: 100,
    billingPostal: 32,
  };
  keys(c, [
    ...Object.keys(fields), "businessUse",
    // Accept older browser forms, but do not store their retired fields on
    // new direct orders. Existing order snapshots are never rewritten.
    "projectCountry", "projectState", "serviceNature",
    "firstUseCountry", "firstUseState", "firstUseLocation",
  ]);
  if (typeof c.businessUse !== "boolean")
    throw new Problem(400, "business_use_required");
  const customer: Record<string, string | boolean> = {
    businessUse: c.businessUse,
  };
  for (const [key, max] of Object.entries(fields)) {
    const optional =
      (key === "dataDate" && !sku.startsWith("update")) ||
      (key === "businessName" && !c.businessUse) || key === "billingState";
    const value = c[key] ?? (optional ? "" : undefined);
    if (typeof value !== "string" || value.length > max ||
        /[\x00-\x1f]/.test(value) || (!optional && !value.trim()))
      throw new Problem(400, "invalid_customer");
    customer[key] = value.trim();
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(customer.email)))
    throw new Problem(400, "invalid_email");
  if (!/^[A-Za-z]{2}$/.test(String(customer.billingCountry)))
    throw new Problem(400, "invalid_country");
  customer.billingCountry = String(customer.billingCountry).toUpperCase();
  if (customer.billingCountry === "US" && !customer.billingState)
    throw new Problem(400, "billing_state_required");
  if (customer.dataDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(customer.dataDate)))
    throw new Problem(400, "invalid_data_date");
  return customer;
}

export function projectCustomer(raw: unknown, sku: string) {
  const c = object(raw);
  keys(c, [
    "name",
    "email",
    "project",
    "dataDate",
    "businessUse",
    "businessName",
    "billingCountry",
    "billingState",
    "billingAddress",
    "billingCity",
    "billingPostal",
    "projectCountry",
    "projectState",
    "serviceNature",
    "firstUseCountry",
    "firstUseState",
    "firstUseLocation",
  ]);
  if (typeof c.businessUse !== "boolean")
    throw new Problem(400, "business_use_required");
  const customer: Record<string, string | boolean> = {
    businessUse: c.businessUse,
  };
  for (const [key, max] of Object.entries({
    name: 100,
    email: 254,
    project: 160,
    dataDate: 10,
    businessName: 160,
    billingCountry: 2,
    billingState: 100,
    billingAddress: 240,
    billingCity: 100,
    billingPostal: 32,
    projectCountry: 2,
    projectState: 100,
    serviceNature: 500,
    firstUseCountry: 2,
    firstUseState: 100,
    firstUseLocation: 240,
  })) {
    const value = c[key];
    const optional =
      (key === "dataDate" && !sku.startsWith("update")) ||
      (key === "businessName" && !c.businessUse) ||
      ["billingState", "projectState", "firstUseState"].includes(key);
    if (
      typeof value !== "string" ||
      value.length > max ||
      /[\x00-\x1f]/.test(value) ||
      (!optional && !value.trim())
    )
      throw new Problem(400, "invalid_customer");
    customer[key] = value.trim();
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(customer.email)))
    throw new Problem(400, "invalid_email");
  for (const key of ["billingCountry", "projectCountry", "firstUseCountry"]) {
    if (!/^[A-Za-z]{2}$/.test(String(customer[key])))
      throw new Problem(400, "invalid_country");
    customer[key] = String(customer[key]).toUpperCase();
  }
  for (const prefix of ["billing", "project", "firstUse"])
    if (customer[prefix + "Country"] === "US")
      customer[prefix + "State"] = String(
        customer[prefix + "State"],
      ).toUpperCase();
  transactionFacts(customer);
  if (
    customer.dataDate &&
    !/^\d{4}-\d{2}-\d{2}$/.test(String(customer.dataDate))
  )
    throw new Problem(400, "invalid_data_date");
  return customer;
}
