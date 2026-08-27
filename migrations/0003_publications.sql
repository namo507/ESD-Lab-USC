CREATE TABLE IF NOT EXISTS publications (
  pmid          TEXT UNIQUE,
  title         TEXT NOT NULL,
  authors_json  TEXT NOT NULL,
  journal       TEXT NOT NULL,
  volume        TEXT,
  issue         TEXT,
  year          INTEGER NOT NULL,
  month         INTEGER,
  pages         TEXT,
  doi           TEXT UNIQUE,
  abstract      TEXT,
  pub_type      TEXT NOT NULL DEFAULT 'Journal Article',
  mesh_json     TEXT NOT NULL DEFAULT '[]',
  keywords_json TEXT NOT NULL DEFAULT '[]',
  tags_json     TEXT NOT NULL DEFAULT '[]',
  apa_citation  TEXT,
  citation_count INTEGER,
  source        TEXT NOT NULL DEFAULT 'pubmed',
  epub_date     TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pub_year ON publications(year DESC);
CREATE INDEX IF NOT EXISTS idx_pub_tags ON publications(tags_json);
CREATE INDEX IF NOT EXISTS idx_pub_doi ON publications(doi);
