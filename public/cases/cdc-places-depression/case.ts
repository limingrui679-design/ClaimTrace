// Generated from the executable source under src/cases/cdc-places-depression/case.ts.
export default {
  "id": "cdc-places-depression",
  "title": "Public Data: CDC PLACES Model-Based Estimate Audit",
  "primaryKey": "county_fips",
  "claims": [
    {
      "id": "places-middlesex-rank",
      "code": "CDC-001",
      "title": "Middlesex County remains the highest point estimate among the eight selected counties",
      "section": "Model-based estimate ranking",
      "owner": "Public-data case reviewer",
      "category": "County ranking",
      "formula": "argmax(county, age_adjusted_depression_percent) = Middlesex",
      "rule": {
        "type": "rank",
        "field": "age_adjusted_depression_percent",
        "aggregation": "average",
        "groupField": "county",
        "expectedGroup": "Middlesex",
        "rank": "max",
        "tiePolicy": "require_unique"
      }
    },
    {
      "id": "places-maricopa-threshold",
      "code": "CDC-002",
      "title": "Maricopa County's age-adjusted model-based estimate remains at or above 20%",
      "section": "Illustrative estimate threshold",
      "owner": "Public-data case reviewer",
      "category": "Threshold gate",
      "formula": "Maricopa age_adjusted_depression_percent >= 20",
      "rule": {
        "type": "threshold",
        "field": "age_adjusted_depression_percent",
        "aggregation": "average",
        "operator": ">=",
        "threshold": 20,
        "filters": [
          {
            "field": "county_fips",
            "equals": "04013"
          }
        ],
        "thresholdSpec": {
          "value": 20,
          "unit": "percent",
          "source": "Illustrative surveillance review threshold v1",
          "rationale": "An analyst-authored threshold for claim auditing; it is not CDC guidance, a diagnosis threshold, or an intervention rule",
          "confirmedBy": "ClaimTrace public-data case author",
          "confirmedAt": "2026-08-10T00:00:00.000Z"
        }
      }
    },
    {
      "id": "places-selected-mean-stability",
      "code": "CDC-003",
      "title": "The unweighted mean point estimate across the eight selected counties changes by no more than 2%",
      "section": "Selected-county descriptive stability",
      "owner": "Public-data case reviewer",
      "category": "Period stability",
      "formula": "abs(mean(2023 estimates)-mean(2022 estimates))/mean(2022 estimates) <= 2%",
      "rule": {
        "type": "stability",
        "field": "age_adjusted_depression_percent",
        "aggregation": "average",
        "supportTolerance": 2,
        "reversalThreshold": 5,
        "supportToleranceSpec": {
          "value": 2,
          "unit": "percent",
          "source": "Illustrative surveillance-summary rule v1",
          "rationale": "Used to audit a compact descriptive statement; confidence intervals remain visible and must be interpreted separately",
          "confirmedBy": "ClaimTrace public-data case author",
          "confirmedAt": "2026-08-10T00:00:00.000Z"
        },
        "reversalThresholdSpec": {
          "value": 5,
          "unit": "percent",
          "source": "Illustrative surveillance-summary escalation v1",
          "rationale": "At 5%, treat the compact selected-county mean statement as materially invalid",
          "confirmedBy": "ClaimTrace public-data case author",
          "confirmedAt": "2026-08-10T00:00:00.000Z"
        }
      }
    }
  ],
  "decisions": [
    {
      "id": "places-surveillance-note",
      "title": "Can the earlier selected-county surveillance note be reused without revision?",
      "owner": "Public-data case reviewer",
      "passActionId": "places:retain-note-with-model-warning",
      "holdActionId": "places:update-estimates-and-uncertainty",
      "actionIfPass": "Retain only supported descriptive statements and show model-based-estimate, confidence-interval, year, and selection limitations.",
      "actionIfFail": "Update changed point-estimate statements and preserve confidence intervals; do not infer local program effects or individual risk.",
      "conditions": [
        {
          "claimId": "places-middlesex-rank",
          "allowedStatuses": [
            "SUPPORTED"
          ]
        },
        {
          "claimId": "places-maricopa-threshold",
          "allowedStatuses": [
            "SUPPORTED"
          ]
        },
        {
          "claimId": "places-selected-mean-stability",
          "allowedStatuses": [
            "SUPPORTED",
            "WEAKENED"
          ]
        }
      ],
      "stakeholders": [
        "Population-health readers",
        "Methods reviewers",
        "Public-data provider"
      ],
      "objective": {
        "benefitWeight": 1,
        "costWeight": 0.2,
        "riskWeight": 1.3
      },
      "riskTolerance": 16,
      "noActionLoss": 32,
      "inputProvenance": {
        "kind": "MANUAL_ASSUMPTION",
        "source": "Illustrative health-publication assumptions v1",
        "version": "1.0.0",
        "rationale": "The option scores are demonstration inputs, not clinical utility, disease burden, intervention effects, or real operating costs",
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
        "seed": "places-surveillance-note-v1",
        "stabilitySweep": {
          "parameter": "benefitMultiplier",
          "min": 0.5,
          "max": 1.5,
          "step": 0.05
        }
      },
      "constraints": [
        {
          "id": "methods-capacity",
          "label": "Methods-review capacity",
          "metric": "capacity",
          "operator": "<=",
          "value": 45
        }
      ],
      "options": [
        {
          "id": "reuse",
          "label": "Reuse unchanged",
          "benefit": 30,
          "cost": 6,
          "risk": 34,
          "capacity": 4
        },
        {
          "id": "revise",
          "label": "Revise estimates and uncertainty notes",
          "benefit": 85,
          "cost": 27,
          "risk": 7,
          "capacity": 27
        },
        {
          "id": "survey",
          "label": "Commission direct local measurement",
          "benefit": 110,
          "cost": 96,
          "risk": 10,
          "capacity": 90
        }
      ]
    }
  ]
} as const;
