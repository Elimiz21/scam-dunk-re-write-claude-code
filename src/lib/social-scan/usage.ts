/** Per-run metering without authenticated URLs, headers, identities or message content. */
export class SocialUsage {
  readonly providers: Record<string, {requests:number; rateLimited:number; errors:number; headerDurationMs:number}> = {};
  model = {calls:0, promptTokens:0, completionTokens:0, estimatedOrReservedUsd:0, unknownUsageCalls:0};
  constructor(private readonly modelBudgetUsd = 5) {}
  request(host: string) {
    const entry = this.providers[host] ??= {requests:0,rateLimited:0,errors:0,headerDurationMs:0};
    entry.requests++;
    return (status: number | null, duration: number) => {
      entry.headerDurationMs += Math.max(0,duration);
      if (status === 429) entry.rateLimited++;
      if (status === null || status >= 400) entry.errors++;
    };
  }
  reserveModel(upperCost: number) {
    if (!Number.isFinite(upperCost) || upperCost < 0 || this.model.estimatedOrReservedUsd + upperCost > this.modelBudgetUsd) throw new Error("SOCIAL_MODEL_BUDGET_EXHAUSTED");
    this.model.calls++; this.model.estimatedOrReservedUsd += upperCost; this.model.unknownUsageCalls++;
    let settled = false;
    return (usage?: {prompt_tokens?: number; completion_tokens?: number}) => {
      if (settled || !usage || !Number.isFinite(usage.prompt_tokens) || !Number.isFinite(usage.completion_tokens)) return;
      settled = true;
      this.model.promptTokens += usage.prompt_tokens!;this.model.completionTokens += usage.completion_tokens!;
      this.model.estimatedOrReservedUsd += (usage.prompt_tokens!*.15+usage.completion_tokens!*.6)/1e6-upperCost;
      this.model.unknownUsageCalls--;
    };
  }
  snapshot() {
    return {schemaVersion:"social-usage/v1",requests:Object.values(this.providers).reduce((sum,provider)=>sum+provider.requests,0),providers:this.providers,modelScreening:{...this.model,model:"gpt-4o-mini",budgetUsd:this.modelBudgetUsd},browserMinutes:null,actualBilledCostUsd:null,costStatus:"ESTIMATED_OR_UNAVAILABLE",samplingPolicy:"Deterministic highest canonical rule points; ticker breaks ties; maximum 50 targets"};
  }
}
