// Generated from the executable source under src/cases/world-bank-life-expectancy/case.ts.
export default {
  "id": "world-bank-life-expectancy",
  "title": "Public Data: World Bank Life-Expectancy Cross-Year Audit",
  "primaryKey": "country_code",
  "claims": [
    {
      "id": "wdi-japan-rank",
      "code": "WB-001",
      "title": "Japan still has the highest life expectancy at birth among the eight selected countries",
      "section": "Cross-country descriptive comparison",
      "owner": "Public-data case reviewer",
      "category": "Group ranking",
      "formula": "argmax(country, life_expectancy_years) = Japan",
      "rule": {
        "type": "rank",
        "field": "life_expectancy_years",
        "aggregation": "average",
        "groupField": "country",
        "expectedGroup": "Japan",
        "rank": "max",
        "tiePolicy": "require_unique"
      }
    },
    {
      "id": "wdi-germany-threshold",
      "code": "WB-002",
      "title": "Germany's life expectancy at birth remains at or above 81 years",
      "section": "Illustrative threshold audit",
      "owner": "Public-data case reviewer",
      "category": "Threshold gate",
      "formula": "Germany life_expectancy_years >= 81",
      "rule": {
        "type": "threshold",
        "field": "life_expectancy_years",
        "aggregation": "average",
        "operator": ">=",
        "threshold": 81,
        "filters": [
          {
            "field": "country_code",
            "equals": "DEU"
          }
        ],
        "thresholdSpec": {
          "value": 81,
          "unit": "absolute",
          "source": "Illustrative analyst review threshold v1",
          "rationale": "Used only to demonstrate how an updated public indicator can invalidate an existing threshold claim; this is not World Bank guidance or a policy standard",
          "confirmedBy": "ClaimTrace public-data case author",
          "confirmedAt": "2026-08-10T00:00:00.000Z"
        }
      }
    },
    {
      "id": "wdi-eight-country-stability",
      "code": "WB-003",
      "title": "Mean life expectancy at birth across the eight selected countries changes by no more than 1%",
      "section": "Sample-mean stability",
      "owner": "Public-data case reviewer",
      "category": "Period stability",
      "formula": "abs(mean(2024)-mean(2019))/mean(2019) <= 1%",
      "rule": {
        "type": "stability",
        "field": "life_expectancy_years",
        "aggregation": "average",
        "supportTolerance": 1,
        "reversalThreshold": 3,
        "supportToleranceSpec": {
          "value": 1,
          "unit": "percent",
          "source": "Illustrative descriptive stability rule v1",
          "rationale": "Used to demonstrate a stability audit of a descriptive mean across periods; this does not imply statistical significance",
          "confirmedBy": "ClaimTrace public-data case author",
          "confirmedAt": "2026-08-10T00:00:00.000Z"
        },
        "reversalThresholdSpec": {
          "value": 3,
          "unit": "percent",
          "source": "Illustrative descriptive reversal rule v1",
          "rationale": "At 3%, treat the original stability statement as materially invalid",
          "confirmedBy": "ClaimTrace public-data case author",
          "confirmedAt": "2026-08-10T00:00:00.000Z"
        }
      }
    }
  ],
  "decisions": [
    {
      "id": "wdi-publication-note",
      "title": "Can the 2019 summary be reused without a revision note?",
      "owner": "Public-data case reviewer",
      "passActionId": "wdi:retain-summary-with-source-date",
      "holdActionId": "wdi:update-summary-and-note-threshold-change",
      "actionIfPass": "Retain the summary, but disclose the indicator, observation year, access date, and license.",
      "actionIfFail": "Update the summary and state that Germany crossed the illustrative threshold; do not interpret a descriptive change as a causal effect.",
      "conditions": [
        {
          "claimId": "wdi-japan-rank",
          "allowedStatuses": [
            "SUPPORTED"
          ]
        },
        {
          "claimId": "wdi-germany-threshold",
          "allowedStatuses": [
            "SUPPORTED"
          ]
        },
        {
          "claimId": "wdi-eight-country-stability",
          "allowedStatuses": [
            "SUPPORTED",
            "WEAKENED"
          ]
        }
      ],
      "stakeholders": [
        "Data readers",
        "Report authors",
        "Public-data provider"
      ],
      "objective": {
        "benefitWeight": 1,
        "costWeight": 0.2,
        "riskWeight": 1.1
      },
      "riskTolerance": 20,
      "noActionLoss": 24,
      "inputProvenance": {
        "kind": "MANUAL_ASSUMPTION",
        "source": "Illustrative publication-governance assumptions v1",
        "version": "1.0.0",
        "rationale": "Option benefits, costs, risks, and capacities are manually supplied ClaimTrace demonstration inputs; they are not World Bank data or observed communication effects",
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
        "seed": "world-bank-publication-note-v1",
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
          "label": "Reuse the old summary unchanged",
          "benefit": 42,
          "cost": 8,
          "risk": 28,
          "capacity": 5
        },
        {
          "id": "annotate",
          "label": "Update with source and threshold notes",
          "benefit": 78,
          "cost": 24,
          "risk": 8,
          "capacity": 24
        },
        {
          "id": "full-study",
          "label": "Expand into a full cross-country study",
          "benefit": 96,
          "cost": 72,
          "risk": 12,
          "capacity": 68
        }
      ]
    }
  ]
} as const;
