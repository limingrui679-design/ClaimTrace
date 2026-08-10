// Generated from the executable source under src/cases/ons-housing-affordability/case.ts.
export default {
  "id": "ons-housing-affordability",
  "title": "Public Data: ONS Housing-Affordability Period Audit",
  "primaryKey": "authority_code",
  "claims": [
    {
      "id": "ons-kensington-rank",
      "code": "ONS-001",
      "title": "Kensington and Chelsea remains the highest-ratio authority among the twelve selected authorities",
      "section": "Spatial ranking",
      "owner": "Public-data case reviewer",
      "category": "Authority ranking",
      "formula": "argmax(authority, housing_affordability_ratio) = Kensington and Chelsea",
      "rule": {
        "type": "rank",
        "field": "housing_affordability_ratio",
        "aggregation": "average",
        "groupField": "authority",
        "expectedGroup": "Kensington and Chelsea",
        "rank": "max",
        "tiePolicy": "require_unique"
      }
    },
    {
      "id": "ons-redcar-five-ratio",
      "code": "ONS-002",
      "title": "Redcar and Cleveland's workplace-based affordability ratio remains at or above 5",
      "section": "Methodology-linked threshold audit",
      "owner": "Public-data case reviewer",
      "category": "Threshold gate",
      "formula": "Redcar and Cleveland housing_affordability_ratio >= 5",
      "rule": {
        "type": "threshold",
        "field": "housing_affordability_ratio",
        "aggregation": "average",
        "operator": ">=",
        "threshold": 5,
        "filters": [
          {
            "field": "authority_code",
            "equals": "E06000003"
          }
        ],
        "thresholdSpec": {
          "value": 5,
          "unit": "absolute",
          "source": "ONS housing-affordability QMI mortgage-multiple interpretation",
          "rationale": "ONS discusses a ratio of five in the affordability interpretation; this audit does not turn it into a local policy-performance target",
          "confirmedBy": "ClaimTrace public-data case author",
          "confirmedAt": "2026-08-10T00:00:00.000Z"
        }
      }
    },
    {
      "id": "ons-selected-mean-stability",
      "code": "ONS-003",
      "title": "The unweighted mean ratio across the twelve selected authorities changes by no more than 10%",
      "section": "Selected-authority descriptive stability",
      "owner": "Public-data case reviewer",
      "category": "Period stability",
      "formula": "abs(mean(2025 ratios)-mean(2024 ratios))/mean(2024 ratios) <= 10%",
      "rule": {
        "type": "stability",
        "field": "housing_affordability_ratio",
        "aggregation": "average",
        "supportTolerance": 10,
        "reversalThreshold": 20,
        "supportToleranceSpec": {
          "value": 10,
          "unit": "percent",
          "source": "Illustrative planning-context stability rule v1",
          "rationale": "Used to audit whether a compact selected-authority context statement remains stable",
          "confirmedBy": "ClaimTrace public-data case author",
          "confirmedAt": "2026-08-10T00:00:00.000Z"
        },
        "reversalThresholdSpec": {
          "value": 20,
          "unit": "percent",
          "source": "Illustrative planning-context escalation v1",
          "rationale": "At 20%, treat the compact selected-authority statement as materially invalid",
          "confirmedBy": "ClaimTrace public-data case author",
          "confirmedAt": "2026-08-10T00:00:00.000Z"
        }
      }
    }
  ],
  "decisions": [
    {
      "id": "ons-planning-context-note",
      "title": "Can the 2024 selected-authority planning context note be reused without revision?",
      "owner": "Public-data case reviewer",
      "passActionId": "ons:retain-context-with-method-note",
      "holdActionId": "ons:update-ratio-and-method-note",
      "actionIfPass": "Retain supported descriptive context with period, geography, provisional-earnings, and revision disclosures.",
      "actionIfFail": "Update the threshold or ranking statement and retain the ONS methodology boundary; do not infer a planning intervention effect.",
      "conditions": [
        {
          "claimId": "ons-kensington-rank",
          "allowedStatuses": [
            "SUPPORTED"
          ]
        },
        {
          "claimId": "ons-redcar-five-ratio",
          "allowedStatuses": [
            "SUPPORTED"
          ]
        },
        {
          "claimId": "ons-selected-mean-stability",
          "allowedStatuses": [
            "SUPPORTED",
            "WEAKENED"
          ]
        }
      ],
      "stakeholders": [
        "Planning readers",
        "Local-data analysts",
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
        "source": "Illustrative planning-publication assumptions v1",
        "version": "1.0.0",
        "rationale": "The option scores are demonstration inputs, not housing need, welfare, land value, intervention impact, or implementation cost",
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
        "seed": "ons-planning-context-note-v1",
        "stabilitySweep": {
          "parameter": "benefitMultiplier",
          "min": 0.5,
          "max": 1.5,
          "step": 0.05
        }
      },
      "constraints": [
        {
          "id": "planning-review-capacity",
          "label": "Planning-review capacity",
          "metric": "capacity",
          "operator": "<=",
          "value": 45
        }
      ],
      "options": [
        {
          "id": "reuse",
          "label": "Reuse unchanged",
          "benefit": 31,
          "cost": 6,
          "risk": 31,
          "capacity": 4
        },
        {
          "id": "revise",
          "label": "Revise ratios and method note",
          "benefit": 82,
          "cost": 25,
          "risk": 8,
          "capacity": 25
        },
        {
          "id": "study",
          "label": "Build a full spatial housing study",
          "benefit": 108,
          "cost": 92,
          "risk": 13,
          "capacity": 86
        }
      ]
    }
  ]
} as const;
