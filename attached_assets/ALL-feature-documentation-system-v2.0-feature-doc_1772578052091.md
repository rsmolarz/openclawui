# Feature Documentation & Bundles System (v2.0 — 2026-02-09 1:00 PM)

**Brand:** ALL (Platform-Wide)

**Published:** 2026-02-09 1:00 PM

**Status:** complete

## Summary
Brand metadata system, feature bundles view, bundle export packages, and 3 new monetization feature docs.

## v2.0 Overview
Major upgrade adding brand awareness, feature bundles, and monetization documentation:

Brand Metadata (Feb 9, 2026):
- BrandAbbreviation type: DC, FS, BR, LM, DCL, ALL
- Brand badge displayed on every feature card header
- Brand distribution: FS (14), ALL (28+), DCL (3), BR (2), DC (2), LM (1)
- Download filenames prefixed with brand (e.g., "FS-survey-system-v1.0-feature-doc.md")
- Publish date shown in card headers

Feature Bundles (Feb 9, 2026):
- Features / Bundles view toggle in the page header
- 10 bundles grouping related features around a main feature
- Expandable bundle cards showing main + supporting features
- Click-through navigation from bundle items to feature detail
- Export Bundle: Downloads all features in a bundle as one Markdown package

New Feature Docs (Feb 9, 2026):
- Prepaid Wallet System (v1.0) — 7 API routes, 4 sections
- Overage Billing System (v1.0) — 9 API routes, 6 sections
- Membership & Subscription System (v2.0) — Brand-first billing architecture

## Feature Bundles
The bundles view groups features by capability area:

1. Monetization Infrastructure — Membership + Wallet + Overage + Commerce + Promo Codes
2. AI-Powered Survey Workflow — Survey + Wizard + AI Finding + Photo + Chat + Jobs + Settings
3. Document Generation Pipeline — Doc Gen + Merge Tokens + Templates + Valuations + Citations + Field Metadata
4. Boat Review Platform — Boat Review + Proof Layer + Commerce + AI + Media
5. Team Collaboration Suite — Real-time + Sharing + Locking + Users + Branding
6. External Data & Sync — API Sync + Market Data + Boat Sales + CRM + Mapping
7. Distribution Control Layer — DCL Marketing + AI Agents + Autopilot + Branding
8. Listing Maker Workflow — Listing Maker + AI Extractor + Media + Doc Gen + Mapping
9. Admin & Operations — AI Settings + Marketplace + Support + QA + Legal + Trash + Tours
10. User Onboarding & Engagement — Demo Tour + Tours + Multi-Language + Landing Pages + Wizard

Each bundle defines a mainFeature and supportingFeatures[] that reference feature doc IDs.

## Bundle Export Package
The Export Bundle feature generates a shareable Markdown package:

- Downloads all feature docs within a bundle into a single .md file
- Includes bundle header with name, brand, description, and generation date
- Main feature doc appears first, followed by all supporting feature docs
- Each feature includes full version content: sections, files, API routes, dependencies
- Filename format: bundle-{id}-package.md
- Designed for sharing the bundle with other apps that use the feature doc system

## Portability for Other Apps
The feature doc system is designed for cross-project sharing:

- All data is defined as a TypeScript array — copy-paste to another project
- No database dependencies — self-contained in a single component file
- Export Markdown includes Brand and Published metadata for origin tracking
- Bundle packages combine related features into one shareable document
- Standard interfaces (FeatureDoc, FeatureBundle) can be reused across apps

## Files
- `client/src/components/admin/AdminFeatureDocs.tsx` — Feature docs, bundles, brand metadata, and export logic

## Dependencies
- Shadcn UI — Card, Badge, Button, Select components
- Lucide React — Feature and bundle icons

