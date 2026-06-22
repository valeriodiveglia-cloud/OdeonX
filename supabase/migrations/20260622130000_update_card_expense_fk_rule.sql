ALTER TABLE public.fin_payment_order_items 
DROP CONSTRAINT IF EXISTS fin_payment_order_items_corporate_card_expense_id_fkey,
ADD CONSTRAINT fin_payment_order_items_corporate_card_expense_id_fkey 
    FOREIGN KEY (corporate_card_expense_id) 
    REFERENCES public.fin_corporate_card_expenses(id) 
    ON DELETE SET NULL;
