-- Create trigger function to activate partners on referral insertion/update
CREATE OR REPLACE FUNCTION activate_partner_on_referral()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.partner_id IS NOT NULL THEN
    UPDATE crm_partners
    SET pipeline_stage = 'Active',
        status = 'Active'
    WHERE id = NEW.partner_id
      AND pipeline_stage = 'Waiting for Activation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to crm_referrals
CREATE OR REPLACE TRIGGER trg_activate_partner_on_referral
AFTER INSERT OR UPDATE OF partner_id ON crm_referrals
FOR EACH ROW
EXECUTE FUNCTION activate_partner_on_referral();
