import { readStoreDirectory, validatePublicationTransition } from "./phase10b-pr-publication.ts";
import { readExpectedPublicationTransition } from "./phase10b-transition-provenance.ts";

const beforeRoot = process.env.PHASE10B_BASELINE_ROOT?.trim(); const afterRoot = process.env.PHASE10B_RESULTS_ROOT?.trim();
const expectedPath = process.env.PHASE10B_EXPECTED_TRANSITION_PATH?.trim();
if (!beforeRoot || !afterRoot || !expectedPath) throw new Error("PHASE10B_BASELINE_ROOT, PHASE10B_RESULTS_ROOT, and PHASE10B_EXPECTED_TRANSITION_PATH are required.");
const transition = validatePublicationTransition(await readStoreDirectory(beforeRoot), await readStoreDirectory(afterRoot), await readExpectedPublicationTransition(expectedPath));
console.log(`transition=${transition.newId ? `commitment-${transition.newId}` : "scheduler-only"} changedFiles=${transition.changedFiles.join(",")}`);
