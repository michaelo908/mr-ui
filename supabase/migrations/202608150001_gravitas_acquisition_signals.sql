-- Extend the append-only Signals contract for the public acquisition layer.
-- Apply to staging first. This migration does not alter or remove existing rows.

alter table public.gravitas_signals
  drop constraint if exists gravitas_signals_category_check;

alter table public.gravitas_signals
  add constraint gravitas_signals_category_check
  check (category in ('acquisition','discovery','analysis','engagement','workflow','purchase'));

alter table public.gravitas_signals
  drop constraint if exists gravitas_signals_surface_check;

alter table public.gravitas_signals
  add constraint gravitas_signals_surface_check
  check (surface in ('acquisition','jump-in','paid','founder','unknown'));
