import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeEvidenceCompleteness, verifyEvidencePackage } from "../app/claimtrace-core";
import { EXECUTABLE_CASES, runExecutableCase } from "../src/cases";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "public");
const OUTPUT = path.join(PUBLIC, "cases");

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const hash = (content: string | Buffer) => createHash("sha256").update(content).digest("hex");

function project(run: Awaited<ReturnType<typeof runExecutableCase>>) {
  return {
    claims: run.claims.map((claim) => ({
      id: claim.id,
      kind: claim.kind,
      baselineStatus: claim.baselineStatus,
      status: claim.status,
      baselineValue: claim.baselineValue,
      currentValue: claim.currentValue,
      evidenceCompleteness: computeEvidenceCompleteness(claim, run.dataset),
    })),
    decisions: run.decisions.map((decision) => ({
      decisionId: decision.decisionId,
      previousOutcome: decision.previousOutcome,
      currentOutcome: decision.currentOutcome,
      status: decision.status,
      recommendedOptionId: decision.analysis?.recommendedOptionId ?? null,
    })),
  };
}

const catalog = [];
for (const definition of EXECUTABLE_CASES) {
  const directory = path.join(OUTPUT, definition.id);
  await mkdir(directory, { recursive: true });
  if (definition.id === "population-health") {
    await writeFile(path.join(directory, "baseline.csv"), await readFile(path.join(PUBLIC, "demo-data", "summary-baseline.csv")));
    await writeFile(path.join(directory, "current.csv"), await readFile(path.join(PUBLIC, "demo-data", "summary-revision.csv")));
    await writeFile(path.join(directory, "upstream-lineage.json"), await readFile(path.join(PUBLIC, "demo-data", "upstream-lineage.json")));
  }
  const baselineText = await readFile(path.join(directory, "baseline.csv"), "utf8");
  const currentText = await readFile(path.join(directory, "current.csv"), "utf8");
  const upstreamLineage = definition.upstreamLineageFile
    ? JSON.parse(await readFile(path.join(PUBLIC, definition.upstreamLineageFile.replace(/^\//, "")), "utf8"))
    : undefined;
  const externalSource = definition.sourceMetadataFile
    ? JSON.parse(await readFile(path.join(PUBLIC, definition.sourceMetadataFile.replace(/^\//, "")), "utf8"))
    : undefined;
  const run = await runExecutableCase(definition, baselineText, currentText, upstreamLineage, externalSource);
  const claimsText = json(definition.claims);
  const decisionsText = json(definition.decisions);
  const expectedText = json({ schemaVersion: "claimtrace-case-audit/1.0.0", caseId: definition.id, generatedAt: definition.expectedGeneratedAt, ...project(run) });
  const evidenceText = json(run.evidencePackage);
  const caseSource = `// Generated from the executable source under src/cases/${definition.id}/case.ts.\nexport default ${JSON.stringify({ id: definition.id, title: definition.title, primaryKey: definition.primaryKey, claims: definition.claims, decisions: definition.decisions }, null, 2)} as const;\n`;
  const upstreamNote = definition.upstreamLineageFile ? " It also includes a verified raw-record-to-summary aggregation lineage." : "";
  const readme = definition.dataOrigin === "PUBLIC"
    ? `# ${definition.title}\n\nReproducible public-data case based on the World Bank World Development Indicators API. The package pins two API responses, their SHA-256 hashes, the access and source-update dates, CC BY 4.0 attribution, a deterministic cleaning log, two cleaned CSV snapshots, executable claim and decision specifications, expected output, and a self-verifiable AuditBundle. The decision-option values remain clearly labeled manual demonstration assumptions; this is a descriptive data-version audit, not a causal or epidemiological study.\n\nRun from the repository root:\n\n\`\`\`bash\nnpm run cases:generate\nnpm run test:unit\n\`\`\`\n\nSource: World Bank, World Development Indicators, SP.DYN.LE00.IN. License: CC BY 4.0. Accessed 2026-08-10. ClaimTrace indicates transformations and does not imply World Bank endorsement.\n`
    : `# ${definition.title}\n\nDeterministic synthetic case. It contains two CSV snapshots, executable claim and decision specifications, expected engine output, and a self-verifiable evidence package.${upstreamNote}\n\nRun from the repository root:\n\n\`\`\`bash\nnpm run cases:generate\nnpm run test:unit\n\`\`\`\n\nThe data are synthetic and do not represent a real institution, user, policy outcome, or production deployment.\n`;
  await writeFile(path.join(directory, "claims.json"), claimsText);
  await writeFile(path.join(directory, "decisions.json"), decisionsText);
  await writeFile(path.join(directory, "expected-audit.json"), expectedText);
  await writeFile(path.join(directory, "evidence-package.json"), evidenceText);
  await writeFile(path.join(directory, "case.ts"), caseSource);
  await writeFile(path.join(directory, "README.md"), readme);

  const verification = await verifyEvidencePackage(run.evidencePackage);
  if (!verification.valid) throw new Error(`${definition.id}: generated evidence package failed verification`);
  const files: Record<string, { sha256: string; bytes: number }> = {};
  const caseFiles = ["baseline.csv", "current.csv", "claims.json", "decisions.json", "expected-audit.json", "evidence-package.json", "case.ts", "README.md"];
  if (definition.upstreamLineageFile) caseFiles.push("upstream-lineage.json");
  if (definition.sourceMetadataFile) caseFiles.push("source-config.json", "source-metadata.json", "cleaning-log.json", "raw-2019.json", "raw-2024.json");
  for (const name of caseFiles) {
    const content = await readFile(path.join(directory, name));
    files[name] = { sha256: hash(content), bytes: content.byteLength };
  }
  const manifest = {
    schemaVersion: "claimtrace-case/2.0.0",
    generatedAt: definition.expectedGeneratedAt,
    synthetic: definition.dataOrigin !== "PUBLIC",
    dataOrigin: definition.dataOrigin ?? "SYNTHETIC",
    sourceMetadataFile: definition.sourceMetadataFile ?? null,
    caseId: definition.id,
    primaryKey: definition.primaryKey,
    claimCount: definition.claims.length,
    decisionCount: definition.decisions.length,
    evidencePackageVerified: true,
    files,
  };
  await writeFile(path.join(directory, "manifest.json"), json(manifest));
  catalog.push(manifest);
}

await writeFile(path.join(OUTPUT, "catalog.json"), json({ generatedAt: "2026-08-10T00:00:00.000Z", description: "Six executable audit cases: five deterministic synthetic cases and one pinned public-data case with source and cleaning lineage.", cases: catalog }));
process.stdout.write(`Generated and verified ${catalog.length} executable case packs.\n`);
