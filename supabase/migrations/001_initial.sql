-- AI Investment Council — core schema (run in Supabase SQL editor or CLI)

CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  investing_profile TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.portfolio_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  shares NUMERIC NOT NULL,
  cost_basis NUMERIC NOT NULL,
  entry_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_user ON public.portfolio_positions(user_id);

CREATE TABLE IF NOT EXISTS public.stock_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  analysis_date TIMESTAMPTZ DEFAULT NOW(),
  final_recommendation TEXT,
  consensus_confidence INT,
  final_thesis TEXT,
  key_disagreement TEXT,
  stock_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analyses_user_ticker ON public.stock_analyses(user_id, ticker);
CREATE INDEX IF NOT EXISTS idx_analyses_date ON public.stock_analyses(analysis_date DESC);

CREATE TABLE IF NOT EXISTS public.agent_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID NOT NULL REFERENCES public.stock_analyses(id) ON DELETE CASCADE,
  agent_type TEXT NOT NULL,
  recommendation TEXT,
  confidence INT,
  thesis TEXT,
  key_metric TEXT,
  key_risk TEXT,
  metrics JSONB
);

CREATE INDEX IF NOT EXISTS idx_agent_responses_analysis ON public.agent_responses(analysis_id);

CREATE TABLE IF NOT EXISTS public.recommendation_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID NOT NULL REFERENCES public.stock_analyses(id) ON DELETE CASCADE,
  position_id UUID REFERENCES public.portfolio_positions(id) ON DELETE SET NULL,
  user_action TEXT,
  action_date DATE,
  entry_price NUMERIC,
  current_price NUMERIC,
  return_pct NUMERIC,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_outcomes_analysis ON public.recommendation_outcomes(analysis_id);

-- Optional: cache raw market snapshots for reproducibility / offline degraded mode
CREATE TABLE IF NOT EXISTS public.stock_data_cache (
  ticker TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
