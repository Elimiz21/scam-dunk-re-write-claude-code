/** Restore durable history before scanning; reject stale or destructive publication. */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

export const schemeStateNames = ["scheme-database.json", "promoter-database.json"] as const;
export const schemeBaselineName = "scheme-state-baseline.json";
type State = Record<string, Buffer>;
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const record = (value: any) => value && typeof value === "object" && !Array.isArray(value);
const dated = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value));

function parse(bytes: Buffer, key: string) {
  const value = JSON.parse(bytes.toString("utf8"));
  if (!record(value) || !record(value[key]) || !Number.isFinite(Date.parse(value.lastUpdated))) throw Error("Invalid durable scheme history");
  return value;
}

export function readSchemeState(directory: string): State {
  return Object.fromEntries(schemeStateNames.map(name => [name, fs.readFileSync(path.join(directory, name))]));
}

export function createSchemeBaseline(state: State) {
  parse(state[schemeStateNames[0]], "schemes"); parse(state[schemeStateNames[1]], "promoters");
  return {schemaVersion: 1, hashes: Object.fromEntries(schemeStateNames.map(name => [name, hash(state[name])]))};
}

export function promoterIds(database: any): Map<string, string> {
  if (!record(database?.promoters)) throw Error("Invalid promoter history");
  return new Map(Object.values(database.promoters).map((p: any) => {
    if (!record(p) || typeof p.platform !== "string" || typeof p.identifier !== "string" || typeof p.promoterId !== "string") throw Error("Invalid promoter identity");
    return [`${p.platform}::${p.identifier}`, p.promoterId];
  }));
}

export function stablePromoterId(platform: string, identifier: string, existing: Map<string, string>) {
  const key = `${platform}::${identifier}`;
  return existing.get(key) || `PROM-${createHash("sha256").update(key).digest("hex").slice(0,24).toUpperCase()}`;
}

export function validateSchemePublication(current: State, candidate: State, baseline: any) {
  if (baseline?.schemaVersion !== 1 || schemeStateNames.some(name => baseline.hashes?.[name] !== hash(current[name]))) throw Error("Scheme history changed after validation; rerun against current history");
  const before = parse(current[schemeStateNames[0]], "schemes");
  const after = parse(candidate[schemeStateNames[0]], "schemes");
  if (Date.parse(after.lastUpdated) < Date.parse(before.lastUpdated)) throw Error("Scheme history moved backwards");
  for (const [id, old] of Object.entries<any>(before.schemes)) {
    const next = after.schemes[id];
    if (!record(next) || next.schemeId !== old.schemeId || next.symbol !== old.symbol || next.firstDetected !== old.firstDetected || !dated(next.lastSeen) || next.lastSeen < old.lastSeen) throw Error("Scheme identity or history was lost");
    // These collections are append-only evidence. Compare with multiplicity so
    // repeated historical events cannot disappear behind a set comparison.
    for (const key of ["timeline", "notes", "investigationFlags", "promotionPlatforms", "signalsDetected"]) {
      const remaining = [...(next[key] || [])].map(item => JSON.stringify(item));
      for (const item of old[key] || []) {
        const index = remaining.indexOf(JSON.stringify(item));
        if (index < 0) throw Error("Scheme evidence was lost");
        remaining.splice(index, 1);
      }
    }
    for (const account of old.promoterAccounts || []) {
      if (!record(account)) continue;
      const nextAccount = next.promoterAccounts?.find((p: any) => p.platform === account.platform && p.identifier === account.identifier);
      if (!nextAccount || nextAccount.firstSeen !== account.firstSeen || !dated(nextAccount.lastSeen) || nextAccount.lastSeen < account.lastSeen || !(nextAccount.postCount >= account.postCount)) throw Error("Promoter evidence was lost");
    }
  }
  const oldPromoters = parse(current[schemeStateNames[1]], "promoters");
  const nextPromoters = parse(candidate[schemeStateNames[1]], "promoters");
  if (Date.parse(nextPromoters.lastUpdated) < Date.parse(oldPromoters.lastUpdated)) throw Error("Promoter history moved backwards");
  for (const [id, old] of Object.entries<any>(oldPromoters.promoters)) {
    const next = nextPromoters.promoters[id];
    if (!record(next) || next.promoterId !== id || next.platform !== old.platform || next.identifier !== old.identifier || next.firstSeen !== old.firstSeen || !dated(next.lastSeen) || next.lastSeen < old.lastSeen || !(next.totalPosts >= old.totalPosts)) throw Error("Promoter identity or history was lost");
  }
}

if (require.main === module) {
  const [action, source, target, baselineFile] = process.argv.slice(2);
  const current = readSchemeState(source);
  if (action === "restore") {
    const baseline = createSchemeBaseline(current);
    fs.mkdirSync(target, {recursive:true}); fs.mkdirSync(path.dirname(baselineFile), {recursive:true});
    for (const name of schemeStateNames) fs.writeFileSync(path.join(target,name),current[name]);
    fs.writeFileSync(baselineFile, JSON.stringify(baseline,null,2));
    console.log("Durable scheme and promoter history restored");
  } else if (action === "verify") {
    validateSchemePublication(current, readSchemeState(target), JSON.parse(fs.readFileSync(baselineFile,"utf8")));
    console.log("Durable scheme and promoter history preserved");
  } else throw Error("Unknown scheme-state action");
}
