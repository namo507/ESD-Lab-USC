CREATE TABLE IF NOT EXISTS data_changelog (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  entity_type   TEXT NOT NULL,
  entity_id     TEXT NOT NULL,
  action        TEXT NOT NULL,
  actor         TEXT NOT NULL,
  actor_role    TEXT,
  changed_fields_json TEXT,
  snapshot_json TEXT,
  session_id    TEXT,
  ip_hash       TEXT,
  note          TEXT,
  ts            TEXT NOT NULL DEFAULT (datetime('now')),
  version_tag   TEXT
);

CREATE INDEX IF NOT EXISTS idx_changelog_entity ON data_changelog(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_changelog_ts ON data_changelog(ts DESC);
CREATE INDEX IF NOT EXISTS idx_changelog_actor ON data_changelog(actor);
CREATE INDEX IF NOT EXISTS idx_changelog_action ON data_changelog(action);
CREATE INDEX IF NOT EXISTS idx_changelog_version ON data_changelog(version_tag);

CREATE TABLE IF NOT EXISTS dataset_snapshots (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  tag         TEXT NOT NULL UNIQUE,
  description TEXT,
  created_by  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  row_counts  TEXT NOT NULL,
  checksum    TEXT NOT NULL
);
