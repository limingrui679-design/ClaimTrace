// Generated from the executable source under src/cases/business-operations/case.ts.
export default {
  "id": "business-operations",
  "title": "Business Operations: Channel Conversion and Service Capacity",
  "primaryKey": "channel_id",
  "claims": [
    {
      "id": "business-referral-rank",
      "code": "BO-001",
      "title": "Referral remains the highest-converting channel",
      "section": "Channel strategy",
      "owner": "Growth owner",
      "category": "Channel ranking",
      "formula": "argmax(channel, conversion_rate) = Referral",
      "rule": {
        "type": "rank",
        "field": "conversion_rate",
        "aggregation": "average",
        "groupField": "channel",
        "expectedGroup": "Referral",
        "rank": "max",
        "tiePolicy": "require_unique"
      }
    },
    {
      "id": "business-service-gate",
      "code": "BO-002",
      "title": "Average ticket handling time does not exceed 12 hours",
      "section": "Service capacity",
      "owner": "Service owner",
      "category": "Service threshold",
      "formula": "mean(ticket_hours) <= 12",
      "rule": {
        "type": "threshold",
        "field": "ticket_hours",
        "aggregation": "average",
        "operator": "<=",
        "threshold": 12,
        "thresholdSpec": {
          "value": 12,
          "unit": "absolute",
          "source": "Synthetic service SLA v1",
          "rationale": "Handling times above 12 hours trigger service-capacity expansion",
          "confirmedBy": "Synthetic case owner",
          "confirmedAt": "2026-08-08T00:00:00.000Z"
        }
      }
    },
    {
      "id": "business-lead-stability",
      "code": "BO-003",
      "title": "Serviceable lead volume remains within a 5% change",
      "section": "Capacity planning",
      "owner": "Operations owner",
      "category": "Volume stability",
      "formula": "abs(mean(eligible_leads_v2)-mean(eligible_leads_v1))/mean(v1) <= 5%",
      "rule": {
        "type": "stability",
        "field": "eligible_leads",
        "aggregation": "average",
        "supportTolerance": 5,
        "reversalThreshold": 12,
        "supportToleranceSpec": {
          "value": 5,
          "unit": "percent",
          "source": "Synthetic capacity plan v1",
          "rationale": "Retain the current staffing plan within a 5% change",
          "confirmedBy": "Synthetic case owner",
          "confirmedAt": "2026-08-08T00:00:00.000Z"
        },
        "reversalThresholdSpec": {
          "value": 12,
          "unit": "percent",
          "source": "Synthetic capacity risk policy v1",
          "rationale": "At 12%, the original capacity assumption is invalid",
          "confirmedBy": "Synthetic case owner",
          "confirmedAt": "2026-08-08T00:00:00.000Z"
        }
      }
    }
  ],
  "decisions": [
    {
      "id": "business-channel-allocation",
      "title": "How should next month's channel budget and service capacity be allocated?",
      "owner": "Commercial operations lead",
      "passActionId": "business:keep-referral-priority",
      "holdActionId": "business:freeze-and-reallocate",
      "actionIfPass": "Retain the Referral-first allocation.",
      "actionIfFail": "Freeze the original budget ranking and reallocate using the revised results.",
      "conditions": [
        {
          "claimId": "business-referral-rank",
          "allowedStatuses": [
            "SUPPORTED"
          ]
        },
        {
          "claimId": "business-service-gate",
          "allowedStatuses": [
            "SUPPORTED",
            "WEAKENED"
          ]
        }
      ],
      "priorSignedResult": {
        "versionId": "business-v1",
        "outcome": "PASS",
        "activeActionId": "business:keep-referral-priority",
        "actionIdentityHash": "e0d661553f3aabd3e0f7068f3d2eb6ff812144563ecb73e6f1d7b3e96c55a4e5",
        "recommendedOptionId": "keep-referral",
        "feasibleOptionIds": [
          "keep-referral"
        ],
        "decisionPolicyHash": "f9c44cb50b2145f2c6672af89074d1dd2159aa2e375eb4def98bf3f391cdd9ae",
        "decisionInputProvenanceHash": "3def3abbf6f8f11c6314063bb2d7e9718d468408ca99233c45aec28b41e82279",
        "baselineSha256": "f7f552cad2e423840a127163c82fd67b19985c9d9acb39876b42a0d32d2138a3",
        "currentSha256": "5f13b35768ec69233e17580f207065e6194bf2959d93904e329f981b1ae42890",
        "ruleVersion": "claimtrace-rule/4.0.0",
        "claimResultIds": [
          "prior-result:business-v1:business-referral-rank",
          "prior-result:business-v1:business-service-gate"
        ],
        "historyBasis": "RECORDED_IDENTITY",
        "reviewRecordId": "synthetic-prior-review:business-channel-allocation:business-v1",
        "reviewRecordHash": "5ea518a210ba207c67bee6f0e07463eb2c519429d774e33670ec309580027296",
        "signedAt": "2026-08-01T08:00:00.000Z",
        "signedBy": "Synthetic commercial owner"
      },
      "stakeholders": [
        "Growth team",
        "Customer service team",
        "Finance"
      ],
      "objective": {
        "benefitWeight": 1,
        "costWeight": 0.25,
        "riskWeight": 1
      },
      "riskTolerance": 22,
      "noActionLoss": 35,
      "inputProvenance": {
        "kind": "MANUAL_ASSUMPTION",
        "source": "Synthetic commercial planning assumptions",
        "version": "1.0.0",
        "rationale": "Used to demonstrate deterministic multi-option scoring; these are not observed business outcomes or real budgets",
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
        "seed": "business-allocation-v1",
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
          "label": "Budget ceiling",
          "metric": "cost",
          "operator": "<=",
          "value": 65
        },
        {
          "id": "capacity",
          "label": "Service capacity",
          "metric": "capacity",
          "operator": "<=",
          "value": 55
        }
      ],
      "options": [
        {
          "id": "keep-referral",
          "label": "Keep Referral first",
          "benefit": 64,
          "cost": 42,
          "risk": 24,
          "capacity": 40
        },
        {
          "id": "shift-partner",
          "label": "Shift to Partner",
          "benefit": 86,
          "cost": 54,
          "risk": 16,
          "capacity": 52
        },
        {
          "id": "expand-all",
          "label": "Expand all channels",
          "benefit": 105,
          "cost": 88,
          "risk": 28,
          "capacity": 76
        }
      ]
    }
  ]
} as const;
