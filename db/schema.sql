CREATE TABLE IF NOT EXISTS source (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL DEFAULT 'web',
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  publisher TEXT NOT NULL,
  published_at TEXT,
  fetched_at TIMESTAMPTZ,
  license_note TEXT,
  content_hash TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS entity (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  layer TEXT NOT NULL,
  description TEXT NOT NULL,
  website_url TEXT,
  country TEXT,
  founded_year INTEGER,
  status TEXT NOT NULL,
  valuation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS entity_alias (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entity(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  alias_type TEXT NOT NULL DEFAULT 'name',
  source_id TEXT REFERENCES source(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_id, alias)
);

CREATE TABLE IF NOT EXISTS company_profile (
  entity_id TEXT PRIMARY KEY REFERENCES entity(id) ON DELETE CASCADE,
  ticker TEXT,
  exchange TEXT,
  legal_name TEXT,
  sector TEXT,
  headquarters TEXT,
  employee_count INTEGER,
  is_public BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS entity_redirect (
  old_entity_id TEXT PRIMARY KEY,
  target_entity_id TEXT NOT NULL,
  redirect_type TEXT NOT NULL DEFAULT 'merge',
  source_type TEXT NOT NULL DEFAULT 'candidate_entity',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS relationship (
  id TEXT PRIMARY KEY,
  source_entity_id TEXT NOT NULL REFERENCES entity(id) ON DELETE CASCADE,
  target_entity_id TEXT NOT NULL REFERENCES entity(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,
  confidence NUMERIC(4, 3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  is_inferred BOOLEAN NOT NULL DEFAULT false,
  extraction_method TEXT NOT NULL DEFAULT 'manual_seed',
  first_seen_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('candidate', 'approved', 'rejected')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_entity_id, target_entity_id, relation_type, note)
);

CREATE TABLE IF NOT EXISTS relationship_evidence (
  id TEXT PRIMARY KEY,
  relationship_id TEXT NOT NULL REFERENCES relationship(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES source(id),
  evidence_title TEXT NOT NULL,
  evidence_url TEXT NOT NULL,
  evidence_date TEXT,
  quote_excerpt TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS metric (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL REFERENCES entity(id) ON DELETE CASCADE,
  metric_type TEXT NOT NULL,
  value_number NUMERIC,
  value_text TEXT,
  unit TEXT,
  period TEXT,
  as_of_date TEXT NOT NULL,
  source_id TEXT REFERENCES source(id),
  source_ref TEXT,
  confidence NUMERIC(4, 3) NOT NULL DEFAULT 0.7 CHECK (confidence >= 0 AND confidence <= 1),
  is_estimated BOOLEAN NOT NULL DEFAULT false,
  calculation_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_id, metric_type, as_of_date, source_id, source_ref)
);

CREATE TABLE IF NOT EXISTS raw_document (
  id TEXT PRIMARY KEY,
  source_id TEXT REFERENCES source(id),
  url TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  content_type TEXT,
  content_hash TEXT,
  storage_path TEXT,
  parse_status TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS parsed_document (
  id TEXT PRIMARY KEY,
  raw_document_id TEXT NOT NULL REFERENCES raw_document(id) ON DELETE CASCADE,
  entity_id TEXT REFERENCES entity(id),
  connector TEXT,
  parser TEXT NOT NULL,
  parser_status TEXT NOT NULL CHECK (parser_status IN ('parsed', 'empty', 'skipped')),
  parsed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  format TEXT NOT NULL,
  content_hash TEXT,
  title TEXT,
  canonical_url TEXT,
  publisher TEXT,
  text_excerpt TEXT,
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  links JSONB NOT NULL DEFAULT '[]'::jsonb,
  facts JSONB NOT NULL DEFAULT '[]'::jsonb,
  extraction_hints JSONB NOT NULL DEFAULT '[]'::jsonb,
  json_summary JSONB,
  quality JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS extraction_record (
  id TEXT PRIMARY KEY,
  raw_document_id TEXT NOT NULL REFERENCES raw_document(id) ON DELETE CASCADE,
  parsed_document_id TEXT REFERENCES parsed_document(id) ON DELETE SET NULL,
  entity_id TEXT REFERENCES entity(id),
  connector TEXT,
  status TEXT NOT NULL CHECK (status IN ('extracted', 'skipped')),
  extraction_method TEXT NOT NULL,
  extracted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  content_hash TEXT,
  evidence_url TEXT,
  prompt TEXT,
  relationships JSONB NOT NULL DEFAULT '[]'::jsonb,
  metrics JSONB NOT NULL DEFAULT '[]'::jsonb,
  entities JSONB NOT NULL DEFAULT '[]'::jsonb,
  quality JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS llm_extraction (
  id TEXT PRIMARY KEY,
  extraction_record_id TEXT NOT NULL REFERENCES extraction_record(id) ON DELETE CASCADE,
  raw_document_id TEXT NOT NULL REFERENCES raw_document(id) ON DELETE CASCADE,
  parsed_document_id TEXT REFERENCES parsed_document(id) ON DELETE SET NULL,
  entity_id TEXT REFERENCES entity(id),
  provider TEXT NOT NULL,
  model TEXT,
  status TEXT NOT NULL CHECK (status IN ('completed', 'skipped', 'failed')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  evidence_url TEXT,
  prompt_hash TEXT,
  relationships JSONB NOT NULL DEFAULT '[]'::jsonb,
  metrics JSONB NOT NULL DEFAULT '[]'::jsonb,
  entities JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  quality JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS connector_run (
  id TEXT PRIMARY KEY,
  connector_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('planned', 'success', 'partial', 'failed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  planned_items INTEGER NOT NULL DEFAULT 0,
  raw_documents INTEGER NOT NULL DEFAULT 0,
  candidate_relationships INTEGER NOT NULL DEFAULT 0,
  candidate_entities INTEGER NOT NULL DEFAULT 0,
  candidate_metrics INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS candidate_relationship (
  id TEXT PRIMARY KEY,
  source_entity_id TEXT REFERENCES entity(id),
  target_entity_id TEXT REFERENCES entity(id),
  relation_type TEXT NOT NULL,
  confidence NUMERIC(4, 3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  evidence_url TEXT,
  extraction_method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate', 'approved', 'rejected')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS candidate_entity (
  id TEXT PRIMARY KEY,
  entity_id TEXT,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  layer TEXT NOT NULL,
  description TEXT NOT NULL,
  website_url TEXT,
  country TEXT,
  status_text TEXT NOT NULL,
  valuation TEXT,
  aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence NUMERIC(4, 3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  evidence_url TEXT,
  extraction_method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate', 'approved', 'rejected')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS candidate_metric (
  id TEXT PRIMARY KEY,
  entity_id TEXT REFERENCES entity(id),
  metric_type TEXT NOT NULL,
  value_number NUMERIC,
  value_text TEXT,
  as_of_date TEXT NOT NULL,
  source_id TEXT REFERENCES source(id),
  source_ref TEXT,
  confidence NUMERIC(4, 3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  evidence_url TEXT,
  extraction_method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate', 'approved', 'rejected')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL DEFAULT 'system',
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  before_payload JSONB,
  after_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entity_layer ON entity(layer);
CREATE INDEX IF NOT EXISTS idx_entity_type ON entity(type);
CREATE INDEX IF NOT EXISTS idx_entity_country ON entity(country);
CREATE INDEX IF NOT EXISTS idx_alias_alias ON entity_alias(alias);
CREATE INDEX IF NOT EXISTS idx_entity_redirect_target ON entity_redirect(target_entity_id);
CREATE INDEX IF NOT EXISTS idx_relationship_source ON relationship(source_entity_id);
CREATE INDEX IF NOT EXISTS idx_relationship_target ON relationship(target_entity_id);
CREATE INDEX IF NOT EXISTS idx_relationship_type_status ON relationship(relation_type, status);
CREATE INDEX IF NOT EXISTS idx_metric_entity ON metric(entity_id);
CREATE INDEX IF NOT EXISTS idx_metric_type ON metric(metric_type);
CREATE INDEX IF NOT EXISTS idx_raw_document_source ON raw_document(source_id);
CREATE INDEX IF NOT EXISTS idx_parsed_document_raw ON parsed_document(raw_document_id);
CREATE INDEX IF NOT EXISTS idx_extraction_record_raw ON extraction_record(raw_document_id);
CREATE INDEX IF NOT EXISTS idx_llm_extraction_record ON llm_extraction(extraction_record_id);
