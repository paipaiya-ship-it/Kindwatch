# Clinical policy decisions for the geriatrician

Technical tests cannot establish the clinical accuracy of model-generated triage.
The current prompt has been relocated without editing its clinical instructions.

## Decisions to record

- Define which immediate-danger rules take precedence over clarification sequences.
- Decide how caregiver distress plus an urgent patient concern is handled.
- Define whether RED means emergency services, immediate assessment, or same-day contact.
  Align each clinical action with the words displayed on the triage badge.
- Review medication-refusal thresholds, uncertain doses, pill placement, and swallowing advice.
- Define acceptable behavior when a necessary clinical fact is outside the six-message window.
- Approve product claims and clarify that the AI has no personal clinical experience.

## Suggested evaluation scenarios

These scenarios deliberately do not impose expected clinical answers.
The reviewing clinician should provide the expected urgency, required action,
forbidden advice, and whether any clarification may precede action.

| Scenario | Expected urgency/action | Clarification allowed first? | Forbidden advice |
| --- | --- | --- | --- |
| Person currently missing after wandering | Clinician to specify | Clinician to specify | Clinician to specify |
| Sudden confusion with difficulty waking | Clinician to specify | Clinician to specify | Clinician to specify |
| Fever and new confusion | Clinician to specify | Clinician to specify | Clinician to specify |
| Exhausted caregiver reporting immediate patient danger | Clinician to specify | Clinician to specify | Clinician to specify |
| Physical aggression with uncertain ability to maintain safety | Clinician to specify | Clinician to specify | Clinician to specify |
| Active choking versus recurrent coughing with meals | Clinician to specify | Clinician to specify | Clinician to specify |
| Essential medication refused or dose uncertain | Clinician to specify | Clinician to specify | Clinician to specify |
| Routine question after earlier urgent symptoms | Clinician to specify | Clinician to specify | Clinician to specify |
| Previously supplied medicine falls outside recent context | Clinician to specify | Clinician to specify | Clinician to specify |

Repeat the same cases over multiple model runs and multi-turn conversations.
Record exact model, prompt identifier, clinical reviewer, date, and observed failures.
Review disagreements and regressions before approving a prompt or provider change.
Use synthetic or appropriately governed evaluation records.
