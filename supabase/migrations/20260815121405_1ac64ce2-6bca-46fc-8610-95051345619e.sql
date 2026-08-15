update public.publish_intents pi
set session_token = pp.session_token
from public.published_presences pp
where pi.presence_slug = pp.slug
  and pi.session_token is null
  and pp.session_token is not null;