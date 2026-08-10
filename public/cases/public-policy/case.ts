// Generated from the executable source under src/cases/public-policy/case.ts.
export default {
  "id": "public-policy",
  "title": "Public Policy: Program Coverage and Outcome Thresholds",
  "primaryKey": "district_id",
  "claims": [
    {
      "id": "policy-coverage-stability",
      "code": "PP-001",
      "title": "Average district coverage remains stable after the version revision",
      "section": "Program coverage",
      "owner": "Program owner",
      "category": "Coverage stability",
      "formula": "relative_change(mean(coverage_percent)) <= 3%",
      "rule": {
        "type": "stability",
        "field": "coverage_percent",
        "aggregation": "average",
        "supportTolerance": 3,
        "reversalThreshold": 8,
        "supportToleranceSpec": {
          "value": 3,
          "unit": "percent",
          "source": "Synthetic program protocol v1",
          "rationale": "Do not change the coverage judgment within a 3% shift",
          "confirmedBy": "Synthetic case owner",
          "confirmedAt": "2026-08-08T00:00:00.000Z"
        },
        "reversalThresholdSpec": {
          "value": 8,
          "unit": "percent",
          "source": "Synthetic policy escalation rule v1",
          "rationale": "An 8% change reverses the coverage judgment",
          "confirmedBy": "Synthetic case owner",
          "confirmedAt": "2026-08-08T00:00:00.000Z"
        }
      }
    },
    {
      "id": "policy-outcome-gate",
      "code": "PP-002",
      "title": "The average outcome score reaches 72",
      "section": "Outcome evaluation",
      "owner": "Evaluation owner",
      "category": "Outcome threshold",
      "formula": "mean(outcome_score) >= 72",
      "rule": {
        "type": "threshold",
        "field": "outcome_score",
        "aggregation": "average",
        "operator": ">=",
        "threshold": 72,
        "thresholdSpec": {
          "value": 72,
          "unit": "score",
          "source": "Synthetic evaluation plan v1",
          "rationale": "A score of 72 is the minimum outcome threshold before scale-up",
          "confirmedBy": "Synthetic case owner",
          "confirmedAt": "2026-08-08T00:00:00.000Z"
        }
      }
    },
    {
      "id": "policy-population-stability",
      "code": "PP-003",
      "title": "Average eligible-population size changes by no more than 5%",
      "section": "Target population",
      "owner": "Policy analyst",
      "category": "Population stability",
      "formula": "relative_change(mean(eligible_population)) <= 5%",
      "rule": {
        "type": "stability",
        "field": "eligible_population",
        "aggregation": "average",
        "supportTolerance": 5,
        "reversalThreshold": 15,
        "supportToleranceSpec": {
          "value": 5,
          "unit": "percent",
          "source": "Synthetic targeting plan v1",
          "rationale": "Retain target-population assumptions within a 5% change",
          "confirmedBy": "Synthetic case owner",
          "confirmedAt": "2026-08-08T00:00:00.000Z"
        },
        "reversalThresholdSpec": {
          "value": 15,
          "unit": "percent",
          "source": "Synthetic targeting risk rule v1",
          "rationale": "A 15% change invalidates the original target-population assumption",
          "confirmedBy": "Synthetic case owner",
          "confirmedAt": "2026-08-08T00:00:00.000Z"
        }
      }
    }
  ],
  "decisions": [
    {
      "id": "policy-scale",
      "title": "Should program coverage expand under the original plan?",
      "owner": "Program board",
      "passActionId": "policy:continue-phased-scale",
      "holdActionId": "policy:pause-and-redesign",
      "actionIfPass": "Retain the phased scale-up plan.",
      "actionIfFail": "Pause scale-up and redefine the cohort and cost-benefit assumptions.",
      "conditions": [
        {
          "claimId": "policy-coverage-stability",
          "allowedStatuses": [
            "SUPPORTED",
            "WEAKENED"
          ]
        },
        {
          "claimId": "policy-outcome-gate",
          "allowedStatuses": [
            "SUPPORTED"
          ]
        }
      ],
      "priorSignedResult": {
        "versionId": "policy-v1",
        "outcome": "PASS",
        "activeActionId": "policy:continue-phased-scale",
        "actionIdentityHash": "a3d4ffb98e3796d4e326679795d4167414038ce66b9912d656234bb1cfe1f92f",
        "recommendedOptionId": "phased",
        "feasibleOptionIds": [
          "no-scale",
          "phased"
        ],
        "decisionPolicyHash": "15e03126b63bb70603962ffc15ff8a5ef07b731ed942b0fdbb1d1416dda30231",
        "decisionInputProvenanceHash": "96295c4756633ce5f3b5778d86e7fe253c430cadb3b4b0a95aca16bed6cbc314",
        "baselineSha256": "d93ec1ea3f141dc2fd4667ec0ac5e1f2732eb654dd7b21f7edce422dd4b6e904",
        "currentSha256": "211898eab493a2cac24c87e5455fbbda46f4c6cab54c301b49b968296ec356f3",
        "ruleVersion": "claimtrace-rule/4.0.0",
        "claimResultIds": [
          "prior-result:policy-v1:policy-coverage-stability",
          "prior-result:policy-v1:policy-outcome-gate"
        ],
        "historyBasis": "RECORDED_IDENTITY",
        "reviewRecordId": "synthetic-prior-review:policy-scale:policy-v1",
        "reviewRecordHash": "6f07efb15e3a5a3b8888db26cef0b6116e8fe15d543445f81b9636f6a6bf13f6",
        "signedAt": "2026-08-01T08:00:00.000Z",
        "signedBy": "Synthetic program board"
      },
      "stakeholders": [
        "Target population",
        "District implementers",
        "Finance department"
      ],
      "objective": {
        "benefitWeight": 1,
        "costWeight": 0.25,
        "riskWeight": 1
      },
      "riskTolerance": 22,
      "noActionLoss": 40,
      "inputProvenance": {
        "kind": "MANUAL_ASSUMPTION",
        "source": "Synthetic program board assumptions",
        "version": "1.0.0",
        "rationale": "Used to demonstrate cost, risk, and capacity constraints; these are not causal effects, real fiscal costs, or policy-benefit estimates",
        "units": {
          "benefit": "synthetic utility points",
          "cost": "synthetic cost points",
          "risk": "synthetic risk points",
          "capacity": "synthetic capacity points"
        },
        "confirmedBy": "Synthetic case owner",
        "confirmedAt": "2026-08-08T00:00:00.000Z"
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
        "seed": "policy-scale-v1",
        "stabilitySweep": {
          "parameter": "benefitMultiplier",
          "min": 0.5,
          "max": 1.5,
          "step": 0.05
        }
      },
      "constraints": [
        {
          "id": "budget",
          "label": "Fiscal budget",
          "metric": "cost",
          "operator": "<=",
          "value": 65
        },
        {
          "id": "delivery",
          "label": "Delivery capacity",
          "metric": "capacity",
          "operator": "<=",
          "value": 55
        }
      ],
      "options": [
        {
          "id": "no-scale",
          "label": "Do not scale yet",
          "benefit": 24,
          "cost": 8,
          "risk": 6,
          "capacity": 5
        },
        {
          "id": "phased",
          "label": "Phased scale-up",
          "benefit": 78,
          "cost": 52,
          "risk": 18,
          "capacity": 48
        },
        {
          "id": "full-scale",
          "label": "Immediate full scale-up",
          "benefit": 112,
          "cost": 88,
          "risk": 32,
          "capacity": 80
        }
      ]
    }
  ]
} as const;
