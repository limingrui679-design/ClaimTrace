// Generated from the executable source under src/cases/financial-risk/case.ts.
export default {
  "id": "financial-risk",
  "title": "Financial Risk: Portfolio Risk and Admission Thresholds",
  "primaryKey": "account_id",
  "claims": [
    {
      "id": "finance-pd-gate",
      "code": "FR-001",
      "title": "Mean portfolio probability of default does not exceed 4%",
      "section": "Risk admission",
      "owner": "Risk owner",
      "category": "Risk threshold",
      "formula": "mean(pd_percent) <= 4",
      "rule": {
        "type": "threshold",
        "field": "pd_percent",
        "aggregation": "average",
        "operator": "<=",
        "threshold": 4,
        "thresholdSpec": {
          "value": 4,
          "unit": "percent",
          "source": "Synthetic credit policy v1",
          "rationale": "Pause expansion when mean PD exceeds 4%",
          "confirmedBy": "Synthetic case owner",
          "confirmedAt": "2026-08-08T00:00:00.000Z"
        }
      }
    },
    {
      "id": "finance-pd-stability",
      "code": "FR-002",
      "title": "Mean portfolio probability of default changes by no more than 5%",
      "section": "Model monitoring",
      "owner": "Model risk owner",
      "category": "Risk stability",
      "formula": "relative_change(mean(pd_percent)) <= 5%",
      "rule": {
        "type": "stability",
        "field": "pd_percent",
        "aggregation": "average",
        "supportTolerance": 5,
        "reversalThreshold": 15,
        "supportToleranceSpec": {
          "value": 5,
          "unit": "percent",
          "source": "Synthetic model monitoring policy v1",
          "rationale": "Treat changes within 5% as stable for monitoring",
          "confirmedBy": "Synthetic case owner",
          "confirmedAt": "2026-08-08T00:00:00.000Z"
        },
        "reversalThresholdSpec": {
          "value": 15,
          "unit": "percent",
          "source": "Synthetic risk escalation policy v1",
          "rationale": "A 15% change invalidates the original portfolio assumption",
          "confirmedBy": "Synthetic case owner",
          "confirmedAt": "2026-08-08T00:00:00.000Z"
        }
      }
    },
    {
      "id": "finance-label-gate",
      "code": "FR-003",
      "title": "The observed default-label share does not exceed 25%",
      "section": "Post-hoc validation",
      "owner": "Validation owner",
      "category": "Outcome threshold",
      "formula": "mean(observed_label) <= 0.25",
      "rule": {
        "type": "threshold",
        "field": "observed_label",
        "aggregation": "average",
        "operator": "<=",
        "threshold": 0.25,
        "thresholdSpec": {
          "value": 0.25,
          "unit": "score",
          "source": "Synthetic validation policy v1",
          "rationale": "Stop the original admission policy when the observed default rate exceeds 25%",
          "confirmedBy": "Synthetic case owner",
          "confirmedAt": "2026-08-08T00:00:00.000Z"
        }
      }
    }
  ],
  "decisions": [
    {
      "id": "finance-underwriting",
      "title": "Should admission expand under the original policy?",
      "owner": "Credit committee",
      "passActionId": "finance:continue-admission",
      "holdActionId": "finance:pause-and-reestimate",
      "actionIfPass": "Continue admission within the risk budget.",
      "actionIfFail": "Pause expansion and re-estimate portfolio thresholds.",
      "conditions": [
        {
          "claimId": "finance-pd-gate",
          "allowedStatuses": [
            "SUPPORTED"
          ]
        },
        {
          "claimId": "finance-label-gate",
          "allowedStatuses": [
            "SUPPORTED"
          ]
        }
      ],
      "priorSignedResult": {
        "versionId": "finance-v1",
        "outcome": "PASS",
        "activeActionId": "finance:continue-admission",
        "actionIdentityHash": "3e121225e04e86f2292834798f7e9f99d2fc167487399f2450b3fff37dc83580",
        "recommendedOptionId": "expand",
        "feasibleOptionIds": [
          "expand",
          "pause",
          "tighten"
        ],
        "decisionPolicyHash": "8295be83e54ff986cde0d8c4cab3691f83329d666d187102104338ead14cd9a6",
        "decisionInputProvenanceHash": "72f7712e499ca899b89744b1902bdad39d02ccbd3c1ff62b5e516bbfc6827e5d",
        "baselineSha256": "21d949bfcb2e4358ac58593ce40978ab847fcc99e93056bcabb42f55142668b7",
        "currentSha256": "fd5a34dfe1c29432d048ab47f883b637ef2bccc142059b75f0c0b96463bf4851",
        "ruleVersion": "claimtrace-rule/4.0.0",
        "claimResultIds": [
          "prior-result:finance-v1:finance-pd-gate",
          "prior-result:finance-v1:finance-label-gate"
        ],
        "historyBasis": "RECORDED_IDENTITY",
        "reviewRecordId": "synthetic-prior-review:finance-underwriting:finance-v1",
        "reviewRecordHash": "49d3061cc23374b86c5532a837705ef0d326e5b9da50531f2b3330e98395df06",
        "signedAt": "2026-08-01T08:00:00.000Z",
        "signedBy": "Synthetic credit committee"
      },
      "stakeholders": [
        "Credit committee",
        "Customers",
        "Capital management"
      ],
      "objective": {
        "benefitWeight": 1,
        "costWeight": 0.15,
        "riskWeight": 1.5
      },
      "riskTolerance": 20,
      "noActionLoss": 28,
      "inputProvenance": {
        "kind": "MANUAL_ASSUMPTION",
        "source": "Synthetic credit committee assumptions",
        "version": "1.0.0",
        "rationale": "Used to demonstrate risk constraints and option scoring; this is not a portfolio backtest, capital model, or real underwriting outcome",
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
        "seed": "finance-underwriting-v1",
        "stabilitySweep": {
          "parameter": "benefitMultiplier",
          "min": 0.5,
          "max": 1.5,
          "step": 0.05
        }
      },
      "constraints": [
        {
          "id": "capital",
          "label": "Capital usage",
          "metric": "cost",
          "operator": "<=",
          "value": 70
        },
        {
          "id": "ops",
          "label": "Manual-review capacity",
          "metric": "capacity",
          "operator": "<=",
          "value": 50
        }
      ],
      "options": [
        {
          "id": "pause",
          "label": "Pause new admissions",
          "benefit": 25,
          "cost": 12,
          "risk": 5,
          "capacity": 8
        },
        {
          "id": "tighten",
          "label": "Tighten and manually review",
          "benefit": 62,
          "cost": 44,
          "risk": 14,
          "capacity": 48
        },
        {
          "id": "expand",
          "label": "Expand under the original policy",
          "benefit": 98,
          "cost": 65,
          "risk": 34,
          "capacity": 38
        }
      ]
    }
  ]
} as const;
