// Generated from the executable source under src/cases/cfpb-credit-card-complaints/case.ts.
export default {
  "id": "cfpb-credit-card-complaints",
  "title": "Public Data: CFPB Credit-Card Complaint Pattern Audit",
  "primaryKey": "issue_id",
  "claims": [
    {
      "id": "cfpb-purchase-issue-rank",
      "code": "CFPB-001",
      "title": "Purchase-on-statement problems remain the most frequent structured issue among the ten displayed credit-card issue buckets",
      "section": "Issue-pattern ranking",
      "owner": "Public-data case reviewer",
      "category": "Issue ranking",
      "formula": "argmax(issue, complaint_records) = Problem with a purchase shown on your statement",
      "rule": {
        "type": "rank",
        "field": "complaint_records",
        "aggregation": "average",
        "groupField": "issue",
        "expectedGroup": "Problem with a purchase shown on your statement",
        "rank": "max",
        "tiePolicy": "require_unique"
      }
    },
    {
      "id": "cfpb-report-issue-share",
      "code": "CFPB-002",
      "title": "Incorrect-information-on-report records reach at least 13% of matched credit-card complaint records",
      "section": "Issue-share threshold",
      "owner": "Public-data case reviewer",
      "category": "Threshold gate",
      "formula": "incorrect-information-on-your-report share_percent >= 13",
      "rule": {
        "type": "threshold",
        "field": "share_percent",
        "aggregation": "average",
        "operator": ">=",
        "threshold": 13,
        "filters": [
          {
            "field": "issue_id",
            "equals": "incorrect-information-on-your-report"
          }
        ],
        "thresholdSpec": {
          "value": 13,
          "unit": "percent",
          "source": "Illustrative complaint-monitoring threshold v1",
          "rationale": "An analyst-authored attention threshold, not a CFPB risk standard or finding",
          "confirmedBy": "ClaimTrace public-data case author",
          "confirmedAt": "2026-08-10T00:00:00.000Z"
        }
      }
    },
    {
      "id": "cfpb-volume-stability",
      "code": "CFPB-003",
      "title": "Matched credit-card complaint-record volume changes by no more than 10% between the two first-half periods",
      "section": "Record-volume comparison",
      "owner": "Public-data case reviewer",
      "category": "Period stability",
      "formula": "abs(total_records_2025H1-total_records_2024H1)/total_records_2024H1 <= 10%",
      "rule": {
        "type": "stability",
        "field": "period_total_records",
        "aggregation": "average",
        "supportTolerance": 10,
        "reversalThreshold": 30,
        "supportToleranceSpec": {
          "value": 10,
          "unit": "percent",
          "source": "Illustrative complaint-volume monitoring rule v1",
          "rationale": "Used to determine whether a prior descriptive volume statement needs revision",
          "confirmedBy": "ClaimTrace public-data case author",
          "confirmedAt": "2026-08-10T00:00:00.000Z"
        },
        "reversalThresholdSpec": {
          "value": 30,
          "unit": "percent",
          "source": "Illustrative complaint-volume escalation v1",
          "rationale": "At 30%, treat the prior record-volume statement as materially invalid",
          "confirmedBy": "ClaimTrace public-data case author",
          "confirmedAt": "2026-08-10T00:00:00.000Z"
        }
      }
    }
  ],
  "decisions": [
    {
      "id": "cfpb-consumer-friction-brief",
      "title": "Can the 2024 first-half consumer-friction brief be reused without revision?",
      "owner": "Public-data case reviewer",
      "passActionId": "cfpb:retain-brief-with-sampling-warning",
      "holdActionId": "cfpb:update-pattern-and-volume-notes",
      "actionIfPass": "Retain supported issue-pattern statements with the database sampling and denominator limitations.",
      "actionIfFail": "Update the issue-share or volume statements and keep the complaint-database limitations prominent; do not infer incidence or company fault.",
      "conditions": [
        {
          "claimId": "cfpb-purchase-issue-rank",
          "allowedStatuses": [
            "SUPPORTED"
          ]
        },
        {
          "claimId": "cfpb-report-issue-share",
          "allowedStatuses": [
            "SUPPORTED"
          ]
        },
        {
          "claimId": "cfpb-volume-stability",
          "allowedStatuses": [
            "SUPPORTED"
          ]
        }
      ],
      "stakeholders": [
        "Consumer-analytics readers",
        "Compliance reviewers",
        "Public-data provider"
      ],
      "objective": {
        "benefitWeight": 1,
        "costWeight": 0.2,
        "riskWeight": 1.2
      },
      "riskTolerance": 18,
      "noActionLoss": 30,
      "inputProvenance": {
        "kind": "MANUAL_ASSUMPTION",
        "source": "Illustrative consumer-brief assumptions v1",
        "version": "1.0.0",
        "rationale": "The option scores are demonstration inputs, not observed consumer harm, remediation cost, complaint validity, or institutional performance",
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
        "seed": "cfpb-consumer-friction-brief-v1",
        "stabilitySweep": {
          "parameter": "benefitMultiplier",
          "min": 0.5,
          "max": 1.5,
          "step": 0.05
        }
      },
      "constraints": [
        {
          "id": "analysis-capacity",
          "label": "Analysis capacity",
          "metric": "capacity",
          "operator": "<=",
          "value": 45
        }
      ],
      "options": [
        {
          "id": "reuse",
          "label": "Reuse unchanged",
          "benefit": 32,
          "cost": 6,
          "risk": 32,
          "capacity": 4
        },
        {
          "id": "revise",
          "label": "Revise structured-pattern brief",
          "benefit": 83,
          "cost": 25,
          "risk": 8,
          "capacity": 25
        },
        {
          "id": "study",
          "label": "Add representative consumer research",
          "benefit": 108,
          "cost": 90,
          "risk": 12,
          "capacity": 84
        }
      ]
    }
  ]
} as const;
