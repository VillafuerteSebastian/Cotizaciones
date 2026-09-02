-- ===========================================================================
-- Optimización de egreso (Supabase plan gratuito)
--
-- Ejecutar UNA VEZ en Supabase → SQL Editor. Es seguro correrlo varias veces.
--
-- Qué hace:
--   1. Índices para que la consulta de "firma" (¿cambió algo?) sea instantánea.
--   2. Un trigger para que al agregar/editar/borrar un PRODUCTO se actualice
--      la fecha `updated_at` de su cotización. Sin esto, la app no se entera
--      de que un producto cambió y el tablero de la otra persona se quedaría
--      con el total viejo.
-- ===========================================================================

-- ---------- 1. Índices ----------
create index if not exists idx_cotizaciones_updated_at
  on public.cotizaciones (updated_at desc);

create index if not exists idx_cotizaciones_created_at
  on public.cotizaciones (created_at desc);

create index if not exists idx_cotizacion_items_cotizacion
  on public.cotizacion_items (cotizacion_id);

create index if not exists idx_apartados_updated_at
  on public.apartados (updated_at desc);

create index if not exists idx_actividad_created_at
  on public.actividad (created_at desc);


-- ---------- 2. Los cambios en productos "tocan" su cotización ----------
create or replace function public.tocar_cotizacion_padre()
returns trigger as $$
declare
  cid uuid;
begin
  cid := coalesce(new.cotizacion_id, old.cotizacion_id);
  if cid is not null then
    update public.cotizaciones set updated_at = now() where id = cid;
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql security definer;

drop trigger if exists trg_items_tocan_cotizacion on public.cotizacion_items;
create trigger trg_items_tocan_cotizacion
after insert or update or delete on public.cotizacion_items
for each row execute function public.tocar_cotizacion_padre();


-- ---------- 3. Saber si hay foto SIN descargar la foto ----------
-- Las fotos se guardan como texto base64 dentro de la propia tabla, así que
-- pedir `imagen` cuesta decenas de KB por producto. Estas dos columnas son
-- un simple booleano calculado por Postgres: la app pregunta "¿hay foto?"
-- y solo descarga la imagen si alguien hace clic en "Ver foto".
alter table public.cotizacion_items
  add column if not exists tiene_imagen boolean
  generated always as (imagen is not null) stored;

alter table public.cotizaciones
  add column if not exists tiene_imagen_notas boolean
  generated always as (imagen_notas is not null) stored;
