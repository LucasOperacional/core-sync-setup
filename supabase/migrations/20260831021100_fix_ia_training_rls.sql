-- Fix RLS policies for ia_training_data to allow authenticated users to manage their own data.
-- The original migration had overlapping/conflicting policies. This cleans them up.

-- Drop existing policies (safe even if they don't exist on some environments)
DO $$ BEGIN
  DROP POLICY IF EXISTS "Admin manage ia_training_data" ON public.ia_training_data;
  DROP POLICY IF EXISTS "Authenticated read ia_training_data" ON public.ia_training_data;
  DROP POLICY IF EXISTS "Authenticated insert ia_training_data" ON public.ia_training_data;
  DROP POLICY IF EXISTS "Owner update ia_training_data" ON public.ia_training_data;
  DROP POLICY IF EXISTS "Owner delete ia_training_data" ON public.ia_training_data;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Admins can do everything
CREATE POLICY "admin_full_access_ia_training"
  ON public.ia_training_data FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'admin'
    )
  );

-- Any authenticated user can SELECT (needed for chat context)
CREATE POLICY "authenticated_select_ia_training"
  ON public.ia_training_data FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Any authenticated user can INSERT their own rows
CREATE POLICY "authenticated_insert_ia_training"
  ON public.ia_training_data FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- Users can UPDATE their own rows
CREATE POLICY "owner_update_ia_training"
  ON public.ia_training_data FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can DELETE their own rows
CREATE POLICY "owner_delete_ia_training"
  ON public.ia_training_data FOR DELETE
  USING (auth.uid() = user_id);
