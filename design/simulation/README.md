# Shared simulation

**Status:** Authoritative system design; implementation phases are **PROPOSED**, not approved algorithms.

This directory owns the shared baseball simulation used by Classic and Draft Mode. It is the source of truth for normalized player profiles, contact and ball flight, fielding, park/environment inputs, rule-facing simulation boundaries, calibration, provenance, determinism, and performance evidence. It does not own Draft orchestration, cube economics, franchise modifiers lifecycle, catalog presentation, or season transaction rules; those belong in [`../draft-mode/`](../draft-mode/).

## Start here

- [`model.md`](model.md) — simulation semantics, typed effects, composition order, provenance, deterministic streams, and runtime boundaries.
- [`ballparks.md`](ballparks.md) — the initial Classic stadium-selection and reference-park contract.
- [`validation.md`](validation.md) — evidence required before each model capability is accepted.

## Proposed implementation phases

1. [`phases/01-contact-profiles.md`](phases/01-contact-profiles.md) — establish estimated contact profiles and neutral calibration.
2. [`phases/02-flight-and-fielding.md`](phases/02-flight-and-fielding.md) — make flight, geometry, interception, and fielding determine contact outcomes.
3. [`phases/03-classic-integration.md`](phases/03-classic-integration.md) — prove the shared model through a complete Classic season.
4. [`phases/04-rule-extensions.md`](phases/04-rule-extensions.md) — add prerequisite pitch/count, checked-swing, batting-position, and selected unusual-rule semantics without making every decree a Draft prerequisite.
5. [`phases/05-weather.md`](phases/05-weather.md) — add variable weather using the existing air/wind inputs after Classic integration. Weather mechanics remain open.

Classic runs a first implementation of phases 01–03 as model `contact-v1`; [the project README](../../README.md) describes its current behavior. Each phase is a plan with a purpose, usable result, dependencies, in-scope deliverables, named decisions, measurable evidence, and explicit deferrals. “Proposed” means sequencing is accepted as a design direction, not that an algorithm, parameter, or implementation exists.

## Shared boundaries

- **One engine:** Classic and Draft Mode call the same simulation semantics. They provide different rosters, schedules, rules, and environments; there is no second legacy engine, compatibility shim, or migration burden under the pre-release policy in [`PRODUCT.md`](../../PRODUCT.md).
- **Classic first:** shared contact, flight, collision, and fielding behavior is proven in Classic before the draft-first playable milestone. Draft does not fork or bypass the model.
- **Effect composition before event physics:** profile normalization, park geometry/environment, league rules, and crowd effects are composed into one typed effective environment before the relevant event is resolved. A park effect must not also be applied as a second final-outcome multiplier for the same physical cause.
- **Narrow effects:** effect families name the consumer and legal fields. They are not executable scripts or arbitrary stat-key mutations. Unresolved rules are rejected or explicitly gated rather than silently applied.
- **Evidence over appearance:** estimated exit velocity, launch angle, and spray are labeled as estimates; flight must determine outcomes rather than decorate a preselected hit. Neutral calibration and pitcher calibration preserve intended distinctions among hitters, pitchers, and defenders.
- **Current-version determinism:** a pinned model/data/rules version plus action log reproduces results. Breaking pre-release saves, replays, schemas, and seeded results is allowed; unsupported data is rejected rather than reinterpreted.

## Ownership map

| Concern | Authority |
|---|---|
| Shared simulation semantics and model version | `model.md` |
| Classic initial park selection and reference geometry | `ballparks.md` |
| Evidence, tolerances, fixtures, and runtime measurement | `validation.md` |
| Contact and flight implementation sequence | `phases/01-contact-profiles.md`, `phases/02-flight-and-fielding.md` |
| Classic adoption gate | `phases/03-classic-integration.md` |
| Later rule prerequisites | `phases/04-rule-extensions.md` |
| Later weather sequencing | `phases/05-weather.md` |
| Draft orchestration, packages, catalog, economy, and modifier lifecycle | `../draft-mode/` |
| Cross-system ownership and delivery order | [Design index](../README.md) |

The ordinary Classic reference deck belongs to `ballparks.md`. Draft's fictional stadium/franchise catalog belongs to [the Draft catalog](../draft-mode/catalog.md); it is not duplicated here.
