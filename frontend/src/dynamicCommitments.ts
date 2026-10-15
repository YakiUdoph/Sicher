import { formatUnits } from "viem";

import { STEST_ADDRESS } from "./chainConfig.js";
import { toCommitmentPresentation, type CommitmentPresentation } from "./commitmentPresentation.ts";
import {
  validateVerifiedCommitmentsDocument,
  VerifiedCommitmentDataError,
  type VerifiedCommitmentsDocument,
  type VerifiedCommitmentView,
} from "./verifiedCommitments.ts";
import {
  discoverRegistryCommitments,
  RegistryDiscoveryError,
  type RegistryCommitment,
  type RegistrySnapshot,
} from "./registryDiscovery.ts";
import { loadRuntimeResults } from "./runtimeResults.ts";

export type DynamicCommitmentPresentation = Readonly<{
  id: string;
  title: string;
  initials: string;
  status: "proven" | "not-proven" | "pending" | "indeterminate" | "scheduled" | "running" | "awaiting-result" | "checking-result" | "check-delayed";
  statusLabel: string;
  assuranceLabel: string | null;
  summary: string;
  plainProofType: string;
  technicalProofType: string;
  tokenName: string;
  tokenSymbol: string;
  token: string;
  creator: string;
  subject: string;
  minimumRequired: string;
  startingBalance: string | null;
  minimumObserved: string | null;
  finalBalance: string | null;
  startBlock: string;
  startBlockHash: string | null;
  endBlock: string;
  endBlockHash: string | null;
  windowStatus: string;
  breachStatus: string | null;
  evidenceStatus: string;
  finalityStatus: string | null;
  receiptDigest: string | null;
  minimumEvidence: CommitmentPresentation["minimumEvidence"] | null;
  provenance: CommitmentPresentation["provenance"] | null;
  path: readonly string[];
  limitations: readonly string[];
  providers: readonly string[];
  recoveryNote: string | null;
  hasValidatedReceipt: boolean;
  lifecycle: "scheduled" | "running" | "awaiting-result" | "checking-result" | "check-delayed" | "validated";
}>;

export type DynamicExploreState =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "success"; commitments: readonly DynamicCommitmentPresentation[]; onChainCount: number; validatedCount: number; head: string }>
  | Readonly<{ kind: "error"; reason: "registry_unavailable" | "validation_error"; fallback: readonly CommitmentPresentation[] }>;

export type DynamicProjectState =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "not_found" | "unavailable" | "validation_error" }>
  | Readonly<{ kind: "success"; commitment: DynamicCommitmentPresentation }>;

type LoaderOptions = Readonly<{
  discover?: () => Promise<RegistrySnapshot>;
  loadPublished?: () => Promise<VerifiedCommitmentsDocument | PublishedCommitments>;
}>;

type PublicationState = "unconfigured" | "operational" | "delayed";
type PublishedCommitments = Readonly<{ document: VerifiedCommitmentsDocument; publicationState: PublicationState }>;

export async function loadPublishedCommitments(fetchImpl: typeof fetch = fetch): Promise<PublishedCommitments> {
  let response: Response;
  try {
    response = await fetchImpl("/data/commitments.json", { cache: "no-store" });
  } catch {
    throw new VerifiedCommitmentDataError("UNAVAILABLE", "Published receipt data is unavailable.");
  }
  if (!response.ok) throw new VerifiedCommitmentDataError("UNAVAILABLE", "Published receipt data is unavailable.");
  try {
    const prepared = validateVerifiedCommitmentsDocument(await response.json());
    const configuredBase = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_SICHER_RESULTS_BASE_URL;
    const runtime = await loadRuntimeResults({ baseUrl: configuredBase, fetchImpl });
    const merged = { ...prepared.commitments };
    for (const [id, receipt] of Object.entries(runtime.commitments.commitments)) {
      const existing = merged[id];
      if (existing && existing.receiptDigest !== receipt.receiptDigest) throw new VerifiedCommitmentDataError("MALFORMED", `Conflicting published receipt for commitment #${id}.`);
      merged[id] = receipt;
    }
    return Object.freeze({ document: validateVerifiedCommitmentsDocument({ schemaVersion: prepared.schemaVersion, commitments: merged }), publicationState: runtime.state });
  } catch (error) {
    if (error instanceof VerifiedCommitmentDataError) throw error;
    throw new VerifiedCommitmentDataError("MALFORMED", "Published receipt data is malformed.");
  }
}

function termsAgree(registry: RegistryCommitment, receipt: VerifiedCommitmentView): boolean {
  return registry.id === receipt.id
    && registry.creator.toLowerCase() === receipt.creator.toLowerCase()
    && registry.subject.toLowerCase() === receipt.subject.toLowerCase()
    && registry.token.toLowerCase() === receipt.token.toLowerCase()
    && registry.minimumBalanceBaseUnits === receipt.minimumRequiredBaseUnits
    && registry.startBlock === receipt.startBlock
    && registry.endBlock === receipt.endBlock;
}

function lifecycleFor(record: RegistryCommitment, head: bigint): "scheduled" | "running" | "awaiting-result" {
  const start = BigInt(record.startBlock);
  const end = BigInt(record.endBlock);
  if (head < start) return "scheduled";
  if (head <= end) return "running";
  return "awaiting-result";
}

function lifecycleLabel(lifecycle: "scheduled" | "running" | "awaiting-result"): string {
  if (lifecycle === "scheduled") return "Scheduled";
  if (lifecycle === "running") return "Proof running";
  return "Awaiting result";
}

function formattedMinimum(record: RegistryCommitment): string {
  if (record.token.toLowerCase() !== STEST_ADDRESS.toLowerCase()) return `${record.minimumBalanceBaseUnits} base units`;
  const amount = formatUnits(BigInt(record.minimumBalanceBaseUnits), 18);
  const [whole, fraction] = amount.split(".");
  const grouped = BigInt(whole).toLocaleString("en-US");
  return `${fraction ? `${grouped}.${fraction}` : grouped} STEST`;
}

export function presentRegistryCommitment(
  record: RegistryCommitment,
  head: bigint,
  receipt?: VerifiedCommitmentView,
  publicationState: PublicationState = "unconfigured",
): DynamicCommitmentPresentation {
  if (receipt) {
    if (!termsAgree(record, receipt)) {
      throw new VerifiedCommitmentDataError("MALFORMED", `Published receipt terms do not match registry commitment #${record.id}.`);
    }
    return Object.freeze({ ...toCommitmentPresentation(receipt), hasValidatedReceipt: true, lifecycle: "validated" });
  }
  const baseLifecycle = lifecycleFor(record, head);
  const lifecycle = baseLifecycle === "awaiting-result" && publicationState === "operational" ? "checking-result" : baseLifecycle === "awaiting-result" && publicationState === "delayed" ? "check-delayed" : baseLifecycle;
  const minimumRequired = formattedMinimum(record);
  return Object.freeze({
    id: record.id,
    title: `Commitment #${record.id}`,
    initials: `#${record.id}`,
    status: lifecycle,
    statusLabel: lifecycle === "checking-result" ? "Checking result" : lifecycle === "check-delayed" ? "Result check delayed" : lifecycleLabel(lifecycle),
    assuranceLabel: null,
    summary: lifecycle === "scheduled"
      ? "The commitment period has not started."
      : lifecycle === "running"
        ? "The commitment period is currently in progress."
        : lifecycle === "checking-result" ? "The interval has ended and the publication worker is checking for a validated result."
          : lifecycle === "check-delayed" ? "The result publication service is unavailable; no terminal result is shown."
            : "The interval has ended; no validated result has been published yet.",
    plainProofType: `Keep at least ${minimumRequired}`,
    technicalProofType: "MIN_BALANCE",
    tokenName: record.token.toLowerCase() === STEST_ADDRESS.toLowerCase() ? "Sicher Test Token" : "Recorded token",
    tokenSymbol: record.token.toLowerCase() === STEST_ADDRESS.toLowerCase() ? "STEST" : "Token",
    token: record.token,
    creator: record.creator,
    subject: record.subject,
    minimumRequired,
    startingBalance: null,
    minimumObserved: null,
    finalBalance: null,
    startBlock: record.startBlock,
    startBlockHash: null,
    endBlock: record.endBlock,
    endBlockHash: null,
    windowStatus: lifecycle === "scheduled" ? "NOT_STARTED" : lifecycle === "running" ? "ACTIVE" : "COMPLETE",
    breachStatus: null,
    evidenceStatus: "UNPUBLISHED",
    finalityStatus: null,
    receiptDigest: null,
    minimumEvidence: null,
    provenance: null,
    path: Object.freeze([]),
    limitations: Object.freeze([]),
    providers: Object.freeze([]),
    recoveryNote: null,
    hasValidatedReceipt: false,
    lifecycle,
  });
}

export function matchesCommitmentSearch(item: DynamicCommitmentPresentation, query: string): boolean {
  const normalized = query.trim().toLowerCase().replace(/^#/, "");
  return `${item.id} ${item.title} ${item.tokenSymbol} ${item.statusLabel}`.toLowerCase().includes(normalized);
}

function merge(snapshot: RegistrySnapshot, published: VerifiedCommitmentsDocument, publicationState: PublicationState): readonly DynamicCommitmentPresentation[] {
  const records = new Map(snapshot.commitments.map((record) => [record.id, record]));
  for (const id of Object.keys(published.commitments)) {
    if (!records.has(id)) throw new VerifiedCommitmentDataError("MALFORMED", `Published receipt #${id} has no matching registry record.`);
  }
  return Object.freeze(snapshot.commitments.map((record) => presentRegistryCommitment(record, snapshot.head, published.commitments[record.id], publicationState)));
}

export async function loadDynamicExploreState(options: LoaderOptions = {}): Promise<DynamicExploreState> {
  const discover = options.discover ?? discoverRegistryCommitments;
  const loadPublished = options.loadPublished ?? loadPublishedCommitments;
  let published: VerifiedCommitmentsDocument;
  let publicationState: PublicationState = "unconfigured";
  try {
    const loaded = await loadPublished();
    if ("document" in loaded) { published = loaded.document; publicationState = loaded.publicationState; } else published = loaded;
  } catch {
    return Object.freeze({ kind: "error", reason: "validation_error", fallback: Object.freeze([]) });
  }
  try {
    const snapshot = await discover();
    const commitments = merge(snapshot, published, publicationState);
    return Object.freeze({
      kind: "success", commitments,
      onChainCount: commitments.length,
      validatedCount: commitments.filter((item) => item.hasValidatedReceipt).length,
      head: snapshot.head.toString(),
    });
  } catch (error) {
    const reason = error instanceof RegistryDiscoveryError && error.code === "UNAVAILABLE" ? "registry_unavailable" : "validation_error";
    const fallback = reason === "registry_unavailable"
      ? Object.freeze(Object.values(published.commitments).map(toCommitmentPresentation))
      : Object.freeze([]);
    return Object.freeze({ kind: "error", reason, fallback });
  }
}

export async function loadDynamicProjectState(id: string, options: LoaderOptions = {}): Promise<DynamicProjectState> {
  if (!/^[1-9][0-9]*$/.test(id)) return Object.freeze({ kind: "not_found" });
  const state = await loadDynamicExploreState(options);
  if (state.kind === "error") return Object.freeze({ kind: state.reason === "registry_unavailable" ? "unavailable" : "validation_error" });
  if (state.kind !== "success") return Object.freeze({ kind: "unavailable" });
  const commitment = state.commitments.find((item) => item.id === id);
  return commitment ? Object.freeze({ kind: "success", commitment }) : Object.freeze({ kind: "not_found" });
}

