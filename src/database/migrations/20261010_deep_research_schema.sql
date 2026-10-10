-- Migration: Deep Research Engine Schema for PFE Scout
-- Enables real deterministic research, evidence tracking, researcher identity, and verification rules

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. SEARCH_RUNS TABLE
CREATE TABLE IF NOT EXISTS search_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    query TEXT NOT NULL,
    source_adapter VARCHAR(100) NOT NULL,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    status VARCHAR(50) DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED')),
    results_count INTEGER DEFAULT 0,
    http_status INTEGER,
    pagination_info JSONB DEFAULT '{}'::jsonb,
    error_details TEXT,
    retry_count INTEGER DEFAULT 0
);

-- 2. SOURCE_DOCUMENTS TABLE
CREATE TABLE IF NOT EXISTS source_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    url TEXT NOT NULL,
    canonical_url TEXT UNIQUE,
    content_type VARCHAR(100),
    http_status INTEGER,
    content_hash VARCHAR(64) UNIQUE,
    retrieved_at TIMESTAMPTZ DEFAULT NOW(),
    extraction_status VARCHAR(50) DEFAULT 'PENDING' CHECK (extraction_status IN ('PENDING', 'EXTRACTED', 'OCR_PROCESSED', 'FAILED')),
    is_pdf BOOLEAN DEFAULT FALSE,
    requires_js BOOLEAN DEFAULT FALSE,
    evidence_metadata JSONB DEFAULT '{}'::jsonb
);

-- 3. INTERNSHIP_OFFERS TABLE
CREATE TABLE IF NOT EXISTS internship_offers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    employer TEXT,
    laboratory TEXT,
    country VARCHAR(100),
    city VARCHAR(100),
    description TEXT,
    deadline TIMESTAMPTZ,
    duration_months NUMERIC(4, 1),
    start_date VARCHAR(100),
    compensation_status VARCHAR(50) DEFAULT 'UNKNOWN' CHECK (compensation_status IN ('PAID', 'UNPAID', 'LEGAL_GRATIFICATION', 'UNKNOWN')),
    stipend_amount NUMERIC(10, 2),
    stipend_currency VARCHAR(10) DEFAULT 'EUR',
    eligibility VARCHAR(50) DEFAULT 'ELIGIBLE' CHECK (eligibility IN ('ELIGIBLE', 'PENDING_REVIEW', 'REJECTED')),
    application_url TEXT,
    final_status VARCHAR(50) DEFAULT 'DISCOVERED' CHECK (final_status IN ('DISCOVERED', 'VERIFIED', 'SUPERVISOR_ASSIGNED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'APPLIED', 'ARCHIVED')),
    score NUMERIC(5, 2) DEFAULT 0,
    technical_domain VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. OFFER_SOURCES TABLE
CREATE TABLE IF NOT EXISTS offer_sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    offer_id UUID NOT NULL REFERENCES internship_offers(id) ON DELETE CASCADE,
    source_document_id UUID REFERENCES source_documents(id) ON DELETE SET NULL,
    source_url TEXT NOT NULL,
    evidence_snippets JSONB DEFAULT '[]'::jsonb,
    source_type VARCHAR(50) DEFAULT 'OFFICIAL_PAGE' CHECK (source_type IN ('OFFICIAL_PAGE', 'PDF_DOCUMENT', 'PORTAL_API', 'RESEARCH_TEAM', 'STAFF_DIRECTORY')),
    discovered_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. RESEARCHERS TABLE
CREATE TABLE IF NOT EXISTS researchers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name TEXT NOT NULL,
    institution TEXT,
    laboratory TEXT,
    profile_url TEXT,
    primary_role VARCHAR(100),
    identity_evidence JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. OFFER_RESEARCHERS TABLE
CREATE TABLE IF NOT EXISTS offer_researchers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    offer_id UUID NOT NULL REFERENCES internship_offers(id) ON DELETE CASCADE,
    researcher_id UUID NOT NULL REFERENCES researchers(id) ON DELETE CASCADE,
    relationship_role VARCHAR(50) DEFAULT 'SUPERVISOR' CHECK (relationship_role IN ('SUPERVISOR', 'PROJECT_LEADER', 'ADMIN_CONTACT', 'HR_CONTACT')),
    confidence_status VARCHAR(50) NOT NULL CHECK (confidence_status IN ('SUPERVISOR_EXPLICIT', 'SUPERVISOR_CONFIRMED', 'SUPERVISOR_STRONG_MATCH', 'SUPERVISOR_POSSIBLE', 'SUPERVISOR_UNKNOWN')),
    supporting_evidence JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(offer_id, researcher_id, relationship_role)
);

-- 7. RESEARCHER_EMAILS TABLE
CREATE TABLE IF NOT EXISTS researcher_emails (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    researcher_id UUID NOT NULL REFERENCES researchers(id) ON DELETE CASCADE,
    exact_address TEXT NOT NULL,
    email_status VARCHAR(50) NOT NULL CHECK (email_status IN (
        'E1_OFFICIAL_DIRECT',
        'E2_OFFICIAL_CORROBORATED',
        'E3_PUBLICATION_LISTED',
        'E4_UNVERIFIED_CANDIDATE',
        'E5_GENERIC_CONTACT',
        'E6_INVALID_OR_CONTRADICTED',
        'E7_NOT_FOUND'
    )),
    source_url TEXT,
    evidence_snippet TEXT,
    last_checked TIMESTAMPTZ DEFAULT NOW(),
    verification_notes TEXT,
    UNIQUE(researcher_id, exact_address)
);

-- 8. PIPELINE_LOGS TABLE
CREATE TABLE IF NOT EXISTS pipeline_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id UUID REFERENCES search_runs(id) ON DELETE SET NULL,
    task_name VARCHAR(100) NOT NULL,
    url TEXT,
    operation VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL,
    error TEXT,
    retry_count INTEGER DEFAULT 0,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. REVIEW_QUEUE TABLE
CREATE TABLE IF NOT EXISTS review_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    offer_id UUID NOT NULL REFERENCES internship_offers(id) ON DELETE CASCADE,
    review_reason TEXT NOT NULL,
    unresolved_questions JSONB DEFAULT '[]'::jsonb,
    priority VARCHAR(20) DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
    approval_status VARCHAR(50) DEFAULT 'PENDING' CHECK (approval_status IN ('PENDING', 'APPROVED', 'DISMISSED')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_search_runs_status ON search_runs(status);
CREATE INDEX IF NOT EXISTS idx_source_docs_hash ON source_documents(content_hash);
CREATE INDEX IF NOT EXISTS idx_internship_offers_score ON internship_offers(score DESC);
CREATE INDEX IF NOT EXISTS idx_internship_offers_status ON internship_offers(final_status);
CREATE INDEX IF NOT EXISTS idx_offer_researchers_conf ON offer_researchers(confidence_status);
CREATE INDEX IF NOT EXISTS idx_researcher_emails_status ON researcher_emails(email_status);
CREATE INDEX IF NOT EXISTS idx_pipeline_logs_run_id ON pipeline_logs(run_id);
