
DROP TABLE IF EXISTS public.room_message_reports, public.room_messages, public.room_memberships, public.room_rooms, public.room_topic_aliases, public.room_topics, public.room_identities, public.room_rate_events CASCADE;
DROP FUNCTION IF EXISTS public.room_join_topic(text,text,text);
DROP FUNCTION IF EXISTS public.room_cleanup_expired();
DROP FUNCTION IF EXISTS public.room_enforce_capacity();

CREATE TABLE public.topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  display_name text NOT NULL,
  description text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.topics TO service_role;
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.topic_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  normalized_alias text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.topic_aliases TO service_role;
ALTER TABLE public.topic_aliases ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  room_number integer NOT NULL,
  capacity integer NOT NULL DEFAULT 5,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rooms_topic_number_unique UNIQUE (topic_id, room_number),
  CONSTRAINT rooms_capacity_check CHECK (capacity = 5),
  CONSTRAINT rooms_status_check CHECK (status IN ('active', 'closed'))
);
GRANT ALL ON public.rooms TO service_role;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  subject_hash text NOT NULL,
  alias text NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_read_message_id bigint,
  left_at timestamptz
);
GRANT ALL ON public.memberships TO service_role;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX memberships_active_unique
  ON public.memberships (subject_hash, topic_id) WHERE left_at IS NULL;
CREATE INDEX memberships_room_active_idx
  ON public.memberships (room_id) WHERE left_at IS NULL;
CREATE INDEX memberships_subject_idx ON public.memberships (subject_hash);

CREATE TABLE public.messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL REFERENCES public.memberships(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX messages_room_id_idx ON public.messages (room_id, id);
CREATE INDEX messages_expires_at_idx ON public.messages (expires_at);

CREATE TABLE public.message_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id bigint REFERENCES public.messages(id) ON DELETE CASCADE,
  reporter_membership_id uuid NOT NULL REFERENCES public.memberships(id) ON DELETE CASCADE,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT message_reports_unique UNIQUE (message_id, reporter_membership_id),
  CONSTRAINT message_reports_reason_check CHECK (
    reason IN ('spam','harassment','hate','sexual_content','violence','personal_data','other')
  )
);
GRANT ALL ON public.message_reports TO service_role;
ALTER TABLE public.message_reports ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.rate_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subject_hash text NOT NULL,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.rate_events TO service_role;
ALTER TABLE public.rate_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX rate_events_lookup_idx ON public.rate_events (subject_hash, action, created_at DESC);

CREATE OR REPLACE FUNCTION public.enforce_room_capacity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  active_count integer;
  room_capacity integer;
BEGIN
  IF NEW.left_at IS NOT NULL THEN RETURN NEW; END IF;
  SELECT capacity INTO room_capacity FROM public.rooms WHERE id = NEW.room_id;
  SELECT count(*) INTO active_count FROM public.memberships
   WHERE room_id = NEW.room_id AND left_at IS NULL AND id <> NEW.id;
  IF active_count >= room_capacity THEN RAISE EXCEPTION 'ROOM_FULL'; END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER memberships_capacity_guard
  BEFORE INSERT OR UPDATE ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.enforce_room_capacity();

CREATE OR REPLACE FUNCTION public.join_topic_room(
  p_subject_hash text, p_topic_slug text, p_alias text
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_topic public.topics%ROWTYPE;
  v_room public.rooms%ROWTYPE;
  v_membership public.memberships%ROWTYPE;
  v_joined_now boolean := false;
  v_next_number integer;
  v_member_count integer;
BEGIN
  SELECT * INTO v_topic FROM public.topics WHERE slug = p_topic_slug AND enabled;
  IF NOT FOUND THEN RETURN json_build_object('error', 'TOPIC_NOT_FOUND'); END IF;

  SELECT * INTO v_membership FROM public.memberships
   WHERE subject_hash = p_subject_hash AND topic_id = v_topic.id AND left_at IS NULL;

  IF NOT FOUND THEN
    PERFORM pg_advisory_xact_lock(hashtext('room_join:' || v_topic.id::text));
    SELECT * INTO v_membership FROM public.memberships
     WHERE subject_hash = p_subject_hash AND topic_id = v_topic.id AND left_at IS NULL;
    IF NOT FOUND THEN
      SELECT r.* INTO v_room FROM public.rooms r
       WHERE r.topic_id = v_topic.id AND r.status = 'active'
         AND (SELECT count(*) FROM public.memberships m WHERE m.room_id = r.id AND m.left_at IS NULL) < r.capacity
       ORDER BY r.room_number ASC LIMIT 1 FOR UPDATE OF r;
      IF NOT FOUND THEN
        SELECT COALESCE(max(room_number), 0) + 1 INTO v_next_number FROM public.rooms WHERE topic_id = v_topic.id;
        INSERT INTO public.rooms (topic_id, room_number) VALUES (v_topic.id, v_next_number) RETURNING * INTO v_room;
      END IF;
      INSERT INTO public.memberships (topic_id, room_id, subject_hash, alias)
      VALUES (v_topic.id, v_room.id, p_subject_hash, p_alias) RETURNING * INTO v_membership;
      v_joined_now := true;
    END IF;
  END IF;

  IF v_room.id IS NULL THEN
    SELECT * INTO v_room FROM public.rooms WHERE id = v_membership.room_id;
  END IF;

  SELECT count(*) INTO v_member_count FROM public.memberships WHERE room_id = v_room.id AND left_at IS NULL;
  UPDATE public.memberships SET last_seen_at = now() WHERE id = v_membership.id;

  RETURN json_build_object(
    'topic_slug', v_topic.slug,
    'topic_display_name', v_topic.display_name,
    'room_id', v_room.id,
    'room_number', v_room.room_number,
    'capacity', v_room.capacity,
    'member_count', v_member_count,
    'membership_id', v_membership.id,
    'alias', v_membership.alias,
    'joined_at', v_membership.joined_at,
    'last_read_message_id', v_membership.last_read_message_id,
    'joined_now', v_joined_now
  );
END; $$;

CREATE OR REPLACE FUNCTION public.cleanup_expired()
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_messages integer; v_rooms integer; v_memberships integer; v_rate integer;
BEGIN
  DELETE FROM public.messages WHERE expires_at <= now();
  GET DIAGNOSTICS v_messages = ROW_COUNT;
  DELETE FROM public.rate_events WHERE created_at < now() - interval '2 hours';
  GET DIAGNOSTICS v_rate = ROW_COUNT;
  UPDATE public.memberships
     SET alias = 'Ehemalige Person', subject_hash = 'anonymized:' || id::text
   WHERE left_at IS NOT NULL AND left_at < now() - interval '7 days'
     AND subject_hash NOT LIKE 'anonymized:%';
  GET DIAGNOSTICS v_memberships = ROW_COUNT;
  DELETE FROM public.rooms r
   WHERE r.created_at < now() - interval '24 hours'
     AND NOT EXISTS (SELECT 1 FROM public.memberships m WHERE m.room_id = r.id AND m.left_at IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.messages msg WHERE msg.room_id = r.id);
  GET DIAGNOSTICS v_rooms = ROW_COUNT;
  RETURN json_build_object('deleted_messages', v_messages, 'deleted_rooms', v_rooms,
    'anonymized_memberships', v_memberships, 'deleted_rate_events', v_rate);
END; $$;

INSERT INTO public.topics (slug, display_name, description) VALUES
  ('ai', 'AI', 'Künstliche Intelligenz, Modelle und AI-Produkte'),
  ('art', 'Art', 'Kunst, Illustration, Design und Kreativität'),
  ('science', 'Science', 'Wissenschaft, Forschung und Entdeckungen'),
  ('tech', 'Tech', 'Technologie, Software und Hardware'),
  ('music', 'Music', 'Musik, Produktion und Instrumente'),
  ('gaming', 'Gaming', 'Games, Entwicklung und Gaming-Kultur'),
  ('life', 'Life', 'Alltag, persönliche Interessen und lockerer Austausch');

INSERT INTO public.topic_aliases (topic_id, normalized_alias)
SELECT t.id, a.alias FROM (VALUES
  ('ai','ki'), ('ai','künstliche intelligenz'), ('ai','artificial intelligence'),
  ('art','kunst'), ('science','sience'), ('science','wissenschaft'),
  ('tech','technology'), ('tech','technologie'), ('music','musik'),
  ('gaming','spiele'), ('life','leben')
) AS a(slug, alias) JOIN public.topics t ON t.slug = a.slug;

REVOKE EXECUTE ON FUNCTION public.join_topic_room(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_room_capacity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_topic_room(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_expired() TO service_role;

CREATE TABLE public.image_messages (
  id bigserial PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  sender_membership_id uuid NOT NULL REFERENCES public.memberships(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp')),
  file_size integer NOT NULL DEFAULT 0 CHECK (file_size >= 0 AND file_size <= 10485760),
  width integer,
  height integer,
  alt_text text,
  checksum text,
  uploaded boolean NOT NULL DEFAULT false,
  moderation_status text NOT NULL DEFAULT 'pending'
    CHECK (moderation_status IN ('pending','approved','rejected','failed')),
  moderation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours'
);
CREATE INDEX image_messages_room_idx ON public.image_messages (room_id, id);
CREATE INDEX image_messages_sender_idx ON public.image_messages (sender_membership_id);
CREATE INDEX image_messages_status_idx ON public.image_messages (moderation_status, created_at);
CREATE UNIQUE INDEX image_messages_room_checksum_idx
  ON public.image_messages (room_id, checksum)
  WHERE checksum IS NOT NULL AND moderation_status <> 'rejected';
GRANT ALL ON public.image_messages TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.image_messages_id_seq TO service_role;
ALTER TABLE public.image_messages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.memberships ADD COLUMN last_read_image_id bigint;

ALTER TABLE public.message_reports
  ADD COLUMN image_message_id bigint REFERENCES public.image_messages(id) ON DELETE CASCADE;
ALTER TABLE public.message_reports
  ADD CONSTRAINT message_reports_target_check
  CHECK (num_nonnulls(message_id, image_message_id) = 1);
CREATE UNIQUE INDEX message_reports_image_unique_idx
  ON public.message_reports (image_message_id, reporter_membership_id)
  WHERE image_message_id IS NOT NULL;

ALTER TABLE public.rate_events DROP CONSTRAINT IF EXISTS rate_events_action_check;
ALTER TABLE public.rate_events
  ADD CONSTRAINT rate_events_action_check
  CHECK (action IN ('message','join','report','upload'));

CREATE OR REPLACE FUNCTION public.enforce_text_retention(p_room_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('room_text_retention:' || p_room_id::text));
  DELETE FROM public.messages m
   WHERE m.room_id = p_room_id
     AND m.id NOT IN (
       SELECT id FROM public.messages WHERE room_id = p_room_id
        ORDER BY created_at DESC, id DESC LIMIT 7);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $$;

CREATE OR REPLACE FUNCTION public.enforce_image_retention(p_room_id uuid)
RETURNS TABLE (storage_path text) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('room_image_retention:' || p_room_id::text));
  RETURN QUERY
  DELETE FROM public.image_messages i
   WHERE i.room_id = p_room_id AND i.moderation_status = 'approved'
     AND i.id NOT IN (
       SELECT id FROM public.image_messages
        WHERE room_id = p_room_id AND moderation_status = 'approved'
        ORDER BY created_at DESC, id DESC LIMIT 3)
  RETURNING i.storage_path;
END; $$;

CREATE OR REPLACE FUNCTION public.purge_dead_images()
RETURNS TABLE (storage_path text) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RETURN QUERY
  DELETE FROM public.image_messages i
   WHERE i.expires_at <= now()
      OR i.moderation_status IN ('rejected', 'failed')
      OR (i.moderation_status = 'pending' AND i.created_at < now() - interval '30 minutes')
  RETURNING i.storage_path;
END; $$;

CREATE OR REPLACE FUNCTION public.enforce_all_retention()
RETURNS TABLE (storage_path text) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_room record;
BEGIN
  FOR v_room IN SELECT id FROM public.rooms LOOP
    PERFORM public.enforce_text_retention(v_room.id);
    RETURN QUERY SELECT * FROM public.enforce_image_retention(v_room.id);
  END LOOP;
END; $$;

REVOKE ALL ON FUNCTION public.enforce_text_retention(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_image_retention(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_dead_images() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_all_retention() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_text_retention(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_image_retention(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_dead_images() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_all_retention() TO service_role;
