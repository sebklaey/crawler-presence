ALTER TABLE public.publish_intents RENAME COLUMN stripe_customer_id TO billing_customer_id;
ALTER TABLE public.publish_intents RENAME COLUMN stripe_subscription_id TO billing_subscription_id;
ALTER TABLE public.publish_intents RENAME COLUMN stripe_checkout_id TO billing_checkout_id;
ALTER TABLE public.published_presences RENAME COLUMN stripe_customer_id TO billing_customer_id;
ALTER TABLE public.published_presences RENAME COLUMN stripe_subscription_id TO billing_subscription_id;