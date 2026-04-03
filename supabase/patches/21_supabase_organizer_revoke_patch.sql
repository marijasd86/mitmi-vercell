CREATE OR REPLACE FUNCTION public.revoke_organizer_claim(
    p_organizer_id UUID,
    p_note TEXT DEFAULT NULL
)
RETURNS UUID AS $$
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Only admins can revoke organizer claims';
    END IF;

    UPDATE public.organizers
    SET status = 'unclaimed',
        claimed_by_profile_id = NULL,
        updated_by = auth.uid()
    WHERE id = p_organizer_id;

    UPDATE public.organizer_claim_requests
    SET admin_notes = COALESCE(admin_notes, p_note)
    WHERE organizer_id = p_organizer_id
      AND status = 'approved';

    RETURN p_organizer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
