"""Recompute the shipped annual tolerance history using stdlib XML parsing and Decimal."""
import json
from collections import defaultdict
from decimal import Decimal
from pathlib import Path
from xml.etree import ElementTree

CASE = Path(__file__).resolve().parents[1] / "public" / "cases" / "us-treasury-yield-curve"


def verify():
    config = json.loads((CASE / "source-config.json").read_text())
    params = config["cleaning"]["parameters"]
    claims = json.loads((CASE / "claims.json").read_text())
    rule = next(c["rule"] for c in claims if c["code"] == "UST-003")
    receipt = json.loads((CASE / "tolerance-history.json").read_text())
    history = receipt["history"]
    start, end = params["baselineDate"], params["currentDate"]
    maturities = params["maturities"]
    assert history["keys"] == [m["code"] for m in maturities]
    curves = {}
    for filename in config["rawFiles"].values():
        for row in ElementTree.parse(CASE / filename).findall(".//{*}properties"):
            date = row.findtext("{*}NEW_DATE")[:10]
            if start <= date <= end:
                assert date not in curves, date
                curves[date] = sum(Decimal(row.findtext("{*}" + m["xmlField"])) for m in maturities)
    dates = sorted(curves)
    assert dates == [row["date"] for row in history["observations"]]
    assert history["unknownCount"] == 0 and history["expectedFollowUps"] == len(dates) - 1

    episodes = []
    by_month = defaultdict(list)
    changes = {}
    for row in history["observations"]:
        date = row["date"]
        delta = (curves[date] - curves[start]) * 100 / abs(curves[start])
        assert abs(delta - Decimal(str(row["changePct"]))) < Decimal("1e-12"), date
        assert abs(curves[date] / len(maturities) - Decimal(str(row["value"]))) < Decimal("1e-12"), date
        outside = abs(delta) > rule["supportTolerance"]
        assert row["status"] == ("breach" if outside else "within"), date
        if date == start:
            continue
        changes[date] = delta
        by_month[date[:7]].append((date, outside))
        if outside:
            if not episodes or episodes[-1][2] is not None:
                episodes.append([date, date, None, 0])
            episodes[-1][1] = date
            episodes[-1][3] += 1
        elif episodes and episodes[-1][2] is None:
            episodes[-1][2] = date
    assert history["breachCount"] == sum(e[3] for e in episodes)
    assert episodes == [[e["firstObservedBreach"], e["lastObservedBreach"], e["firstObservedRecovery"],
                         e["breachedObservations"]] for e in history["episodes"]]
    peak_date = max(changes, key=lambda date: abs(changes[date]))
    assert history["peak"]["date"] == peak_date
    assert abs(changes[peak_date] - Decimal(str(history["peak"]["changePct"]))) < Decimal("1e-12")
    assert [r["month"] for r in receipt["monthlyEndpoints"]] == sorted(by_month)
    for month in receipt["monthlyEndpoints"]:
        days = by_month[month["month"]]
        breaches = [date for date, outside in days if outside]
        assert month["breaches"] == len(breaches)
        assert month["hiddenBreachDates"] == (breaches if not days[0][1] and not days[-1][1] else [])
    print(f"Verified {len(dates)} dated curves, {len(episodes)} excursions and {len(by_month)} monthly screens.")


if __name__ == "__main__":
    verify()
