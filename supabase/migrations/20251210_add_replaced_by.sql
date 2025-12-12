-- Add replaced_by column to track card lineage
ALTER TABLE loyalty_cards 
ADD COLUMN replaced_by UUID REFERENCES loyalty_cards(id);

-- Index for performance (though volume is likely low)
CREATE INDEX idx_loyalty_cards_replaced_by ON loyalty_cards(replaced_by);
