import { EXECUTABLE_CASES, runExecutableCase } from "../../src/cases";
import type { ExternalSourceProvenance, UpstreamLineage } from "../claimtrace-core";

export async function loadExecutableCase(caseId: string, signal: AbortSignal) {
  const definition = EXECUTABLE_CASES.find((item) => item.id === caseId);
  if (!definition) return null;

  const [baselineResponse, currentResponse, upstreamResponse, sourceResponse] = await Promise.all([
    fetch(definition.baselineFile, { signal }),
    fetch(definition.currentFile, { signal }),
    definition.upstreamLineageFile ? fetch(definition.upstreamLineageFile, { signal }) : Promise.resolve(null),
    definition.sourceMetadataFile ? fetch(definition.sourceMetadataFile, { signal }) : Promise.resolve(null),
  ]);
  if (!baselineResponse.ok || !currentResponse.ok) throw new Error("Case snapshots could not be loaded");
  if (upstreamResponse && !upstreamResponse.ok) throw new Error("Case upstream lineage could not be loaded");
  if (sourceResponse && !sourceResponse.ok) throw new Error("Case external-source metadata could not be loaded");

  const upstreamLineage = upstreamResponse ? await upstreamResponse.json() as UpstreamLineage : undefined;
  const externalSource = sourceResponse ? await sourceResponse.json() as ExternalSourceProvenance : undefined;
  const run = await runExecutableCase(
    definition,
    await baselineResponse.text(),
    await currentResponse.text(),
    upstreamLineage,
    externalSource,
  );
  return { definition, run };
}
