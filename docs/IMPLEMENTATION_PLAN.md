# Outreach Dashboard Implementation Plan

## MVP Scope

- Ingest the existing Instagram and TikTok CSV exports into a normalized creator lead model.
- Provide an operational dashboard with import status, pipeline stages, follow-up queue, and basic outreach metrics.
- Keep the frontend useful with static sample data until API contracts are finalized.
- Prioritize reviewer concerns around traceability, duplicate handling, manual review, and safe iteration before automation.

## Frontend Milestones

1. Scaffold Vite React TypeScript app with static dashboard mock.
2. Replace static sample data with typed API clients once backend endpoints exist.
3. Add CSV import flow with mapping preview, validation summary, and duplicate warnings.
4. Add editable pipeline stages, owner assignment, notes, and next follow-up dates.
5. Add filters for platform, stage, score, due date, and owner.

## Backend Contract Needs

- Creator lead list with platform, handle, audience size, score, stage, owner, and next action.
- Follow-up queue endpoint ordered by due date and priority.
- Import session endpoint that reports parsed rows, rejected rows, duplicates, and mapping decisions.
- Metrics endpoint for counts by stage, conversion rate, reply rate, and upcoming commitments.

## Data And Review Notes

- Preserve source filename and row number for every imported creator.
- Treat handles and profile URLs as candidate identifiers, not perfect unique keys.
- Surface low-confidence rows for human review instead of silently discarding them.
- Keep message personalization auditable before any bulk-send workflow is considered.

## Validation

- Frontend build should pass with `npm run build` after dependencies are installed.
- MVP acceptance should cover CSV import preview, duplicate detection, pipeline updates, and follow-up sorting.
- Add fixture-based tests for parser edge cases once import logic is implemented.
