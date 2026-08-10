// Generated from the executable source under src/cases/us-treasury-yield-curve/case.ts.
export default {
  "id": "us-treasury-yield-curve",
  "title": "Public Data: U.S. Treasury Yield-Curve Period Audit",
  "primaryKey": "maturity_code",
  "claims": [
    {
      "id": "treasury-20y-highest",
      "code": "UST-001",
      "title": "The 20-year maturity remains the highest-yielding selected point on the year-end curve",
      "section": "Curve-shape ranking",
      "owner": "Public-data case reviewer",
      "category": "Maturity ranking",
      "formula": "argmax(maturity, yield_percent) = 20 years",
      "rule": {
        "type": "rank",
        "field": "yield_percent",
        "aggregation": "average",
        "groupField": "maturity",
        "expectedGroup": "20 years",
        "rank": "max",
        "tiePolicy": "require_unique"
      }
    },
    {
      "id": "treasury-1m-four-percent",
      "code": "UST-002",
      "title": "The one-month year-end par yield remains at or above 4%",
      "section": "Short-end threshold",
      "owner": "Public-data case reviewer",
      "category": "Threshold gate",
      "formula": "1M yield_percent >= 4",
      "rule": {
        "type": "threshold",
        "field": "yield_percent",
        "aggregation": "average",
        "operator": ">=",
        "threshold": 4,
        "filters": [
          {
            "field": "maturity_code",
            "equals": "1M"
          }
        ],
        "thresholdSpec": {
          "value": 4,
          "unit": "percent",
          "source": "Illustrative fixed-income review threshold v1",
          "rationale": "An analyst-authored monitoring threshold, not Treasury guidance or an investment rule",
          "confirmedBy": "ClaimTrace public-data case author",
          "confirmedAt": "2026-08-10T00:00:00.000Z"
        }
      }
    },
    {
      "id": "treasury-selected-mean-stability",
      "code": "UST-003",
      "title": "The mean yield across the nine selected maturities changes by no more than 10%",
      "section": "Curve-level descriptive comparison",
      "owner": "Public-data case reviewer",
      "category": "Period stability",
      "formula": "abs(mean(2025)-mean(2024))/mean(2024) <= 10%",
      "rule": {
        "type": "stability",
        "field": "yield_percent",
        "aggregation": "average",
        "supportTolerance": 10,
        "reversalThreshold": 20,
        "supportToleranceSpec": {
          "value": 10,
          "unit": "percent",
          "source": "Illustrative curve-monitoring rule v1",
          "rationale": "Used only to audit whether a compact descriptive curve summary remains stable",
          "confirmedBy": "ClaimTrace public-data case author",
          "confirmedAt": "2026-08-10T00:00:00.000Z"
        },
        "reversalThresholdSpec": {
          "value": 20,
          "unit": "percent",
          "source": "Illustrative curve-monitoring escalation v1",
          "rationale": "At 20%, treat the compact curve summary as materially invalid",
          "confirmedBy": "ClaimTrace public-data case author",
          "confirmedAt": "2026-08-10T00:00:00.000Z"
        }
      }
    }
  ],
  "decisions": [
    {
      "id": "treasury-fixed-income-brief",
      "title": "Can the 2024 year-end fixed-income brief be reused for the 2025 snapshot?",
      "owner": "Public-data case reviewer",
      "passActionId": "treasury:retain-brief-with-date",
      "holdActionId": "treasury:update-curve-brief",
      "actionIfPass": "Retain only supported descriptive statements and disclose observation dates, maturities, and source.",
      "actionIfFail": "Update the curve-shape and short-end statements; do not convert two snapshots into a return forecast or trading recommendation.",
      "conditions": [
        {
          "claimId": "treasury-20y-highest",
          "allowedStatuses": [
            "SUPPORTED"
          ]
        },
        {
          "claimId": "treasury-1m-four-percent",
          "allowedStatuses": [
            "SUPPORTED"
          ]
        },
        {
          "claimId": "treasury-selected-mean-stability",
          "allowedStatuses": [
            "SUPPORTED",
            "WEAKENED"
          ]
        }
      ],
      "stakeholders": [
        "Fixed-income readers",
        "Risk reviewers",
        "Public-data provider"
      ],
      "objective": {
        "benefitWeight": 1,
        "costWeight": 0.2,
        "riskWeight": 1.2
      },
      "riskTolerance": 18,
      "noActionLoss": 28,
      "inputProvenance": {
        "kind": "MANUAL_ASSUMPTION",
        "source": "Illustrative fixed-income publication assumptions v1",
        "version": "1.0.0",
        "rationale": "The option values are demonstration inputs, not portfolio returns, market risk estimates, transaction costs, or investment advice",
        "units": {
          "benefit": "illustrative utility points",
          "cost": "illustrative cost points",
          "risk": "illustrative risk points",
          "capacity": "illustrative capacity points"
        },
        "confirmedBy": "ClaimTrace public-data case author",
        "confirmedAt": "2026-08-10T00:00:00.000Z"
      },
      "uncertainty": {
        "method": "BOUNDED_UNIFORM",
        "benefitMultiplier": [
          0.8,
          1.2
        ],
        "costMultiplier": [
          0.85,
          1.2
        ],
        "riskMultiplier": [
          0.8,
          1.25
        ],
        "capacityMultiplier": [
          0.9,
          1.15
        ],
        "trials": 512,
        "seed": "treasury-fixed-income-brief-v1",
        "stabilitySweep": {
          "parameter": "benefitMultiplier",
          "min": 0.5,
          "max": 1.5,
          "step": 0.05
        }
      },
      "constraints": [
        {
          "id": "review-capacity",
          "label": "Review capacity",
          "metric": "capacity",
          "operator": "<=",
          "value": 45
        }
      ],
      "options": [
        {
          "id": "reuse",
          "label": "Reuse unchanged",
          "benefit": 34,
          "cost": 6,
          "risk": 31,
          "capacity": 4
        },
        {
          "id": "revise",
          "label": "Revise curve statements",
          "benefit": 84,
          "cost": 26,
          "risk": 7,
          "capacity": 26
        },
        {
          "id": "model",
          "label": "Add a full term-structure model",
          "benefit": 102,
          "cost": 82,
          "risk": 14,
          "capacity": 76
        }
      ]
    }
  ]
} as const;
