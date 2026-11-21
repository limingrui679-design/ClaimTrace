import { useEffect, useState } from "react";
import type { DatasetVersion, SnapshotSide } from "./claimtrace-core";
import type { auditToleranceHistory } from "../src/core/statistics/tolerance-history";

const reportUrl = "/cases/us-treasury-yield-curve/tolerance-history.json";

interface TreasuryReport {
  snapshotHashes: Record<SnapshotSide, string>;
  sources: { side: SnapshotSide; sha256: string }[];
  history: ReturnType<typeof auditToleranceHistory>;
  monthlyEndpoints: { month: string; observedDates: number; hiddenBreachDates: string[] }[];
}

export function TreasuryHistory({ dataset }: { dataset: DatasetVersion }) {
  const [report, setReport] = useState<TreasuryReport | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    fetch(reportUrl).then(response => {
      if (!response.ok) throw new Error("History could not be loaded.");
      return response.json() as Promise<TreasuryReport>;
    }).then(receipt => { if (active) setReport(receipt); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);

  if (failed) return <p role="status">The archived Treasury history could not be loaded.</p>;
  if (!report) return null;
  if (report.snapshotHashes.baseline !== dataset.baselineMeta.sha256 || report.snapshotHashes.current !== dataset.currentMeta?.sha256
    || !report.sources.every(source => dataset.externalSource?.rawArtifacts.some(raw => raw.side === source.side && raw.sha256 === source.sha256))) return null;
  const { history } = report;
  const masked = report.monthlyEndpoints.filter(month => month.hiddenBreachDates.length > 0);
  return <section className="treasury-history" aria-labelledby="treasury-history-title">
    <div className="panel-head">
      <h2 id="treasury-history-title">Daily Treasury stability history</h2>
      <a href={reportUrl} download="treasury-tolerance-history.json">Download daily audit (JSON)</a>
    </div>
    <div className="treasury-history-body">
      <p>The mean across {history.keys.length} maturities was outside the {history.tolerancePct}% band on <strong>{history.breachCount} of {history.expectedFollowUps} published dates</strong>, measured against {history.baselineDate}.
        {history.peak && <> Its largest deviation was {history.peak.changePct.toFixed(2)}% on {history.peak.date}.</>}</p>
      {masked.map(month => <p key={month.month}><strong>{month.month}</strong> opened and closed inside the band. The mean crossed it on {month.hiddenBreachDates.length} of {month.observedDates} published dates that month.</p>)}
      <table><caption>Observed periods outside the band</caption><thead><tr>
        <th scope="col">First outside</th><th scope="col">First back inside</th><th scope="col">Dates outside</th>
      </tr></thead><tbody>{history.episodes.map(episode => <tr key={episode.firstObservedBreach}>
        <td>{episode.firstObservedBreach}</td><td>{episode.firstObservedRecovery ?? `Open at ${history.endpoint.date}`}</td><td>{episode.breachedObservations}</td>
      </tr>)}</tbody></table>
    </div>
  </section>;
}
