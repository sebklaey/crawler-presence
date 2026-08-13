update public.published_presences
set core = jsonb_set(core, '{name}', to_jsonb('Ich bin Sebastian Kläy, Schweizer Schauspieler, Performance-Künstler und Creative Concept Developer für AIs.'::text)),
    files = replace(files::text, 'Ich bin Sebastian Kläy, Schweizer Schauspieler, Performance-Künstler und Creative Concept Developer für AIs, mit Basis i', 'Ich bin Sebastian Kläy, Schweizer Schauspieler, Performance-Künstler und Creative Concept Developer für AIs.')::jsonb,
    updated_at = now()
where slug = 'presence-89f4d5';