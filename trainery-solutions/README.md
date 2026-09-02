# Trainery.ai Solutions Problem → Solution Section

This folder contains the standalone HTML/CSS/JS prototype for the Trainery.ai homepage solutions section.

## Files

- `trainery-solutions-section.html` — complete standalone section prototype.

## Interaction

The section has two controls:

1. Solution selector:
   - Corporate Learning Operations
   - Compliance Training Software
   - Extended Enterprise Training
2. Problem / Solution toggle

The **Problem** view intentionally shows fragmented workflows such as spreadsheets, inbox reminders, calendars, separate records, audit folders, forms, and disconnected catalogs.

The **Solution** view replaces those fragmented items with verified TraineryLearn workflows and changes the center state to the selected solution.

### Corporate Learning Operations

Problem examples:
- course assignments in spreadsheets
- trainer coordination in email
- ILT/VILT schedules in separate calendars
- registrations/completion records elsewhere

Solution view:
- courses and learning paths
- ILT/VILT events and sessions
- trainers, locations, enrollment, waitlists and capacity
- registrations, learning records and activity

### Compliance Training Software

Problem examples:
- certification expiry tracking in spreadsheets
- renewal reminders in email
- CPE records tracked separately
- audit evidence assembled manually

Solution view:
- training compliance status
- license and certification tracking
- CPE attainment and risk visibility
- renewal forecasting, escalations, reports and audit workflows

### Extended Enterprise Training

Problem examples:
- external learners in spreadsheets
- registration requests handled through email/forms
- catalogs separated from administration
- events coordinated in separate calendars

Solution view:
- external learner and contractor administration
- external catalog access
- registration funnel visibility
- organization, event and registration reporting

## Developer integration

The prototype is deliberately self-contained. For production:

- Copy the `<section id="trainery-solutions">...</section>` markup into the homepage.
- Move the CSS into the site stylesheet or Webflow custom-code area.
- Move the JS into the page footer / site JS bundle.
- Keep the `ts-` class prefix to avoid collisions with existing Trainery styles.
- Replace the sample typeface and colors with the final Trainery design tokens if needed.
- Keep the current content/feature wording unless product owners approve changes.
- Preserve `prefers-reduced-motion` behavior.
- Test desktop, tablet and mobile before publishing.

## Preview

The Vercel preview is shared separately in the project handoff.
