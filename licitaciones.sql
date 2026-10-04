-- ===========================================================================
-- Licitaciones (Cyber y Ocampo)
--
-- Ejecutar UNA VEZ en Supabase → SQL Editor. Es seguro correrlo varias veces.
-- (También está incluido al final de schema.sql.)
--
-- Una licitación viene de un Excel: cada fila del Excel es un renglón
-- (licitacion_items). Las columnas originales se guardan tal cual en `datos`
-- (jsonb), y aparte se guardan las columnas que se van llenando en la app:
-- producto ofrecido, proveedor, precio unitario y notas.
--
-- El proveedor se guarda también como TEXTO (proveedor_nombre) porque Ocampo
-- no puede leer la tabla de proveedores, y aquí sí tiene que verlo.
-- ===========================================================================

do $$ begin
  create type public.estado_licitacion as enum
    ('abierta', 'cotizando', 'enviada', 'adjudicada', 'no_adjudicada');
exception when duplicate_object then null; end $$;

create table if not exists public.licitaciones (
  id uuid primary key default gen_random_uuid(),
  folio serial,
  titulo text not null,
  institucion text not null default '',
  codigo text,
  fecha_limite date,
  estado public.estado_licitacion not null default 'abierta',
  -- Encabezados originales del Excel, en orden: ["Línea","Descripción",...]
  columnas jsonb not null default '[]'::jsonb,
  -- Qué encabezado es la descripción / cantidad / unidad (para totales y búsquedas)
  col_descripcion text,
  col_cantidad text,
  col_unidad text,
  archivo_nombre text,
  notas text,
  creado_por uuid references public.profiles(id),
  creado_por_nombre text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.licitacion_items (
  id uuid primary key default gen_random_uuid(),
  licitacion_id uuid not null references public.licitaciones(id) on delete cascade,
  orden integer not null default 0,
  datos jsonb not null default '{}'::jsonb,
  -- Copia de la descripción y la cantidad del Excel en columnas propias, para
  -- que la lista y las sugerencias no tengan que bajar la fila completa.
  descripcion text,
  cantidad numeric,
  producto_ofrecido text,
  proveedor_id uuid references public.proveedores(id) on delete set null,
  proveedor_nombre text,
  precio_unitario numeric,
  notas text,
  editado_por_nombre text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.licitacion_items add column if not exists descripcion text;
alter table public.licitacion_items add column if not exists cantidad numeric;

create index if not exists idx_licitacion_items_licitacion
  on public.licitacion_items (licitacion_id, orden);
create index if not exists idx_licitaciones_updated_at
  on public.licitaciones (updated_at desc);

drop trigger if exists trg_licitaciones_updated on public.licitaciones;
create trigger trg_licitaciones_updated
before update on public.licitaciones
for each row execute function public.set_updated_at();

drop trigger if exists trg_licitacion_items_updated on public.licitacion_items;
create trigger trg_licitacion_items_updated
before update on public.licitacion_items
for each row execute function public.set_updated_at();

-- Editar un renglón "toca" su licitación, para que la lista muestre el
-- avance actualizado y se ordene por lo último que se trabajó.
create or replace function public.tocar_licitacion_padre()
returns trigger as $$
declare
  lid uuid;
begin
  lid := coalesce(new.licitacion_id, old.licitacion_id);
  if lid is not null then
    update public.licitaciones set updated_at = now() where id = lid;
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql security definer;

drop trigger if exists trg_licitacion_items_tocan on public.licitacion_items;
create trigger trg_licitacion_items_tocan
after insert or update or delete on public.licitacion_items
for each row execute function public.tocar_licitacion_padre();

-- ---------- RLS: ambos roles leen y editan ----------
alter table public.licitaciones enable row level security;
alter table public.licitacion_items enable row level security;

drop policy if exists "licitaciones_all" on public.licitaciones;
create policy "licitaciones_all" on public.licitaciones
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "licitacion_items_all" on public.licitacion_items;
create policy "licitacion_items_all" on public.licitacion_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ---------- Actividad: índice para consultar la caja por mes ----------
-- La pestaña Actividad ahora pide los movimientos de caja de UN mes a la vez
-- (antes solo veía los últimos 100 registros de todo tipo, y los meses
-- anteriores salían incompletos).
create index if not exists idx_actividad_accion_created_at
  on public.actividad (accion, created_at desc);
