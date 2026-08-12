ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS thread_id uuid,
  ADD COLUMN IF NOT EXISTS is_follow_up boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notified_status text,
  ADD COLUMN IF NOT EXISTS notified_at timestamptz;

CREATE INDEX IF NOT EXISTS support_tickets_email_idx ON public.support_tickets (email, created_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_updated_idx ON public.support_tickets (updated_at DESC);

UPDATE public.support_tickets
   SET thread_id = COALESCE(thread_id, id),
       notified_status = COALESCE(notified_status, status),
       notified_at = COALESCE(notified_at, updated_at)
 WHERE thread_id IS NULL OR notified_status IS NULL;