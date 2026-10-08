-- Atlas InternAI - Supabase PostgreSQL Database Schema
-- Version: 1.0.0

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- DROP EXISTING TABLES TO ENSURE CLEAN SCHEMA RECREATION
DROP TABLE IF EXISTS applications CASCADE;
DROP TABLE IF EXISTS processing_history CASCADE;
DROP TABLE IF EXISTS plugin_metrics CASCADE;
DROP TABLE IF EXISTS internship_skills CASCADE;
DROP TABLE IF EXISTS user_actions CASCADE;
DROP TABLE IF EXISTS deadlines CASCADE;
DROP TABLE IF EXISTS crawl_jobs CASCADE;
DROP TABLE IF EXISTS internships CASCADE;
DROP TABLE IF EXISTS sources CASCADE;
DROP TABLE IF EXISTS companies CASCADE;
DROP TABLE IF EXISTS skills CASCADE;
DROP TABLE IF EXISTS resume_versions CASCADE;
DROP TABLE IF EXISTS preferences CASCADE;
DROP TABLE IF EXISTS observability_metrics CASCADE;
DROP TABLE IF EXISTS logs CASCADE;

-- 1. SOURCES TABLE
CREATE TABLE IF NOT EXISTS sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('GOVT', 'UNIVERSITY', 'CORPORATE', 'GITHUB', 'RSS', 'SITEMAP', 'PUBLIC_API', 'DIRECTORY')),
    url TEXT NOT NULL UNIQUE,
    plugin_id VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    requests_per_minute INTEGER DEFAULT 30,
    max_concurrency INTEGER DEFAULT 2,
    crawl_delay_ms INTEGER DEFAULT 2000,
    user_agent TEXT,
    last_crawled_at TIMESTAMPTZ,
    last_health_status VARCHAR(20) DEFAULT 'UNKNOWN',
    metadata_json JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. CRAWL JOBS TABLE
CREATE TABLE IF NOT EXISTS crawl_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')),
    items_found INTEGER DEFAULT 0,
    items_processed INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. COMPANIES TABLE
CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    domain VARCHAR(255),
    industry VARCHAR(100),
    rating_score NUMERIC(3, 2) DEFAULT 3.50,
    is_prestige BOOLEAN DEFAULT FALSE,
    logo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. INTERNSHIPS TABLE
CREATE TABLE IF NOT EXISTS internships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_id UUID REFERENCES sources(id) ON DELETE SET NULL,
    company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    location VARCHAR(255),
    is_remote BOOLEAN DEFAULT FALSE,
    stipend_min NUMERIC(12, 2),
    stipend_max NUMERIC(12, 2),
    stipend_currency VARCHAR(10) DEFAULT 'EUR',
    stipend_text VARCHAR(100),
    apply_url TEXT NOT NULL,
    canonical_url TEXT UNIQUE,
    content_hash VARCHAR(64) UNIQUE,
    deadline TIMESTAMPTZ,
    status VARCHAR(50) DEFAULT 'DISCOVERED' CHECK (status IN ('DISCOVERED', 'NORMALIZED', 'ENRICHED', 'MATCHED', 'RANKED', 'NOTIFIED', 'ARCHIVED')),
    
    -- Scoring Breakdown
    resume_score NUMERIC(5, 2) DEFAULT 0,
    company_score NUMERIC(5, 2) DEFAULT 0,
    growth_score NUMERIC(5, 2) DEFAULT 0,
    deadline_score NUMERIC(5, 2) DEFAULT 0,
    stipend_score NUMERIC(5, 2) DEFAULT 0,
    overall_score NUMERIC(5, 2) DEFAULT 0,
    confidence_score NUMERIC(3, 2) DEFAULT 1.00,
    
    match_explanation TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- SAFE COLUMN MIGRATIONS (Executes BEFORE indexes to guarantee column existence)
ALTER TABLE internships ADD COLUMN IF NOT EXISTS canonical_url TEXT;
ALTER TABLE internships ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);
ALTER TABLE internships ADD COLUMN IF NOT EXISTS resume_score NUMERIC(5, 2) DEFAULT 0;
ALTER TABLE internships ADD COLUMN IF NOT EXISTS company_score NUMERIC(5, 2) DEFAULT 0;
ALTER TABLE internships ADD COLUMN IF NOT EXISTS growth_score NUMERIC(5, 2) DEFAULT 0;
ALTER TABLE internships ADD COLUMN IF NOT EXISTS deadline_score NUMERIC(5, 2) DEFAULT 0;
ALTER TABLE internships ADD COLUMN IF NOT EXISTS stipend_score NUMERIC(5, 2) DEFAULT 0;
ALTER TABLE internships ADD COLUMN IF NOT EXISTS overall_score NUMERIC(5, 2) DEFAULT 0;
ALTER TABLE internships ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(3, 2) DEFAULT 1.00;
ALTER TABLE internships ADD COLUMN IF NOT EXISTS match_explanation TEXT;

-- 5. SKILLS TABLE
CREATE TABLE IF NOT EXISTS skills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    category VARCHAR(50) DEFAULT 'TECHNICAL',
    normalized_name VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. INTERNSHIP_SKILLS JUNCTION TABLE
CREATE TABLE IF NOT EXISTS internship_skills (
    internship_id UUID NOT NULL REFERENCES internships(id) ON DELETE CASCADE,
    skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    is_required BOOLEAN DEFAULT TRUE,
    PRIMARY KEY (internship_id, skill_id)
);

-- 7. RESUME_VERSIONS TABLE
CREATE TABLE IF NOT EXISTS resume_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    raw_text TEXT NOT NULL,
    structured_json JSONB NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. PREFERENCES TABLE (Dynamic Ranking Rules & User Target Settings)
CREATE TABLE IF NOT EXISTS preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(100) NOT NULL UNIQUE,
    value_json JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. USER_ACTIONS TABLE
CREATE TABLE IF NOT EXISTS user_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    internship_id UUID NOT NULL REFERENCES internships(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL CHECK (action_type IN ('VIEWED', 'APPLIED', 'SAVED', 'REJECTED')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. DEADLINES TABLE
CREATE TABLE IF NOT EXISTS deadlines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    internship_id UUID NOT NULL REFERENCES internships(id) ON DELETE CASCADE,
    deadline_date TIMESTAMPTZ NOT NULL,
    alert_sent BOOLEAN DEFAULT FALSE,
    alert_sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. OBSERVABILITY_METRICS TABLE
CREATE TABLE IF NOT EXISTS observability_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    metric_name VARCHAR(100) NOT NULL,
    metric_value NUMERIC(12, 4) NOT NULL,
    tags_json JSONB DEFAULT '{}'::jsonb,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. PROCESSING_HISTORY TABLE (Audit trail for internship pipeline execution)
CREATE TABLE IF NOT EXISTS processing_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    internship_id UUID REFERENCES internships(id) ON DELETE CASCADE,
    stage VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    duration_ms INTEGER,
    error_message TEXT,
    gemini_calls INTEGER DEFAULT 0
);

-- 14. PLUGIN_METRICS TABLE (Performance and health analytics per collector plugin)
CREATE TABLE IF NOT EXISTS plugin_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plugin_id VARCHAR(100) NOT NULL UNIQUE,
    runs INTEGER DEFAULT 0,
    successes INTEGER DEFAULT 0,
    failures INTEGER DEFAULT 0,
    pages_crawled INTEGER DEFAULT 0,
    internships_found INTEGER DEFAULT 0,
    duplicates INTEGER DEFAULT 0,
    average_duration_ms INTEGER DEFAULT 0,
    last_run_at TIMESTAMPTZ
);

-- 15. APPLICATIONS TABLE (Complete internship lifecycle tracking)
CREATE TABLE IF NOT EXISTS applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    internship_id UUID NOT NULL REFERENCES internships(id) ON DELETE CASCADE,
    stage VARCHAR(50) NOT NULL DEFAULT 'RECOMMENDED' CHECK (stage IN ('DISCOVERED', 'RECOMMENDED', 'APPLIED', 'ASSESSMENT', 'INTERVIEW', 'OFFER', 'ACCEPTED', 'REJECTED')),
    notes TEXT,
    applied_at TIMESTAMPTZ,
    assessment_at TIMESTAMPTZ,
    interview_at TIMESTAMPTZ,
    offer_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- INDEXES FOR MAXIMUM QUERY PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_internships_status ON internships(status);
CREATE INDEX IF NOT EXISTS idx_internships_overall_score ON internships(overall_score DESC);
CREATE INDEX IF NOT EXISTS idx_internships_deadline ON internships(deadline);
CREATE INDEX IF NOT EXISTS idx_sources_is_active ON sources(is_active);
CREATE INDEX IF NOT EXISTS idx_observability_metric_name ON observability_metrics(metric_name, recorded_at);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs(created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_internships_canonical_url ON internships(canonical_url);
CREATE UNIQUE INDEX IF NOT EXISTS idx_internships_content_hash ON internships(content_hash);

-- SEED INITIAL DEFAULT PREFERENCES
INSERT INTO preferences (key, value_json, description)
VALUES 
(
  'ranking_weights', 
  '{
    "resumeMatch": 0.40,
    "companyPrestige": 0.20,
    "careerGrowth": 0.15,
    "deadlineUrgency": 0.10,
    "stipend": 0.15
  }'::jsonb, 
  'Multi-factor ranking weights configuration'
),
(
  'user_priorities',
  '{
    "prefer_government": true,
    "prefer_remote": false,
    "prefer_high_stipend": true,
    "target_domains": ["AI/ML", "Backend Engineering", "Systems Programming", "Data Engineering"]
  }'::jsonb,
  'User target domain preferences and priority flags'
)
ON CONFLICT (key) DO NOTHING;

-- RELOAD SUPABASE POSTGREST SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
