-- Migration: Fix Loyalty Transactions Links and Rename Table
-- Date: 2025-12-10

-- 1. Rename table to reflect broader scope (optional but recommended)
ALTER TABLE IF EXISTS prepaid_card_transactions RENAME TO loyalty_card_transactions;

-- 2. Update card_id to point to new loyalty_cards table
-- Strategy: 
-- old_transaction.card_id -> prepaid_cards.id
-- prepaid_cards.card_number -> loyalty_cards.card_number
-- loyalty_cards.id -> new card_id

DO $$
DECLARE
    r RECORD;
BEGIN
    -- We can only update if we can find the link. 
    -- If prepaid_cards table was dropped, we are in trouble. But we haven't dropped it yet.
    
    -- Disable constraints temporarily or we might violate FK if we update to an ID that's not in prepaid_cards yet?
    -- Actually, the current FK references prepaid_cards. 
    -- If we update to loyalty_cards.id, it will fail FK check against prepaid_cards.
    
    -- Step 2a: Drop old constraint
    ALTER TABLE loyalty_card_transactions DROP CONSTRAINT IF EXISTS prepaid_card_transactions_card_id_fkey;
    
    -- Step 2b: Update IDs
    UPDATE loyalty_card_transactions lct
    SET card_id = lc.id
    FROM prepaid_cards pc
    JOIN loyalty_cards lc ON pc.card_number = lc.card_number
    WHERE lct.card_id = pc.id;
    
    -- Step 2c: Add new constraint to loyalty_cards
    ALTER TABLE loyalty_card_transactions 
    ADD CONSTRAINT loyalty_card_transactions_card_id_fkey 
    FOREIGN KEY (card_id) REFERENCES loyalty_cards(id) ON DELETE CASCADE;
    
END $$;
