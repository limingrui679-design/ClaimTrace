import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runControlledBenchmark } from "../benchmarks/controlled-benchmark";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "benchmarks", "results.json");
await mkdir(path.dirname(output), { recursive: true });
const result = runControlledBenchmark();
await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
process.stdout.write(`ClaimTrace controlled regression: ${result.metrics.claimtraceCorrect}/${result.scenarioCount}; keyed diff: ${result.metrics.diffOnlyCorrect}/${result.scenarioCount}; metric-only: ${result.metrics.metricOnlyCorrect}/${result.scenarioCount}; line/scalar: ${result.metrics.naiveCorrect}/${result.scenarioCount}.\n`);
