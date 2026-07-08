-- Funzione trigger con SECURITY DEFINER per de-assegnare i partner
CREATE OR REPLACE FUNCTION public.handle_deactivated_sales_advisor()
RETURNS TRIGGER AS $$
BEGIN
    -- Si attiva solo quando is_active passa da true a false
    IF OLD.is_active = true AND NEW.is_active = false THEN
        UPDATE public.crm_partners
        SET owner_id = NULL
        WHERE owner_id = OLD.user_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Definizione del trigger sulla tabella app_accounts
DROP TRIGGER IF EXISTS app_accounts_deactivation_trigger ON public.app_accounts;
CREATE TRIGGER app_accounts_deactivation_trigger
AFTER UPDATE OF is_active ON public.app_accounts
FOR EACH ROW
EXECUTE FUNCTION public.handle_deactivated_sales_advisor();
