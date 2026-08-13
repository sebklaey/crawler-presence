CREATE TABLE public.billing_customers (
  customer_id TEXT PRIMARY KEY,
  email TEXT,
  environment TEXT NOT NULL DEFAULT 'live',
  status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.billing_subscriptions (
  subscription_id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  status TEXT NOT NULL,
  price_id TEXT,
  product_id TEXT,
  plan TEXT,
  environment TEXT NOT NULL DEFAULT 'live',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  scheduled_change_action TEXT,
  scheduled_change_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_billing_subscriptions_customer ON public.billing_subscriptions(customer_id);

GRANT ALL ON public.billing_customers TO service_role;
GRANT ALL ON public.billing_subscriptions TO service_role;

ALTER TABLE public.billing_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;