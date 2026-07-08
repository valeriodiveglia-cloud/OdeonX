-- Migrazione: Aggiunta impostazioni Flag Rules e Trigger di automazione
-- Data: 2026-07-02

-- 1. Aggiungiamo la colonna is_converted a hr_staff_warnings
ALTER TABLE public.hr_staff_warnings ADD COLUMN IF NOT EXISTS is_converted boolean DEFAULT false NOT NULL;

-- 2. Creiamo la tabella hr_flag_rules
CREATE TABLE IF NOT EXISTS public.hr_flag_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    yellow_limit integer NOT NULL DEFAULT 2,
    green_limit integer NOT NULL DEFAULT 3,
    award_catalog_id uuid REFERENCES public.hr_awards_catalog(id) ON DELETE SET NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Abilitiamo RLS
ALTER TABLE public.hr_flag_rules ENABLE ROW LEVEL SECURITY;

-- Creazione policy RLS
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'hr_flag_rules' 
          AND policyname = 'Authenticated users can do everything on flag rules'
    ) THEN
        CREATE POLICY "Authenticated users can do everything on flag rules" 
        ON public.hr_flag_rules 
        FOR ALL TO authenticated 
        USING (true) 
        WITH CHECK (true);
    END IF;
END
$$;

-- Grant permissions
GRANT ALL ON public.hr_flag_rules TO authenticated;

-- Inseriamo un record di default iniziale se la tabella è vuota
INSERT INTO public.hr_flag_rules (yellow_limit, green_limit, award_catalog_id)
SELECT 2, 3, null
WHERE NOT EXISTS (SELECT 1 FROM public.hr_flag_rules);

-- 3. Creiamo la funzione trigger per elaborare le bandierine
CREATE OR REPLACE FUNCTION public.fn_trigger_process_staff_warning()
RETURNS TRIGGER AS $$
DECLARE
    v_yellow_limit integer;
    v_green_limit integer;
    v_award_catalog_id uuid;
    v_yellow_count integer;
    v_green_count integer;
    v_award_name text;
    v_award_amount numeric(15,2);
    v_yellow_ids uuid[];
    v_green_ids uuid[];
BEGIN
    -- Evitiamo ricorsioni se il record è già convertito
    IF NEW.is_converted = true THEN
        RETURN NEW;
    END IF;

    -- Recuperiamo le regole configurate
    SELECT yellow_limit, green_limit, award_catalog_id
    INTO v_yellow_limit, v_green_limit, v_award_catalog_id
    FROM public.hr_flag_rules
    LIMIT 1;

    -- Default di sicurezza
    IF v_yellow_limit IS NULL THEN v_yellow_limit := 2; END IF;
    IF v_green_limit IS NULL THEN v_green_limit := 3; END IF;

    -- A. Bandierine Gialle
    IF NEW.flag_type = 'yellow' THEN
        SELECT COALESCE(array_agg(id), '{}')
        INTO v_yellow_ids
        FROM public.hr_staff_warnings
        WHERE staff_id = NEW.staff_id
          AND flag_type = 'yellow'
          AND is_converted = false;

        v_yellow_count := array_length(v_yellow_ids, 1);
        
        IF v_yellow_count >= v_yellow_limit THEN
            -- Inseriamo il warning rosso (Red Flag)
            INSERT INTO public.hr_staff_warnings (
                staff_id,
                date,
                flag_type,
                reason,
                notified_by,
                is_converted
            ) VALUES (
                NEW.staff_id,
                NEW.date,
                'red',
                'Automatic warning generated for accumulation of ' || v_yellow_limit || ' yellow flags',
                'System',
                false
            );

            -- Convertiamo le bandierine gialle coinvolte
            UPDATE public.hr_staff_warnings
            SET is_converted = true
            WHERE id = ANY(v_yellow_ids);
        END IF;

    -- B. Bandierine Verdi
    ELSIF NEW.flag_type = 'green' THEN
        SELECT COALESCE(array_agg(id), '{}')
        INTO v_green_ids
        FROM public.hr_staff_warnings
        WHERE staff_id = NEW.staff_id
          AND flag_type = 'green'
          AND is_converted = false;

        v_green_count := array_length(v_green_ids, 1);

        IF v_green_count >= v_green_limit THEN
            -- Se c'è un premio configurato nei settings
            IF v_award_catalog_id IS NOT NULL THEN
                SELECT award_name, default_amount
                INTO v_award_name, v_award_amount
                FROM public.hr_awards_catalog
                WHERE id = v_award_catalog_id;

                IF v_award_name IS NOT NULL THEN
                    INSERT INTO public.hr_staff_awards (
                        staff_id,
                        date,
                        award_name,
                        amount,
                        notified_by,
                        deduction_source,
                        status
                    ) VALUES (
                        NEW.staff_id,
                        NEW.date,
                        v_award_name || ' (Auto)',
                        v_award_amount,
                        'System',
                        'salary',
                        'pending'
                    );
                END IF;
            END IF;

            -- Convertiamo le bandierine verdi coinvolte
            UPDATE public.hr_staff_warnings
            SET is_converted = true
            WHERE id = ANY(v_green_ids);
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Creiamo il trigger AFTER INSERT
DROP TRIGGER IF EXISTS trg_after_insert_staff_warning ON public.hr_staff_warnings;
CREATE TRIGGER trg_after_insert_staff_warning
AFTER INSERT ON public.hr_staff_warnings
FOR EACH ROW
EXECUTE FUNCTION public.fn_trigger_process_staff_warning();


-- 5. Creiamo il trigger AFTER DELETE per ripristinare le bandierine gialle
CREATE OR REPLACE FUNCTION public.fn_trigger_delete_staff_warning()
RETURNS TRIGGER AS $$
DECLARE
    v_yellow_limit integer;
    v_yellow_ids uuid[];
BEGIN
    -- Se viene eliminato un warning rosso generato automaticamente
    IF OLD.flag_type = 'red' AND (OLD.reason LIKE 'Automatic warning generated%' OR OLD.reason LIKE 'Warning automatico%') THEN
        -- Recuperiamo il limite dalle regole
        SELECT yellow_limit INTO v_yellow_limit FROM public.hr_flag_rules LIMIT 1;
        IF v_yellow_limit IS NULL THEN v_yellow_limit := 2; END IF;

        -- Troviamo le ultime bandierine gialle convertite per questo staff
        SELECT array_agg(id) INTO v_yellow_ids
        FROM (
            SELECT id FROM public.hr_staff_warnings
            WHERE staff_id = OLD.staff_id
              AND flag_type = 'yellow'
              AND is_converted = true
            ORDER BY date DESC, created_at DESC
            LIMIT v_yellow_limit
        ) sub;

        -- Le ripristiniamo a non convertite
        IF v_yellow_ids IS NOT NULL AND array_length(v_yellow_ids, 1) > 0 THEN
            UPDATE public.hr_staff_warnings
            SET is_converted = false
            WHERE id = ANY(v_yellow_ids);
        END IF;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_after_delete_staff_warning ON public.hr_staff_warnings;
CREATE TRIGGER trg_after_delete_staff_warning
AFTER DELETE ON public.hr_staff_warnings
FOR EACH ROW
EXECUTE FUNCTION public.fn_trigger_delete_staff_warning();


-- 6. Creiamo il trigger AFTER DELETE per ripristinare le bandierine verdi
CREATE OR REPLACE FUNCTION public.fn_trigger_delete_staff_award()
RETURNS TRIGGER AS $$
DECLARE
    v_green_limit integer;
    v_green_ids uuid[];
BEGIN
    -- Se viene eliminato un award generato automaticamente
    IF OLD.award_name LIKE '%(Auto)' THEN
        -- Recuperiamo il limite dalle regole
        SELECT green_limit INTO v_green_limit FROM public.hr_flag_rules LIMIT 1;
        IF v_green_limit IS NULL THEN v_green_limit := 3; END IF;

        -- Troviamo le ultime bandierine verdi convertite per questo staff
        SELECT array_agg(id) INTO v_green_ids
        FROM (
            SELECT id FROM public.hr_staff_warnings
            WHERE staff_id = OLD.staff_id
              AND flag_type = 'green'
              AND is_converted = true
            ORDER BY date DESC, created_at DESC
            LIMIT v_green_limit
        ) sub;

        -- Le ripristiniamo a non convertite
        IF v_green_ids IS NOT NULL AND array_length(v_green_ids, 1) > 0 THEN
            UPDATE public.hr_staff_warnings
            SET is_converted = false
            WHERE id = ANY(v_green_ids);
        END IF;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_after_delete_staff_award ON public.hr_staff_awards;
CREATE TRIGGER trg_after_delete_staff_award
AFTER DELETE ON public.hr_staff_awards
FOR EACH ROW
EXECUTE FUNCTION public.fn_trigger_delete_staff_award();
