-- Add requires_invoice column to fin_payment_order_items
ALTER TABLE fin_payment_order_items ADD COLUMN requires_invoice BOOLEAN NOT NULL DEFAULT false;
