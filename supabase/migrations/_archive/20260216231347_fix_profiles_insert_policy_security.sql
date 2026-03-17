-- Fix profiles INSERT policy security vulnerability
-- Previous policy: TO public WITH CHECK (true) - anyone could insert any profile
-- New policy: restrict to authenticated users inserting their own profile + service_role for trigger

DROP POLICY IF EXISTS "Users can insert own profile on signup" ON public.profiles;

-- Authenticated users can only insert their own profile
CREATE POLICY "Users can insert own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK ((select auth.uid()) = id);

-- Service role can insert profiles (for handle_new_user trigger)
CREATE POLICY "Service role can insert profiles"
ON public.profiles
FOR INSERT
TO service_role
WITH CHECK (true);
