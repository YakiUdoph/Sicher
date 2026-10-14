import {
  getVerifiedCommitment,
  VerifiedCommitmentDataError,
  type VerifiedCommitmentView,
} from "./verifiedCommitments.ts";

export const REAL_COMMITMENT_IDS = Object.freeze(["1", "2"] as const);

export const CORROBORATED_EXPLANATION =
  "Historical evidence was checked across configured operators.";

export const CORROBORATED_LIMITATION =
  "Shared upstream infrastructure means correlated omission cannot be mathematically excluded.";

export type CommitmentPresentation = Readonly<{
  id: string;
  title: string;
  initials: string;
  status: "proven" | "not-proven" | "pending" | "indeterminate";
  statusLabel: string;
  assuranceLabel: string;
  summary: string;
  plainProofType: string;
  technicalProofType: string;
  tokenName: string;
  tokenSymbol: string;
  token: string;
  creator: string;
  subject: string;
  minimumRequired: string;
  startingBalance: string;
  minimumObserved: string;
  finalBalance: string;
  startBlock: string;
  startBlockHash: string;
  endBlock: string;
  endBlockHash: string;
  windowStatus: string;
  breachStatus: string;
  evidenceStatus: string;
  finalityStatus: string;
  receiptDigest: string;
  minimumEvidence: VerifiedCommitmentView["minimumCausingEvidence"];
  provenance: VerifiedCommitmentView["provenance"];
  path: readonly string[];
  limitations: readonly string[];
  providers: readonly string[];
  recoveryNote: string | null;
}>;

export type ExploreState =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "error"; reason: "unavailable" | "validation_error" }>
  | Readonly<{ kind: "success"; commitments: readonly CommitmentPresentation[] }>;

export type ProjectState =
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "not_found" }>
  | Readonly<{ kind: "unavailable" }>
  | Readonly<{ kind: "validation_error" }>
  | Readonly<{ kind: "success"; commitment: CommitmentPresentation }>;

export type CommitmentGetter = (id: string) => Promise<VerifiedCommitmentView>;

const statusByResult = Object.freeze({
  PROVEN: "proven",
  NOT_PROVEN: "not-proven",
  PENDING: "pending",
  INDETERMINATE: "indeterminate",
} as const);

export function toCommitmentPresentation(view: VerifiedCommitmentView): CommitmentPresentation {
  const isObservedBreach = view.breachStatus === "OBSERVED";
  return Object.freeze({
    id: view.id,
    title: `Commitment #${view.id}`,
    initials: `#${view.id}`,
    status: statusByResult[view.proofResult],
    statusLabel: view.proofStatusLabel,
    assuranceLabel: view.assuranceLabel,
    summary: isObservedBreach
      ? "Dropped below the promised minimum before recovering."
      : "Stayed above the promised minimum.",
    plainProofType: `Keep at least ${view.minimumRequiredFormatted}`,
    technicalProofType: view.proofType,
    tokenName: "Sicher Test Token",
    tokenSymbol: view.tokenSymbol,
    token: view.token,
    creator: view.creator,
    subject: view.subject,
    minimumRequired: view.minimumRequiredFormatted,
    startingBalance: view.startingBalanceFormatted,
    minimumObserved: view.minimumObservedFormatted,
    finalBalance: view.finalBalanceFormatted,
    startBlock: view.startBlock,
    startBlockHash: view.startBlockHash,
    endBlock: view.endBlock,
    endBlockHash: view.endBlockHash,
    windowStatus: view.windowStatus,
    breachStatus: view.breachStatus,
    evidenceStatus: view.evidenceStatus,
    finalityStatus: view.finalityStatus,
    receiptDigest: view.receiptDigest,
    minimumEvidence: view.minimumCausingEvidence,
    provenance: view.provenance,
    path: Object.freeze([...(view.pathFormatted ?? [])]),
    limitations: Object.freeze([...view.limitations]),
    providers: Object.freeze([...view.providers]),
    recoveryNote: isObservedBreach
      ? "The balance recovered, but the earlier breach still counts."
      : null,
  });
}

export async function loadExploreState(
  getter: CommitmentGetter = getVerifiedCommitment,
): Promise<ExploreState> {
  try {
    const commitments = await Promise.all(
      REAL_COMMITMENT_IDS.map(async (id) => toCommitmentPresentation(await getter(id))),
    );
    return Object.freeze({ kind: "success", commitments: Object.freeze(commitments) });
  } catch (error) {
    const reason = error instanceof VerifiedCommitmentDataError && error.code === "UNAVAILABLE"
      ? "unavailable"
      : "validation_error";
    return Object.freeze({ kind: "error", reason });
  }
}

export async function loadProjectState(
  id: string,
  getter: CommitmentGetter = getVerifiedCommitment,
): Promise<ProjectState> {
  try {
    return Object.freeze({
      kind: "success",
      commitment: toCommitmentPresentation(await getter(id)),
    });
  } catch (error) {
    if (error instanceof VerifiedCommitmentDataError) {
      if (error.code === "NOT_FOUND") return Object.freeze({ kind: "not_found" });
      if (error.code === "UNAVAILABLE") return Object.freeze({ kind: "unavailable" });
    }
    return Object.freeze({ kind: "validation_error" });
  }
}
