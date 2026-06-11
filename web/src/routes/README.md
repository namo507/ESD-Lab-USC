# Route Directory Contract

Route files remain flat for now so `src/App.tsx` imports stay simple and code
splitting remains one route per lazy import. The intended grouping is:

| Group | Routes |
|-------|--------|
| Core | `Landing`, `Overview`, `GuidedExplorer`, `ExecutiveMode`, `DataExplorer`, `Archetypes`, `ClusterViewer` |
| Participants | `Participants`, `ParticipantDetail`, `ParticipantTimeline`, `Passport` |
| Signals | `EcgQuality`, `HdaBypass`, `HdaPlayer`, `HrDeceleration`, `MultimodalSynchrony` |
| Models | `CascadeDag`, `CascadeSimulator`, `ModelConfidenceTerrain`, `ModelLeaderboard`, `CoRegulation`, `PhasePortrait` |
| Research | `Publications`, `PublicationDetail`, `PublicInsights`, `Results`, `Changelog` |
| Visualization | `AttachmentHeatmap`, `ThermalHeatmap`, `SdohMap`, `SpatialAssessmentMatrix`, `SwimmerPlot`, `StreamCoverage`, `CgaMilestoneRiver`, `CountyComparator`, `Attrition`, `AttritionFunnel` |
| Tools | `Matlab`, `Redcap`, `Runs`, `QA`, `PresentationMaker`, `CvaTheater`, `ShapExplorer`, `StillFace` |

`routeUtils.tsx` is PascalCase because it exports React components used by
multiple dynamic route surfaces. Feature routes may use shared CSS modules
such as `FeatureRoutes.module.css` instead of one CSS module per route when the
route is intentionally part of a common visual family.
