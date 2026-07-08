-- Migrazione per la creazione del modulo Asset Inventory su database.
-- Crea le tabelle assets e asset_logs con sicurezza RLS.

-- 1. TABELLA ASSETS
CREATE TABLE IF NOT EXISTS public.assets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sku TEXT NOT NULL,
    category TEXT NOT NULL,
    branch TEXT NOT NULL,
    location TEXT NOT NULL,
    type TEXT NOT NULL, -- 'fixed' | 'smallware'
    status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'maintenance' | 'in_transit' | 'broken' | 'out_for_catering'
    condition TEXT NOT NULL DEFAULT 'good', -- 'new' | 'good' | 'fair' | 'poor'
    quantity INTEGER NOT NULL DEFAULT 1,
    par_level INTEGER,
    serial_number TEXT,
    images TEXT[] DEFAULT '{}',
    financials JSONB NOT NULL DEFAULT '{}'::jsonb,
    target_branch TEXT,
    transfer_date TEXT,
    transfer_by TEXT,
    catering_event JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. TABELLA ASSET LOGS
CREATE TABLE IF NOT EXISTS public.asset_logs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    action TEXT NOT NULL, -- 'CREATE' | 'UPDATE' | 'DELETE' | 'TRANSFER_INIT' | 'TRANSFER_RECEIVE' | 'CATERING_OUT' | 'CATERING_RETURN'
    details TEXT NOT NULL,
    "user" TEXT NOT NULL,
    asset_id TEXT,
    asset_name TEXT
);

-- 3. FUNZIONE DI VERIFICA ACCESSO FILIALE PER UTENTE
CREATE OR REPLACE FUNCTION public.fn_check_user_branch_access(p_branch TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_user_role TEXT;
    v_user_branches TEXT[];
BEGIN
    -- Recupera ruolo e branch dell'utente loggato
    SELECT role, branches INTO v_user_role, v_user_branches
    FROM public.app_accounts
    WHERE user_id = auth.uid();

    IF v_user_role IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Owner e Admin hanno accesso globale
    IF v_user_role IN ('owner', 'admin') THEN
        RETURN TRUE;
    END IF;

    -- Se la filiale è nella lista delle filiali abilitate dell'utente (cercando corrispondenza per nome nel database)
    RETURN EXISTS (
        SELECT 1 FROM public.provider_branches pb
        WHERE pb.name = p_branch 
        AND pb.id::text = ANY(v_user_branches)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. ABILITAZIONE RLS
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_logs ENABLE ROW LEVEL SECURITY;

-- 5. POLICY PER TABELLA ASSETS
DROP POLICY IF EXISTS select_assets ON public.assets;
CREATE POLICY select_assets ON public.assets
    FOR SELECT
    USING (
        public.fn_check_user_branch_access(branch) OR 
        (target_branch IS NOT NULL AND public.fn_check_user_branch_access(target_branch))
    );

DROP POLICY IF EXISTS insert_assets ON public.assets;
CREATE POLICY insert_assets ON public.assets
    FOR INSERT
    WITH CHECK (
        public.fn_check_user_branch_access(branch)
    );

DROP POLICY IF EXISTS update_assets ON public.assets;
CREATE POLICY update_assets ON public.assets
    FOR UPDATE
    USING (
        public.fn_check_user_branch_access(branch) OR
        (target_branch IS NOT NULL AND public.fn_check_user_branch_access(target_branch))
    )
    WITH CHECK (
        public.fn_check_user_branch_access(branch) OR
        (target_branch IS NOT NULL AND public.fn_check_user_branch_access(target_branch))
    );

DROP POLICY IF EXISTS delete_assets ON public.assets;
CREATE POLICY delete_assets ON public.assets
    FOR DELETE
    USING (
        public.fn_check_user_branch_access(branch)
    );

-- 6. POLICY PER TABELLA ASSET LOGS
DROP POLICY IF EXISTS select_asset_logs ON public.asset_logs;
CREATE POLICY select_asset_logs ON public.asset_logs
    FOR SELECT
    USING (true); -- tracciabili a fini di audit per tutti gli utenti abilitati

DROP POLICY IF EXISTS insert_asset_logs ON public.asset_logs;
CREATE POLICY insert_asset_logs ON public.asset_logs
    FOR INSERT
    WITH CHECK (true);

-- 7. REFRESH SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
