export const FEATURE_FLAGS = {
  RSA_GROWTH_CURVES: false,
  HDA_TIMELINE_PLAYER: false,
  THERMAL_HEATMAP: false,
  SWIMMER_PLOT: false,
  ATTRITION_FUNNEL: false,
  SDOH_MAP: false,
  SHAP_BEESWARM: false,
  CLUSTER_VIEWER: false,
  MODEL_LEADERBOARD: false,
  CASCADE_DAG: false,
  REDCAP_COMPLETENESS: false,
  ECG_QUALITY_MONITOR: false,
  SPATIAL_ASSESSMENT_MATRIX: false,
  ATTACHMENT_HEATMAP: false,
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;
