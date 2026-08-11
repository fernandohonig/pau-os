# PAU OS — Privacy Posture (MVP)

**Status:** Draft. **This is not legal advice.** The product targets minors
(≈16–18), so privacy is a first-class requirement (spec §23). A qualified legal
/ data-protection review is required before any production deployment or before
collecting persistent student accounts.

## What we collect (v0.1)

The MVP is designed to run with **no personal data**:

- **Pseudonymous student id** — a random `cuid`, created anonymously with no
  email, name, date of birth, or location. (`Student.sessionId`/`email` exist in
  the schema for a future opt-in login but are unused and unpopulated in v0.1.)
- **Learning data** — assessment/session responses (question id, chosen option,
  correctness, timing), derived skill-mastery estimates, goals (a chosen degree
  id + optional target score), and recommendations.
- **Analytics events** (`learning_events`, spec §22) — event name + a small JSON
  payload (ids, outcomes, timestamps). No identifying information.

We deliberately do **not** collect: real names, email (until an opt-in account
feature exists), date of birth, precise location, device advertising ids, or
any third-party advertising/behavioral SDKs.

## Data subject controls

- **Right to erasure** — `DELETE /v1/students/:id` deletes the student and
  cascades to goals, assessments, responses, skill states, practice sessions and
  recommendations. Analytics events are anonymized (their `studentId` is set to
  null) rather than retained against an identity.

## Retention & deletion (to define before production)

- A concrete retention window and automated deletion job must be defined before
  persistent accounts are offered (spec §23).
- Anonymized analytics events may be retained for learning-gain analysis; this
  policy must be documented and reviewed.

## Consent & minors (to resolve before production)

- Parental/guardian consent requirements for minors must be reviewed with legal
  counsel for the target jurisdiction (Catalunya / Spain / EU GDPR).
- The anonymous diagnostic requires no account and no consent flow; any move to
  persistent accounts triggers the consent/retention review above.

## Security (see spec §24)

HTTPS in production, encrypted secrets, server-side authorization for admin
endpoints, rate limiting, input validation, content sanitization, admin audit
logging, DB backups, dependency scanning, and no secrets in Git. The admin
metrics/review endpoints are currently unauthenticated in dev and **must** be
protected before any non-local deployment.

## Open items

- [ ] Legal review of minors' consent obligations.
- [ ] Define + implement retention window and deletion job.
- [ ] Authenticate/authorize admin endpoints.
- [ ] Data Protection Impact Assessment (DPIA) before pilot with real students.
