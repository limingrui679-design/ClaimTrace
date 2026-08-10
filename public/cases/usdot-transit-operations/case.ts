// Generated from the executable source under src/cases/usdot-transit-operations/case.ts.
export default {
  "id": "usdot-transit-operations",
  "title": "Public Data: USDOT Transit Operations Period Audit",
  "primaryKey": "ntd_id",
  "claims": [
    {
      "id": "ntd-nyct-productivity-rank",
      "code": "NTD-001",
      "title": "MTA New York City Transit remains the highest in riders per vehicle-revenue hour among the eight selected services",
      "section": "Descriptive operating intensity",
      "owner": "Public-data case reviewer",
      "category": "Group ranking",
      "formula": "argmax(agency, riders_per_revenue_hour) = MTA New York City Transit",
      "rule": {
        "type": "rank",
        "field": "riders_per_revenue_hour",
        "aggregation": "average",
        "groupField": "agency",
        "expectedGroup": "MTA New York City Transit",
        "rank": "max",
        "tiePolicy": "require_unique"
      }
    },
    {
      "id": "ntd-wmata-productivity-gate",
      "code": "NTD-002",
      "title": "WMATA reaches at least 45 riders per vehicle-revenue hour in the selected month",
      "section": "Illustrative operating threshold",
      "owner": "Public-data case reviewer",
      "category": "Threshold gate",
      "formula": "WMATA riders_per_revenue_hour >= 45",
      "rule": {
        "type": "threshold",
        "field": "riders_per_revenue_hour",
        "aggregation": "average",
        "operator": ">=",
        "threshold": 45,
        "filters": [
          {
            "field": "ntd_id",
            "equals": "30030"
          }
        ],
        "thresholdSpec": {
          "value": 45,
          "unit": "absolute",
          "source": "Illustrative operations review threshold v1",
          "rationale": "An analyst-authored demonstration threshold; it is not an FTA service standard or causal efficiency target",
          "confirmedBy": "ClaimTrace public-data case author",
          "confirmedAt": "2026-08-10T00:00:00.000Z"
        }
      }
    },
    {
      "id": "ntd-selected-ridership-stability",
      "code": "NTD-003",
      "title": "Total ridership across the eight selected services changes by no more than 5%",
      "section": "Selected-system volume comparison",
      "owner": "Public-data case reviewer",
      "category": "Period stability",
      "formula": "abs(sum(2025 May ridership)-sum(2024 May ridership))/sum(2024 May ridership) <= 5%",
      "rule": {
        "type": "stability",
        "field": "ridership",
        "aggregation": "sum",
        "supportTolerance": 5,
        "reversalThreshold": 15,
        "supportToleranceSpec": {
          "value": 5,
          "unit": "percent",
          "source": "Illustrative monthly-monitoring rule v1",
          "rationale": "Used to test whether a selected-system volume statement remains descriptively stable",
          "confirmedBy": "ClaimTrace public-data case author",
          "confirmedAt": "2026-08-10T00:00:00.000Z"
        },
        "reversalThresholdSpec": {
          "value": 15,
          "unit": "percent",
          "source": "Illustrative monthly-monitoring escalation v1",
          "rationale": "At 15%, treat the original selected-system volume statement as materially invalid",
          "confirmedBy": "ClaimTrace public-data case author",
          "confirmedAt": "2026-08-10T00:00:00.000Z"
        }
      }
    }
  ],
  "decisions": [
    {
      "id": "ntd-operations-brief",
      "title": "Can the May 2024 operating brief be reused without a 2025 update note?",
      "owner": "Public-data case reviewer",
      "passActionId": "ntd:retain-ranking-with-period-note",
      "holdActionId": "ntd:update-brief-and-threshold-note",
      "actionIfPass": "Retain only the supported descriptive ranking and disclose the agency selection, month, retrieval date, and revisions boundary.",
      "actionIfFail": "Update the operating brief and explain which descriptive threshold or volume statement changed; do not infer service quality or causality.",
      "conditions": [
        {
          "claimId": "ntd-nyct-productivity-rank",
          "allowedStatuses": [
            "SUPPORTED"
          ]
        },
        {
          "claimId": "ntd-wmata-productivity-gate",
          "allowedStatuses": [
            "SUPPORTED"
          ]
        },
        {
          "claimId": "ntd-selected-ridership-stability",
          "allowedStatuses": [
            "SUPPORTED",
            "WEAKENED"
          ]
        }
      ],
      "stakeholders": [
        "Transit-data readers",
        "Operations analysts",
        "Public-data provider"
      ],
      "objective": {
        "benefitWeight": 1,
        "costWeight": 0.2,
        "riskWeight": 1
      },
      "riskTolerance": 20,
      "noActionLoss": 25,
      "inputProvenance": {
        "kind": "MANUAL_ASSUMPTION",
        "source": "Illustrative transit-publication assumptions v1",
        "version": "1.0.0",
        "rationale": "The option scores are demonstration inputs, not observed agency costs, benefits, capacity, or service effects",
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
        "seed": "ntd-operations-brief-v1",
        "stabilitySweep": {
          "parameter": "benefitMultiplier",
          "min": 0.5,
          "max": 1.5,
          "step": 0.05
        }
      },
      "constraints": [
        {
          "id": "editorial-capacity",
          "label": "Editorial capacity",
          "metric": "capacity",
          "operator": "<=",
          "value": 45
        }
      ],
      "options": [
        {
          "id": "reuse",
          "label": "Reuse unchanged",
          "benefit": 36,
          "cost": 7,
          "risk": 29,
          "capacity": 4
        },
        {
          "id": "annotate",
          "label": "Update figures and boundaries",
          "benefit": 80,
          "cost": 24,
          "risk": 8,
          "capacity": 24
        },
        {
          "id": "expand",
          "label": "Build a full service study",
          "benefit": 95,
          "cost": 76,
          "risk": 12,
          "capacity": 72
        }
      ]
    }
  ]
} as const;
