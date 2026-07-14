-- Rimuovi vecchie policy restrittive per assets
DROP POLICY IF EXISTS select_assets ON public.assets;
DROP POLICY IF EXISTS insert_assets ON public.assets;
DROP POLICY IF EXISTS update_assets ON public.assets;
DROP POLICY IF EXISTS delete_assets ON public.assets;

-- Crea nuove policy basate sul ruolo dell'utente
CREATE POLICY select_assets ON public.assets
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.app_accounts 
            WHERE app_accounts.user_id = auth.uid() 
            AND app_accounts.role = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'staff'::text, 'sale advisor'::text, 'hr manager'::text, 'accountant'::text])
        )
    );

CREATE POLICY insert_assets ON public.assets
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.app_accounts 
            WHERE app_accounts.user_id = auth.uid() 
            AND app_accounts.role = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'staff'::text, 'sale advisor'::text, 'hr manager'::text])
        )
    );

CREATE POLICY update_assets ON public.assets
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.app_accounts 
            WHERE app_accounts.user_id = auth.uid() 
            AND app_accounts.role = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'staff'::text, 'sale advisor'::text, 'hr manager'::text])
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.app_accounts 
            WHERE app_accounts.user_id = auth.uid() 
            AND app_accounts.role = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'staff'::text, 'sale advisor'::text, 'hr manager'::text])
        )
    );

CREATE POLICY delete_assets ON public.assets
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.app_accounts 
            WHERE app_accounts.user_id = auth.uid() 
            AND app_accounts.role = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'staff'::text, 'sale advisor'::text, 'hr manager'::text])
        )
    );

-- Esegui refresh della cache dello schema di PostgREST
NOTIFY pgrst, 'reload schema';
