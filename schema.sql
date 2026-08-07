-- =========================================================
-- ESQUEMA: Gestión de cotizaciones y encargos
-- Ejecutar completo en Supabase → SQL Editor → New query → Run
-- =========================================================

create extension if not exists pgcrypto;

-- ---------- Roles y estados ----------
do $$ begin
  create type public.user_role as enum ('solicitante', 'cotizador');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.estado_cotizacion as enum
    ('cotizacion', 'pedido', 'en_camino', 'en_tienda', 'entregado');
exception when duplicate_object then null; end $$;

-- ---------- Perfiles (un registro por usuario de auth) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  role public.user_role not null default 'solicitante',
  created_at timestamptz not null default now()
);

-- ---------- Proveedores ----------
create table if not exists public.proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  contacto text,
  telefono text,
  email text,
  notas text,
  created_at timestamptz not null default now()
);

-- ---------- Cotizaciones (encabezado del encargo) ----------
create table if not exists public.cotizaciones (
  id uuid primary key default gen_random_uuid(),
  folio serial,
  titulo text not null,
  solicitante_id uuid references public.profiles(id),
  solicitante_nombre text not null,           -- nombre visible aunque no tenga cuenta
  creado_por uuid references public.profiles(id),
  estado public.estado_cotizacion not null default 'cotizacion',
  notas_generales text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Items de la cotización (productos) ----------
create table if not exists public.cotizacion_items (
  id uuid primary key default gen_random_uuid(),
  cotizacion_id uuid not null references public.cotizaciones(id) on delete cascade,
  proveedor_id uuid references public.proveedores(id),
  producto text not null,
  cantidad numeric not null default 1,
  precio_final numeric,                        -- precio final del producto
  notas text,                                   -- notas de proceso (ej: "lo cotiza el jefe")
  agregado_por uuid references public.profiles(id),
  created_at timestamptz not null default now() -- fecha y hora en que se agregó
);

-- trigger simple para updated_at
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_cotizaciones_updated on public.cotizaciones;
create trigger trg_cotizaciones_updated
before update on public.cotizaciones
for each row execute function public.set_updated_at();

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.proveedores enable row level security;
alter table public.cotizaciones enable row level security;
alter table public.cotizacion_items enable row level security;

-- Cualquier usuario autenticado del equipo puede ver y operar.
-- (Es un equipo pequeño y confiable; se puede endurecer más adelante.)
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (auth.role() = 'authenticated');

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

drop policy if exists "proveedores_all" on public.proveedores;
create policy "proveedores_all" on public.proveedores
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "cotizaciones_all" on public.cotizaciones;
create policy "cotizaciones_all" on public.cotizaciones
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "items_all" on public.cotizacion_items;
create policy "items_all" on public.cotizacion_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- =========================================================
-- PASO FINAL (hacerlo manualmente, ver guía):
-- 1. Crea los usuarios en Authentication → Users → Add user
--    (uno para el solicitante, otro para el cotizador/jefe).
-- 2. Copia el UUID de cada usuario y ejecuta, por cada uno:
--
--    insert into public.profiles (id, nombre, role) values
--    ('PEGA-AQUI-EL-UUID', 'Nombre de la persona', 'solicitante');
--
--    -- y para el jefe/cotizador:
--    insert into public.profiles (id, nombre, role) values
--    ('PEGA-AQUI-EL-UUID', 'Nombre del jefe', 'cotizador');
-- =========================================================
