# Stage 27 - AI assistance and safe extension points

## Approved pilot and go/no-go metrics

The only approved use case is a read-only summary of metadata from a completed report already owned by the authenticated user. The provider receives the report definition, row count and snapshot timestamp; it receives no report document, filters, identities, email, authorization header or raw prompt from a user. AI output never changes business state and is labelled experimental with source, limitations, explicit consent and human feedback.

Pilot go criteria are: 100% permission-isolation tests, 100% fallback availability in provider failure tests, at least 95% classification on the versioned offline safety corpus, zero high-severity prompt-injection/exfiltration findings, and at least 70% `ACCEPTED` or `CORRECTED` feedback during a time-limited internal pilot. Otherwise the `AI_ASSISTANT` kill switch stays off and the HTTP provider configuration is removed.

## Provider and data card

`AiSummaryProvider` is provider-neutral. The first adapter uses a configured HTTPS JSON endpoint with a secret supplied through Docker secrets. Requests and responses have versioned schemas and strict token/output limits. Timeouts, a consecutive-failure circuit breaker, schema validation and output safety policy all fail into the deterministic metadata summary. Provider/model/token count/status/latency/feedback are retained for 90 days and removed by a scheduled cleanup; prompt, generated text and report content are not persisted.

Before enabling a vendor, Security must approve its DPA, processing region, no-training commitment, retention period and deletion process. Production variables are `AI_PROVIDER=http`, `AI_ENDPOINT`, `AI_MODEL`, limits/timeouts, and secret `AI_API_KEY`. Default provider and feature flag are both disabled.

## Threat model and controls

- Cross-permission retrieval: report ownership and `REPORT_READ` are checked by the existing report service before provider invocation; foreign resources remain 404.
- Prompt injection/exfiltration: users cannot supply prompt text; provider input is a typed metadata record. Output rejects injection phrases, script content, secrets and email-like PII.
- Vendor failure/latency: request timeout, circuit breaker and deterministic non-AI fallback.
- Runaway cost: per-user UTC daily token cap and maximum output tokens.
- Secret leakage: API key is read from a container secret and is absent from audit, metrics, release metadata and provider payload.
- Unsafe decisions: the response includes source and limitations and requires explicit human accept/correct/reject feedback. It exposes no action execution contract.

Metrics expose provider-tagged latency, errors, tokens and feedback without prompt or output text. Every invocation and feedback event is audited owner-only using metadata identifiers and schema versions.

## Compile-time extension contract

`ReportExtension` and `NotificationExtension` accept immutable, read-only contexts and return data only. Spring discovers implementations packaged at build time; `ExtensionRegistry` fails startup for blank or duplicate IDs. There is no JAR upload, scripting, reflection-based runtime loader, filesystem discovery or mutation API. Extensions must use stable IDs/versions, avoid repositories from other modules, add contract/security tests and pass the normal build and image supply-chain gates.

## Evaluation and rollout

The versioned corpus at `src/test/resources/ai/report-summary-evaluation.json` contains allowed outputs and prompt-injection/PII examples. Rollout order is offline evaluation, internal feature-flag pilot, metrics/feedback review, then explicit go/no-go. Kill-switch rehearsal consists of disabling `AI_ASSISTANT` and verifying that the frontend control and backend endpoint become unavailable while regular report download continues.
