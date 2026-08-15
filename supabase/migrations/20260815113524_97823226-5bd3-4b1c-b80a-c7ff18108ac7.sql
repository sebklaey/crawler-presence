-- Room images are only ever served through short-lived signed URLs created by
-- the server (service role). Make the deny explicit for every client role.
DROP POLICY IF EXISTS "room images: no direct client read" ON storage.objects;
DROP POLICY IF EXISTS "room images: no direct client insert" ON storage.objects;
DROP POLICY IF EXISTS "room images: no direct client update" ON storage.objects;
DROP POLICY IF EXISTS "room images: no direct client delete" ON storage.objects;

CREATE POLICY "room images: no direct client read"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (false);

CREATE POLICY "room images: no direct client insert"
  ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (false);

CREATE POLICY "room images: no direct client update"
  ON storage.objects FOR UPDATE TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "room images: no direct client delete"
  ON storage.objects FOR DELETE TO anon, authenticated
  USING (false);