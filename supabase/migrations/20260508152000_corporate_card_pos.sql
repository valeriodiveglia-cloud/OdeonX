ALTER TABLE fin_payment_orders ADD COLUMN is_variable_amount BOOLEAN DEFAULT false;
ALTER TABLE fin_payment_orders ADD COLUMN is_online_payment BOOLEAN DEFAULT false;

CREATE OR REPLACE FUNCTION public.fin_auto_generate_card_pos()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    expense RECORD;
    new_po_id UUID;
    next_date DATE;
    prefix TEXT;
    seq_num INT;
BEGIN
    FOR expense IN 
        SELECT * FROM public.fin_corporate_card_expenses 
        WHERE expense_date <= CURRENT_DATE 
          AND is_paid = false
    LOOP
        -- 1. Generate PO Number
        prefix := 'PO-' || extract(year from CURRENT_DATE) || '-' || lpad(extract(month from CURRENT_DATE)::text, 2, '0');
        SELECT count(*) INTO seq_num FROM public.fin_payment_orders WHERE order_number LIKE prefix || '-%';
        
        -- 2. Insert Draft Payment Order
        INSERT INTO public.fin_payment_orders (
            order_number, 
            order_date, 
            total_amount, 
            status, 
            bank_account_id, 
            notes, 
            is_variable_amount, 
            is_online_payment
        ) VALUES (
            prefix || '-' || lpad((seq_num + 1)::text, 3, '0'),
            CURRENT_DATE,
            expense.amount,
            'Pending Review',
            expense.bank_account_id,
            'Corporate card expense: ' || expense.description,
            expense.is_variable_amount,
            expense.is_online_payment
        ) RETURNING id INTO new_po_id;

        -- 3. Insert PO Item
        INSERT INTO public.fin_payment_order_items (
            payment_order_id,
            item_type,
            description,
            account_id,
            amount,
            branch_ids,
            supplier_id,
            invoice_id
        ) VALUES (
            new_po_id,
            'manual',
            expense.description,
            expense.account_id,
            expense.amount,
            expense.branch_ids,
            expense.supplier_id,
            expense.invoice_id
        );

        -- 4. Roll forward or mark paid
        IF expense.frequency = 'One-Time' THEN
            UPDATE public.fin_corporate_card_expenses 
            SET is_paid = true, updated_at = now() 
            WHERE id = expense.id;
        ELSE
            IF expense.frequency = 'Weekly' THEN next_date := expense.expense_date + interval '1 week';
            ELSIF expense.frequency = 'Monthly' THEN next_date := expense.expense_date + interval '1 month';
            ELSIF expense.frequency = 'Quarterly' THEN next_date := expense.expense_date + interval '3 months';
            ELSIF expense.frequency = 'Bi-Annually' THEN next_date := expense.expense_date + interval '6 months';
            ELSIF expense.frequency = 'Yearly' THEN next_date := expense.expense_date + interval '1 year';
            ELSE next_date := expense.expense_date + interval '1 month'; -- fallback
            END IF;

            UPDATE public.fin_corporate_card_expenses 
            SET expense_date = next_date, updated_at = now() 
            WHERE id = expense.id;
        END IF;
    END LOOP;
END;
$$;
