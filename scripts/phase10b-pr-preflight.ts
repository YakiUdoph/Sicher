import { readStoreDirectory, validatePublicationTransition } from "./phase10b-pr-publication.ts";

const beforeRoot = process.env.PHASE10B_BASELINE_ROOT?.trim(); const afterRoot = process.env.PHASE10B_RESULTS_ROOT?.trim();
if (!beforeRoot || !afterRoot) throw new Error("PHASE10B_BASELINE_ROOT and PHASE10B_RESULTS_ROOT are required.");
const transition = validatePublicationTransition(await readStoreDirectory(beforeRoot), await readStoreDirectory(afterRoot));
console.log(`transition=${transition.newId ? `commitment-${transition.newId}` : "scheduler-only"} changedFiles=${transition.changedFiles.join(",")}`);
