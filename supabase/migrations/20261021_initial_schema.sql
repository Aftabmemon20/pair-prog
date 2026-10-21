-- ==============================================================================
-- Pairio-Lite Migration: 20261021_initial_schema.sql
-- Tables: sessions, participants, ownership, events, recaps
-- ==============================================================================

-- 1. SESSIONS
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
    doc_snapshot TEXT, -- Base64 encoded or stringified Yjs document binary snapshot
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);

-- 2. PARTICIPANTS
CREATE TABLE IF NOT EXISTS participants (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'peer' CHECK (role IN ('host', 'peer')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_participants_session_id ON participants(session_id);

-- 3. OWNERSHIP
-- Keyed by Python AST symbol name (e.g. apply_discount), NOT fragile line numbers
CREATE TABLE IF NOT EXISTS ownership (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    owner TEXT NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'accepted', 'rejected', 'orphaned')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_session_symbol UNIQUE (session_id, symbol)
);

CREATE INDEX IF NOT EXISTS idx_ownership_session ON ownership(session_id);

-- 4. EVENTS (Append-only audit log & session replay timeline)
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    ts TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    actor TEXT NOT NULL, -- Participant ID, 'pair_master' (AI), or 'system'
    type TEXT NOT NULL,  -- e.g., 'speech', 'run_error', 'tool_call', 'ownership_accept'
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    idempotency_key TEXT NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_events_session_ts ON events(session_id, ts ASC);

-- 5. RECAPS (Session summaries saved on session end)
CREATE TABLE IF NOT EXISTS recaps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    summary TEXT NOT NULL,
    decisions JSONB NOT NULL DEFAULT '[]'::jsonb,
    ownership_summary JSONB NOT NULL DEFAULT '[]'::jsonb,
    bugs_identified JSONB NOT NULL DEFAULT '[]'::jsonb,
    next_steps JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_recaps_session ON recaps(session_id);
