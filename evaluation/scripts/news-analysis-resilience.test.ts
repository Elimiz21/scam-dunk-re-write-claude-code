import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  buildDegradedScanAlertPayload,
  applyProviderMetadataPolicy,
  encodeRawProviderMetadata,
  validateCapturedProviderMetadata,
  createRunJournal,
  parseNewsAnalysisResponse,
  readRunJournal,
  recordProviderCapture,
  persistCaptureBeforeValidation,
  processProviderBatchAttempt,
  recordSourceEvidence,
  registerJournalTasks,
  retryJournalTasks,
  selectRetryTasks,
  transitionSemanticValidation,
  writeRunJournalAtomic,
} from "./news-analysis-resilience";
import { evaluateScanPublication } from "../../shared/scan-publication";

function persistTestCapture(journal: any, input: any) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scamdunk-test-capture-"));
  return persistCaptureBeforeValidation(path.join(dir, "run.json"), journal, input);
}

describe("parseNewsAnalysisResponse", () => {
  it("salvages valid siblings and quarantines only malformed and duplicate expected symbols", () => {
    const parsed = parseNewsAnalysisResponse(
      JSON.stringify({
        results: [
          { symbol: "GOOD", hasLegitimateNews: true, explanation: "Earnings", specificEvent: null },
          { symbol: "BAD", hasLegitimateNews: "yes", explanation: "No" },
          { symbol: "DUP", hasLegitimateNews: false, explanation: "First" },
          { symbol: "dup", hasLegitimateNews: false, explanation: "Second" },
        ],
      }),
      ["GOOD", "BAD", "DUP", "MISSING"],
    );

    expect([...parsed.valid.keys()]).toEqual(["GOOD"]);
    expect(parsed.quarantined.map((item) => item.symbol)).toEqual([
      "BAD",
      "DUP",
      "MISSING",
    ]);
    expect(parsed.quarantined.find((item) => item.symbol === "BAD")?.reason).toMatch(/malformed/i);
    expect(parsed.quarantined.find((item) => item.symbol === "DUP")?.reason).toMatch(/duplicate/i);
    expect(parsed.quarantined.find((item) => item.symbol === "MISSING")?.reason).toMatch(/missing/i);
  });

  it("records unexpected rows as anomalies without discarding valid expected rows", () => {
    const parsed = parseNewsAnalysisResponse(
      { results: [
        { symbol: "GOOD", hasLegitimateNews: false, explanation: "No dated event", specificEvent: null },
        { symbol: "EXTRA", hasLegitimateNews: true, explanation: "Unexpected" },
      ] },
      ["GOOD"],
    );

    expect(parsed.valid.get("GOOD")?.hasLegitimateNews).toBe(false);
    expect(parsed.anomalies).toContain("unexpected-symbol:EXTRA");
    expect(parsed.degraded).toBe(true);
  });

  it("quarantines every expected symbol for malformed top-level JSON without throwing", () => {
    const parsed = parseNewsAnalysisResponse("not-json", ["A", "B"]);
    expect(parsed.malformedTopLevel).toBe(true);
    expect(parsed.valid.size).toBe(0);
    expect(parsed.quarantined.map((item) => item.symbol)).toEqual(["A", "B"]);
    expect(selectRetryTasks(createRunJournal({ scanDate: "2026-08-19" }), ["A"]).length).toBe(0);
  });
});

describe("provider metadata policy", () => {
  it("preserves non-finite raw values while rejecting malformed metadata and usage", () => {
    expect(encodeRawProviderMetadata({ nan: Number.NaN, pos: Infinity, neg: -Infinity })).toEqual({ nan: "[NaN]", pos: "[Infinity]", neg: "[-Infinity]" });
    const invalid = validateCapturedProviderMetadata({ responseId: "", model: null, rawResponse: null, usage: { promptTokens: -1, completionTokens: 1, totalTokens: 0 }, pricing: { inputPerMillion: 1, outputPerMillion: 2 } });
    expect(invalid.anomalies).toEqual(expect.arrayContaining(["malformed-response-id", "malformed-model", "malformed-response-content", "malformed-provider-usage"]));
    expect(invalid.estimatedCostUsd).toBeNull();
    expect(validateCapturedProviderMetadata({ responseId: "r", model: "m", rawResponse: "{}", usage: { promptTokens: 2, completionTokens: 3, totalTokens: 5 }, pricing: { inputPerMillion: 1, outputPerMillion: 2 } }).estimatedCostUsd).toBeCloseTo(0.000008);
  });

  it("quarantines every symbol when metadata is anomalous", () => {
    const parsed = parseNewsAnalysisResponse({ results: [{ symbol: "ABC", hasLegitimateNews: true, explanation: "event" }] }, ["ABC", "DEF"]);
    const policy = applyProviderMetadataPolicy(parsed, ["ABC", "DEF"], ["malformed-provider-usage"]);
    expect([...policy.validSymbols]).toEqual([]);
    expect(policy.quarantined).toEqual([{ symbol: "ABC", reason: "malformed-provider-metadata" }, { symbol: "DEF", reason: "malformed-provider-metadata" }]);
  });

  it("continues valid batches while preserving malformed metadata and quarantining only that batch", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scamdunk-provider-metadata-continuation-"));
    const journalPath = path.join(dir, "run.json");
    const malformedSymbols = ["BAD1", "BAD2"];
    const validSymbols = ["GOOD"];
    const malformedRawResponse = JSON.stringify({ results: malformedSymbols.map((symbol) => ({ symbol, hasLegitimateNews: true, explanation: "event", specificEvent: null })) });
    const validRawResponse = JSON.stringify({ results: [{ symbol: "GOOD", hasLegitimateNews: false, explanation: "No dated event", specificEvent: null }] });
    const malformedUsage = { promptTokens: -1, completionTokens: Number.NaN, totalTokens: Number.POSITIVE_INFINITY };
    let journal = createRunJournal({ scanDate: "2026-08-19", generationId: "gen-provider-metadata" });
    journal = registerJournalTasks(journal, malformedSymbols, "batch-1");
    journal = registerJournalTasks(journal, validSymbols, "batch-2");
    journal = recordSourceEvidence(journal, malformedSymbols, { news: [] }, "batch-1");
    journal = recordSourceEvidence(journal, validSymbols, { news: [] }, "batch-2");

    const malformedResult = processProviderBatchAttempt({
      journalPath,
      journal,
      batchId: "batch-1",
      expectedSymbols: malformedSymbols,
      prompt: "malformed metadata prompt",
      rawResponse: malformedRawResponse,
      responseId: null,
      model: null,
      rawUsage: malformedUsage,
      pricing: { inputPerMillion: 0.1, outputPerMillion: 0.2 },
    });
    journal = malformedResult.journal;
    const malformedAttempt = readRunJournal(journalPath).tasks["2026-08-19:BAD1"].attempts[0];
    expect(malformedAttempt.rawResponse).toBe(malformedRawResponse);
    expect(malformedAttempt.rawProviderMetadata).toEqual({ responseId: null, model: null, rawResponse: malformedRawResponse, usage: { promptTokens: -1, completionTokens: "[NaN]", totalTokens: "[Infinity]" } });
    expect(malformedAttempt.tokenUsage).toBeNull();
    expect(malformedAttempt.estimatedCostUsd).toBeNull();
    expect(malformedResult.normalizedUsage).toBeNull();
    expect(malformedResult.normalizedCostUsd).toBeNull();
    expect([...malformedResult.validRows.keys()]).toEqual([]);
    expect(malformedResult.disposition.quarantined).toEqual(malformedSymbols.map((symbol) => ({ symbol, reason: "malformed-provider-metadata" })));
    expect(malformedResult.disposition.degraded).toBe(true);

    const validUsage = { promptTokens: 2, completionTokens: 3, totalTokens: 5 };
    const validResult = processProviderBatchAttempt({
      journalPath,
      journal,
      batchId: "batch-2",
      expectedSymbols: validSymbols,
      prompt: "valid metadata prompt",
      rawResponse: validRawResponse,
      responseId: "resp-good",
      model: "model-good",
      rawUsage: validUsage,
      pricing: { inputPerMillion: 0.1, outputPerMillion: 0.2 },
    });
    journal = validResult.journal;
    expect(validResult.normalizedUsage).toEqual(validUsage);
    expect(validResult.normalizedCostUsd).toBeCloseTo(0.0000008);
    expect([...validResult.validRows.keys()]).toEqual(["GOOD"]);

    expect(journal.tasks["2026-08-19:BAD1"].state).toBe("quarantined");
    expect(journal.tasks["2026-08-19:BAD2"].state).toBe("quarantined");
    expect(journal.tasks["2026-08-19:GOOD"].state).toBe("resolved");
    expect(journal.batches["batch-1"].degraded).toBe(true);
    const badAttempt = journal.tasks["2026-08-19:BAD1"].attempts[0];
    const goodAttempt = journal.tasks["2026-08-19:GOOD"].attempts[0];
    expect(badAttempt.tokenUsage).toBeNull();
    expect(badAttempt.estimatedCostUsd).toBeNull();
    expect(goodAttempt.tokenUsage).toEqual(validUsage);
    expect(goodAttempt.estimatedCostUsd).toBeCloseTo(0.0000008);
    const allAttempts = Object.values(journal.tasks).flatMap((task) => task.attempts);
    expect(allAttempts.filter((attempt) => attempt.tokenUsage !== null)).toEqual([goodAttempt]);
    expect(allAttempts.filter((attempt) => attempt.estimatedCostUsd !== null)).toEqual([goodAttempt]);
    const metricDeltas = [malformedResult.metricDeltas, validResult.metricDeltas].reduce((total, delta) => ({
      promptTokens: total.promptTokens + delta.promptTokens,
      completionTokens: total.completionTokens + delta.completionTokens,
      quarantinedRows: total.quarantinedRows + delta.quarantinedRows,
      responseAnomalies: total.responseAnomalies + delta.responseAnomalies,
    }), { promptTokens: 0, completionTokens: 0, quarantinedRows: 0, responseAnomalies: 0 });
    expect(metricDeltas).toEqual({ promptTokens: 2, completionTokens: 3, quarantinedRows: 2, responseAnomalies: 3 });
    const status = {
      date: "2026-08-19",
      pipelineStatus: "completed",
      completedAt: "2026-08-19T01:00:00.000Z",
      phases: Object.fromEntries(["phase0_socialEarlyWarning", "phase1_riskScoring", "phase2_sizeFiltering", "phase3_newsAnalysis", "phase4_socialMedia", "phase5_schemeTracking"].map((name) => [name, { status: "completed", details: {} }])),
      summary: { newsAnalysisMetrics: { failedModelCalls: 0, candidatesDeferred: 0, unavailableModelBatches: 0, quarantinedRows: 2, responseAnomalies: 3, unresolvedTasks: 2, replayRequested: 0, replayMissing: 0, evidenceSourceFailures: 0 } },
      recovery: { generationId: "gen-provider-metadata", journalFile: "journal.json", unresolvedSymbols: malformedSymbols, unresolvedCount: 2, degraded: true },
    };
    expect(evaluateScanPublication(status, "2026-08-19").publishable).toBe(false);
  });

  it("rejects inconsistent totals and non-string provider content", () => {
    const invalid = validateCapturedProviderMetadata({ responseId: "resp", model: "model", rawResponse: { results: [] }, usage: { promptTokens: 2, completionTokens: 3, totalTokens: 99 }, pricing: { inputPerMillion: 0.1, outputPerMillion: 0.2 } });
    expect(invalid.anomalies).toEqual(expect.arrayContaining(["malformed-response-content", "malformed-provider-usage"]));
    expect(invalid.normalizedUsage).toBeNull();
    expect(invalid.estimatedCostUsd).toBeNull();
  });
});

describe("run journal", () => {
  it("atomically records nullable provider failure provenance before quarantine", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scamdunk-provider-failure-"));
    const journalPath = path.join(dir, "run.json");
    let journal = registerJournalTasks(createRunJournal({ scanDate: "2026-08-19" }), ["ABC"], "batch-1");
    journal = recordSourceEvidence(journal, ["ABC"], { news: [] }, "batch-1");
    journal = persistCaptureBeforeValidation(journalPath, journal, {
      batchId: "batch-1", prompt: "p", rawResponse: null, responseId: null, model: null,
      tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, pricingSnapshot: { inputPerMillion: 0.1, outputPerMillion: 0.2 }, estimatedCostUsd: 0,
      providerFailure: { type: "TimeoutError", message: "provider timed out" },
    });
    const attempt = readRunJournal(journalPath).tasks["2026-08-19:ABC"].attempts[0];
    expect(attempt).toMatchObject({ rawResponse: null, responseId: null, model: null, providerFailure: { type: "TimeoutError" }, semanticValidation: "pending" });
    journal = transitionSemanticValidation(journal, { batchId: "batch-1", validSymbols: [], quarantined: [{ symbol: "ABC", reason: "provider-failure" }], degraded: true });
    expect(journal.tasks["2026-08-19:ABC"].state).toBe("quarantined");
  });

  it("persists nullable metadata and malformed usage before anomaly classification", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scamdunk-raw-capture-"));
    const journalPath = path.join(dir, "run.json");
    let journal = registerJournalTasks(createRunJournal({ scanDate: "2026-08-19" }), ["ABC"], "batch-1");
    journal = recordSourceEvidence(journal, ["ABC"], { news: [] }, "batch-1");
    journal = persistCaptureBeforeValidation(journalPath, journal, { batchId: "batch-1", prompt: "p", rawResponse: null, responseId: null, model: null, tokenUsage: { promptTokens: -1 }, pricingSnapshot: { inputPerMillion: 0, outputPerMillion: 0 }, estimatedCostUsd: null });
    expect(readRunJournal(journalPath).tasks["2026-08-19:ABC"].attempts[0]).toMatchObject({ rawResponse: null, responseId: null, model: null, tokenUsage: { promptTokens: -1 }, estimatedCostUsd: null });
  });
  it("persists evidence before provider capture and validation, atomically", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scamdunk-journal-"));
    const journalPath = path.join(dir, "run.json");
    let journal = createRunJournal({ scanDate: "2026-08-19", generationId: "gen-1", generatedAt: "2026-08-19T00:00:00.000Z" });
    journal = registerJournalTasks(journal, ["ABC"], "batch-1");
    journal = recordSourceEvidence(journal, ["ABC"], { news: [{ title: "headline" }], secFilings: [] }, "batch-1");
    writeRunJournalAtomic(journalPath, journal);
    const before = readRunJournal(journalPath);
    expect(before.tasks["2026-08-19:ABC"].sourceEvidenceSnapshots).toHaveLength(1);
    expect(before.tasks["2026-08-19:ABC"].attempts).toHaveLength(0);

    journal = persistCaptureBeforeValidation(journalPath, journal, {
      batchId: "batch-1",
      prompt: "exact prompt",
      rawResponse: '{"results":[]}',
      responseId: "resp-1",
      model: "gpt-4o-mini",
      tokenUsage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      pricingSnapshot: { inputPerMillion: 0.15, outputPerMillion: 0.6 },
      estimatedCostUsd: 0.0000135,
    });
    const captured = readRunJournal(journalPath);
    expect(captured.tasks["2026-08-19:ABC"].attempts[0]).toMatchObject({
      prompt: "exact prompt",
      rawResponse: '{"results":[]}',
      responseId: "resp-1",
      estimatedCostUsd: 0.0000135,
    });

    const validated = transitionSemanticValidation(captured, {
      validSymbols: [],
      quarantined: [{ symbol: "ABC", reason: "missing" }],
      batchId: "batch-1",
    });
    expect(validated.tasks["2026-08-19:ABC"].state).toBe("quarantined");
    expect(validated.tasks["2026-08-19:ABC"].attempts[0].semanticValidation).toBe("quarantined");
  });

  it("keeps registration and retries idempotent and only selects known unresolved tasks", () => {
    let journal = createRunJournal({ scanDate: "2026-08-19", generationId: "gen-1" });
    journal = registerJournalTasks(journal, ["ABC", "DONE"], "batch-1");
    journal = recordSourceEvidence(journal, ["ABC", "DONE"], { news: [] }, "batch-1");
    journal = persistTestCapture(journal, {
      batchId: "batch-1", prompt: "p", rawResponse: "{}", responseId: "r", model: "m",
      tokenUsage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, pricingSnapshot: { inputPerMillion: 0.1, outputPerMillion: 0.2 }, estimatedCostUsd: 0,
    });
    journal = transitionSemanticValidation(journal, { validSymbols: ["DONE"], quarantined: [], batchId: "batch-1" });
    journal = registerJournalTasks(journal, ["ABC", "DONE"], "batch-1");
    expect(Object.keys(journal.tasks)).toHaveLength(2);
    expect(journal.tasks["2026-08-19:DONE"].state).toBe("resolved");
    expect(selectRetryTasks(journal, ["ABC", "DONE", "UNKNOWN"])).toEqual(["2026-08-19:ABC"]);
  });

  it("does not reopen resolved work unless an explicit retry transition is requested", () => {
    let journal = createRunJournal({ scanDate: "2026-08-19", generationId: "gen-1" });
    journal = registerJournalTasks(journal, ["ABC"], "batch-1");
    journal = recordSourceEvidence(journal, ["ABC"], { news: [] }, "batch-1");
    journal = persistTestCapture(journal, {
      batchId: "batch-1", prompt: "p", rawResponse: "{}", responseId: "r", model: "m",
      tokenUsage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, pricingSnapshot: { inputPerMillion: 0.1, outputPerMillion: 0.2 }, estimatedCostUsd: 0,
    });
    journal = transitionSemanticValidation(journal, { validSymbols: ["ABC"], quarantined: [], batchId: "batch-1" });
    journal = transitionSemanticValidation(journal, { validSymbols: [], quarantined: [{ symbol: "ABC", reason: "malformed" }], batchId: "batch-1" });
    expect(journal.tasks["2026-08-19:ABC"].state).toBe("resolved");
    journal = retryJournalTasks(journal, ["ABC"], "batch-2");
    expect(journal.tasks["2026-08-19:ABC"].state).toBe("pending");
    expect(journal.tasks["2026-08-19:ABC"].retryCount).toBe(1);
    expect(journal.tasks["2026-08-19:ABC"].batchIds).toContain("batch-2");
  });

  it("ignores unknown retry symbols and does not duplicate the same retry batch", () => {
    let journal = createRunJournal({ scanDate: "2026-08-19", generationId: "gen-1" });
    journal = registerJournalTasks(journal, ["ABC"], "batch-1");
    journal = recordSourceEvidence(journal, ["ABC"], { news: [] }, "batch-1");
    journal = persistTestCapture(journal, {
      batchId: "batch-1", prompt: "p", rawResponse: "{}", responseId: "r", model: "m",
      tokenUsage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, pricingSnapshot: { inputPerMillion: 0.1, outputPerMillion: 0.2 }, estimatedCostUsd: 0,
    });
    journal = transitionSemanticValidation(journal, { validSymbols: [], quarantined: [{ symbol: "ABC", reason: "missing" }], batchId: "batch-1" });
    journal = retryJournalTasks(journal, ["ABC", "abc", "UNKNOWN"], "batch-2");
    journal = retryJournalTasks(journal, ["ABC", "abc", "UNKNOWN"], "batch-2");
    expect(Object.keys(journal.tasks)).toEqual(["2026-08-19:ABC"]);
    expect(journal.tasks["2026-08-19:ABC"].retryCount).toBe(1);
    expect(journal.batches["batch-2"].taskIds).toEqual(["2026-08-19:ABC"]);
  });

  it("rejects provider capture and semantic validation when provenance ordering is incomplete", () => {
    let journal = registerJournalTasks(createRunJournal({ scanDate: "2026-08-19" }), ["ABC"], "batch-1");
    expect(() => recordProviderCapture(journal, { batchId: "unknown", prompt: "p", rawResponse: "{}" } as any)).toThrow(/unknown batch/i);
    journal = recordSourceEvidence(journal, ["ABC"], { news: [] }, "batch-1");
    expect(() => transitionSemanticValidation(journal, { batchId: "batch-1", validSymbols: ["ABC"], quarantined: [] })).toThrow(/provider capture|attempt/i);
  });

  it("rejects a provider capture when evidence belongs to a different batch", () => {
    let journal = registerJournalTasks(createRunJournal({ scanDate: "2026-08-19" }), ["ABC"], "batch-1");
    journal = recordSourceEvidence(journal, ["ABC"], { news: [] }, "batch-1");
    journal = registerJournalTasks(journal, ["ABC"], "batch-2");
    expect(() => recordProviderCapture(journal, {
      batchId: "batch-2", prompt: "p", rawResponse: "{}", responseId: "r", model: "m",
      tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, pricingSnapshot: { inputPerMillion: 0, outputPerMillion: 0 }, estimatedCostUsd: 0,
    })).toThrow(/fresh source evidence/i);
  });

  it("rejects validation when the only provider attempt belongs to another batch", () => {
    let journal = registerJournalTasks(createRunJournal({ scanDate: "2026-08-19" }), ["ABC"], "batch-1");
    journal = recordSourceEvidence(journal, ["ABC"], { news: [] }, "batch-1");
    journal = registerJournalTasks(journal, ["ABC"], "batch-2");
    journal = recordSourceEvidence(journal, ["ABC"], { news: [] }, "batch-2");
    journal = persistTestCapture(journal, {
      batchId: "batch-2", prompt: "p", rawResponse: "{}", responseId: "r", model: "m",
      tokenUsage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, pricingSnapshot: { inputPerMillion: 0.1, outputPerMillion: 0.2 }, estimatedCostUsd: 0,
    });
    expect(() => transitionSemanticValidation(journal, { batchId: "batch-1", validSymbols: ["ABC"], quarantined: [] })).toThrow(/provider capture|attempt/i);
  });

  it("atomically persists a provider capture before semantic validation", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scamdunk-capture-"));
    const journalPath = path.join(dir, "run.json");
    let journal = registerJournalTasks(createRunJournal({ scanDate: "2026-08-19" }), ["ABC"], "batch-1");
    journal = recordSourceEvidence(journal, ["ABC"], { news: [] }, "batch-1");
    const persisted = persistCaptureBeforeValidation(journalPath, journal, {
      batchId: "batch-1", prompt: "p", rawResponse: "{}", responseId: "r", model: "m",
      tokenUsage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      pricingSnapshot: { inputPerMillion: 0.1, outputPerMillion: 0.2 }, estimatedCostUsd: 0.000001,
    });
    expect(readRunJournal(journalPath).tasks["2026-08-19:ABC"].attempts).toHaveLength(1);
    expect(persisted.tasks["2026-08-19:ABC"].attempts[0].semanticValidation).toBe("pending");
  });

  it("rejects an in-memory capture and accepts only the successfully persisted capture", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scamdunk-durable-capture-"));
    const journalPath = path.join(dir, "run.json");
    let journal = registerJournalTasks(createRunJournal({ scanDate: "2026-08-19" }), ["ABC"], "batch-1");
    journal = recordSourceEvidence(journal, ["ABC"], { news: [] }, "batch-1");
    const capture = {
      batchId: "batch-1", prompt: "p", rawResponse: "{}", responseId: "r", model: "m",
      tokenUsage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, pricingSnapshot: { inputPerMillion: 0.1, outputPerMillion: 0.2 }, estimatedCostUsd: 0,
    };
    const inMemory = recordProviderCapture(journal, capture);
    expect(() => transitionSemanticValidation(inMemory, { batchId: "batch-1", validSymbols: ["ABC"], quarantined: [] })).toThrow(/durable|persist/i);
    const persisted = persistCaptureBeforeValidation(journalPath, journal, capture);
    const resolved = transitionSemanticValidation(persisted, { batchId: "batch-1", validSymbols: ["ABC"], quarantined: [] });
    expect(resolved.tasks["2026-08-19:ABC"].state).toBe("resolved");
  });

  it("requires durability for the exact latest provider attempt in a batch", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scamdunk-durable-attempt-"));
    const journalPath = path.join(dir, "run.json");
    let journal = registerJournalTasks(createRunJournal({ scanDate: "2026-08-19" }), ["ABC"], "batch-1");
    journal = recordSourceEvidence(journal, ["ABC"], { news: [] }, "batch-1");
    const firstCapture = {
      batchId: "batch-1", prompt: "attempt 1", rawResponse: '{"attempt":1}', responseId: "r-1", model: "m",
      tokenUsage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, pricingSnapshot: { inputPerMillion: 0.1, outputPerMillion: 0.2 }, estimatedCostUsd: 0,
    };
    const secondCapture = {
      batchId: "batch-1", prompt: "attempt 2", rawResponse: '{"attempt":2}', responseId: "r-2", model: "m",
      tokenUsage: { promptTokens: 2, completionTokens: 2, totalTokens: 4 }, pricingSnapshot: { inputPerMillion: 0.1, outputPerMillion: 0.2 }, estimatedCostUsd: 0,
    };

    const persistedFirst = persistCaptureBeforeValidation(journalPath, journal, firstCapture);
    expect(() => recordProviderCapture(persistedFirst, secondCapture)).toThrow(/fresh source evidence/i);
    const refreshed = recordSourceEvidence(persistedFirst, ["ABC"], { news: [{ title: "refreshed" }] }, "batch-1");
    const unpersistedSecond = recordProviderCapture(refreshed, secondCapture);

    expect(() => transitionSemanticValidation(unpersistedSecond, {
      batchId: "batch-1", validSymbols: ["ABC"], quarantined: [],
    })).toThrow(/durable|persist/i);

    const persistedSecond = persistCaptureBeforeValidation(journalPath, refreshed, secondCapture);
    const resolved = transitionSemanticValidation(persistedSecond, {
      batchId: "batch-1", validSymbols: ["ABC"], quarantined: [],
    });
    const attempts = resolved.tasks["2026-08-19:ABC"].attempts;
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toMatchObject({ attempt: 1, responseId: "r-1", semanticValidation: "pending" });
    expect(attempts[1]).toMatchObject({ attempt: 2, responseId: "r-2", semanticValidation: "resolved" });
    expect(resolved.tasks["2026-08-19:ABC"].state).toBe("resolved");
  });

  it("persists response anomalies on the batch attempt while retaining valid resolutions", () => {
    let journal = registerJournalTasks(createRunJournal({ scanDate: "2026-08-19" }), ["ABC", "DEF"], "batch-1");
    journal = recordSourceEvidence(journal, ["ABC", "DEF"], { news: [] }, "batch-1");
    journal = persistTestCapture(journal, {
      batchId: "batch-1", prompt: "p", rawResponse: "{}", responseId: "r", model: "m",
      tokenUsage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      pricingSnapshot: { inputPerMillion: 0.1, outputPerMillion: 0.2 }, estimatedCostUsd: 0.000001,
    });
    journal = transitionSemanticValidation(journal, {
      batchId: "batch-1", validSymbols: ["ABC"], quarantined: [{ symbol: "DEF", reason: "missing" }],
      degraded: true, anomalyCodes: ["unexpected-symbol:EXTRA"], malformedTopLevel: false,
    });
    expect(journal.batches["batch-1"].degraded).toBe(true);
    expect(journal.tasks["2026-08-19:ABC"].state).toBe("resolved");
    expect(journal.tasks["2026-08-19:DEF"].state).toBe("quarantined");
    expect(journal.tasks["2026-08-19:ABC"].attempts[0].anomalyCodes).toEqual(["unexpected-symbol:EXTRA"]);
  });

  it("keeps append-only quarantine reasons in the journal transition history", () => {
    let journal = registerJournalTasks(createRunJournal({ scanDate: "2026-08-19" }), ["ABC"], "batch-1");
    journal = recordSourceEvidence(journal, ["ABC"], { news: [] }, "batch-1");
    journal = persistTestCapture(journal, { batchId: "batch-1", prompt: "p", rawResponse: "{}", responseId: "r", model: "m", tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }, pricingSnapshot: { inputPerMillion: 0, outputPerMillion: 0 }, estimatedCostUsd: 0 });
    journal = transitionSemanticValidation(journal, { batchId: "batch-1", validSymbols: [], quarantined: [{ symbol: "ABC", reason: "missing-expected-symbol" }], degraded: true });
    expect(journal.tasks["2026-08-19:ABC"].transitions.at(-1)).toMatchObject({ from: "pending", to: "quarantined", reason: "missing-expected-symbol", batchId: "batch-1", attempt: 1 });
  });
});

describe("buildDegradedScanAlertPayload", () => {
  it("includes actionable recovery data and does not copy secrets", () => {
    const payload = buildDegradedScanAlertPayload({
      scanDate: "2026-08-19",
      generation: "gen-1",
      affectedSymbols: ["ABC", "DEF"],
      counts: { quarantined: 2, malformedResponses: 1, deferred: 3 },
      costUsd: 1.25,
      malformedResponseCostUsd: 0.5,
      recoveryFile: "evaluation/results/recovery/gen-1.json",
      replayInstructions: "replay --date 2026-08-19 --symbols ABC,DEF --api-key=secret",
      workflowUrl: "https://github.com/example/repo/actions/runs/123",
    });
    expect(payload.affectedSymbolCount).toBe(2);
    expect(payload.costUsd).toBe(1.75);
    expect(payload.recoveryFile).toContain("gen-1.json");
    expect(payload.replayInstructions).toContain("ABC,DEF");
    expect(JSON.stringify(payload)).not.toMatch(/secret|api-key/i);
    expect(payload.workflowUrl).toContain("actions/runs/123");
  });
});
