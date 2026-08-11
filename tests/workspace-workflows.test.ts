import assert from "node:assert/strict";
import test from "node:test";
import { DatasetIntentCoordinator } from "../app/workflows/dataset-intent";

test("dataset generations invalidate stale case and file-read work across replacement flows", () => {
  const coordinator = new DatasetIntentCoordinator();
  const firstDataset = coordinator.beginDatasetIntent();
  const firstCase = coordinator.createCaseController(firstDataset);
  const baselineRead = coordinator.beginFileRead("baseline");
  const currentRead = coordinator.beginFileRead("current");

  assert.equal(coordinator.isCurrent(firstDataset), true);
  assert.equal(firstCase.signal.aborted, false);
  assert.equal(coordinator.isCurrentFileRead("baseline", baselineRead), true);
  assert.equal(coordinator.isCurrentFileRead("current", currentRead), true);

  const replacementDataset = coordinator.beginDatasetIntent();

  assert.equal(coordinator.isCurrent(firstDataset), false);
  assert.equal(coordinator.isCurrent(replacementDataset), true);
  assert.equal(firstCase.signal.aborted, true);
  assert.equal(coordinator.isCurrentFileRead("baseline", baselineRead), false);
  assert.equal(coordinator.isCurrentFileRead("current", currentRead), false);
});

test("a case controller created for a stale generation is aborted immediately", () => {
  const coordinator = new DatasetIntentCoordinator();
  const staleDataset = coordinator.beginDatasetIntent();
  coordinator.beginDatasetIntent();

  const staleController = coordinator.createCaseController(staleDataset);

  assert.equal(staleController.signal.aborted, true);
  assert.equal(coordinator.isCurrent(staleDataset), false);
});
