export type FileReadSide = "baseline" | "current";

/**
 * Owns the monotonic generation shared by every dataset-replacement flow.
 * UI code may start case fetches and local file reads through this coordinator,
 * but only work belonging to the current generation may commit state.
 */
export class DatasetIntentCoordinator {
  private generation = 0;
  private fileReadGeneration: Record<FileReadSide, number> = { baseline: 0, current: 0 };
  private caseController: AbortController | null = null;

  current(): number {
    return this.generation;
  }

  beginDatasetIntent(): number {
    this.generation += 1;
    this.caseController?.abort();
    this.caseController = null;
    this.invalidateFileReads();
    return this.generation;
  }

  isCurrent(generation: number): boolean {
    return generation === this.generation;
  }

  beginFileRead(side: FileReadSide): number {
    this.fileReadGeneration[side] += 1;
    return this.fileReadGeneration[side];
  }

  isCurrentFileRead(side: FileReadSide, generation: number): boolean {
    return generation === this.fileReadGeneration[side];
  }

  invalidateFileReads(): void {
    this.fileReadGeneration.baseline += 1;
    this.fileReadGeneration.current += 1;
  }

  createCaseController(generation: number): AbortController {
    const controller = new AbortController();
    if (!this.isCurrent(generation)) {
      controller.abort();
      return controller;
    }
    this.caseController?.abort();
    this.caseController = controller;
    return controller;
  }

  clearCaseController(generation: number, controller: AbortController): void {
    if (this.isCurrent(generation) && this.caseController === controller) {
      this.caseController = null;
    }
  }
}
