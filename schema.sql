-- =========================================================
-- ESQUEMA: Gestión de cotizaciones y encargos (v2)
-- Seguro de volver a correr completo aunque ya tengas la v1 instalada.
-- Ejecutar en Supabase → SQL Editor → New query → Run
-- =========================================================

create extension if not exists pgcrypto;

do $$ begin
  create type public.user_role as enum ('solicitante', 'cotizador');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.estado_cotizacion as enum
    ('cotizacion', 'pedido', 'en_camino', 'en_tienda', 'entregado');
exception when duplicate_object then null; end $$;

-- ---------- Perfiles (uno por LOGIN; aquí solo hay 2: Cyber y Ocampo) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null,
  role public.user_role not null default 'solicitante',
  created_at timestamptz not null default now()
);

-- ---------- Proveedores (solo Cyber los ve/gestiona) ----------
create table if not exists public.proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  contacto text,
  telefono text,
  email text,
  notas text,
  created_at timestamptz not null default now()
);

-- ---------- Trabajadores de Cyber (para saber quién cotizó cada producto) ----------
create table if not exists public.trabajadores_cyber (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Trabajadores/personas de Ocampo (quién solicita cada cotización) ----------
create table if not exists public.trabajadores_ocampo (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Cotizaciones (encabezado del encargo) ----------
create table if not exists public.cotizaciones (
  id uuid primary key default gen_random_uuid(),
  folio serial,
  titulo text not null,
  escuela text not null default '',
  solicitante_trabajador_id uuid references public.trabajadores_ocampo(id),
  solicitante_nombre text not null default '',
  creado_por uuid references public.profiles(id),
  estado public.estado_cotizacion not null default 'cotizacion',
  notas_generales text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- columnas nuevas si ya tenías la tabla de la v1:
alter table public.cotizaciones add column if not exists escuela text not null default '';
alter table public.cotizaciones add column if not exists solicitante_trabajador_id uuid references public.trabajadores_ocampo(id);

-- ---------- Items de la cotización (productos) ----------
create table if not exists public.cotizacion_items (
  id uuid primary key default gen_random_uuid(),
  cotizacion_id uuid not null references public.cotizaciones(id) on delete cascade,
  proveedor_id uuid references public.proveedores(id),
  producto text not null,
  cantidad numeric not null default 1,
  precio_final numeric,
  notas text,
  cotizado_por_trabajador_id uuid references public.trabajadores_cyber(id),
  agregado_por uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.cotizacion_items add column if not exists cotizado_por_trabajador_id uuid references public.trabajadores_cyber(id);

-- ---------- Lista de productos faltantes en tienda (solo Cyber) ----------
create table if not exists public.productos_faltantes (
  id uuid primary key default gen_random_uuid(),
  producto text not null,
  notas text,
  resuelto boolean not null default false,
  creado_por uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- ---------- Bitácora de actividad (control: quién hizo qué) ----------
create table if not exists public.actividad (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id),
  profile_role public.user_role,
  trabajador_nombre text,
  accion text not null,
  detalle text,
  created_at timestamptz not null default now()
);

-- ---------- updated_at automático ----------
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

-- ---------- Helper: rol del usuario autenticado ----------
create or replace function public.has_role(r public.user_role)
returns boolean as $$
  select role = r from public.profiles where id = auth.uid();
$$ language sql security definer stable;

-- ---------- Reglas de negocio por rol, a nivel de columna ----------
-- Ocampo (solicitante) SOLO puede tocar producto y cantidad de un item.
-- Cyber (cotizador) puede tocar todo EXCEPTO cantidad.
create or replace function public.check_item_update()
returns trigger as $$
declare
  urole public.user_role;
begin
  select role into urole from public.profiles where id = auth.uid();
  if urole = 'solicitante' then
    if new.proveedor_id is distinct from old.proveedor_id
       or new.precio_final is distinct from old.precio_final
       or new.notas is distinct from old.notas
       or new.cotizado_por_trabajador_id is distinct from old.cotizado_por_trabajador_id then
      raise exception 'Ocampo no puede editar proveedor, precio, notas o quién cotizó';
    end if;
  elsif urole = 'cotizador' then
    if new.cantidad is distinct from old.cantidad then
      raise exception 'Cyber no puede editar la cantidad';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_check_item_update on public.cotizacion_items;
create trigger trg_check_item_update
before update on public.cotizacion_items
for each row execute function public.check_item_update();

-- Solo Cyber (cotizador) puede cambiar el estado del encargo.
create or replace function public.check_cotizacion_update()
returns trigger as $$
declare
  urole public.user_role;
begin
  select role into urole from public.profiles where id = auth.uid();
  if urole = 'solicitante' and new.estado is distinct from old.estado then
    raise exception 'Solo Cyber puede cambiar el estado';
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_check_cotizacion_update on public.cotizaciones;
create trigger trg_check_cotizacion_update
before update on public.cotizaciones
for each row execute function public.check_cotizacion_update();

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.proveedores enable row level security;
alter table public.trabajadores_cyber enable row level security;
alter table public.trabajadores_ocampo enable row level security;
alter table public.cotizaciones enable row level security;
alter table public.cotizacion_items enable row level security;
alter table public.productos_faltantes enable row level security;
alter table public.actividad enable row level security;

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (auth.role() = 'authenticated');
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- Nadie puede cambiarse el rol a sí mismo (ni por error ni a propósito),
-- ni siquiera llamando la API directamente. Solo se puede cambiar un rol
-- corriendo SQL a mano: "alter table public.profiles disable trigger
-- trg_block_role_change;" -> update -> "...enable trigger ...".
create or replace function public.block_role_change()
returns trigger as $$
begin
  if new.role is distinct from old.role then
    raise exception 'No se puede cambiar el rol desde la aplicación.';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_block_role_change on public.profiles;
create trigger trg_block_role_change
before update on public.profiles
for each row execute function public.block_role_change();

-- Proveedores: SOLO Cyber (cotizador) puede ver y gestionar.
drop policy if exists "proveedores_all" on public.proveedores;
drop policy if exists "proveedores_select" on public.proveedores;
drop policy if exists "proveedores_write" on public.proveedores;
create policy "proveedores_select" on public.proveedores
  for select using (public.has_role('cotizador'));
create policy "proveedores_write" on public.proveedores
  for all using (public.has_role('cotizador')) with check (public.has_role('cotizador'));

-- Trabajadores de Cyber: visibles para ambos, solo Cyber los administra.
drop policy if exists "trab_cyber_select" on public.trabajadores_cyber;
create policy "trab_cyber_select" on public.trabajadores_cyber
  for select using (auth.role() = 'authenticated');
drop policy if exists "trab_cyber_write" on public.trabajadores_cyber;
create policy "trab_cyber_write" on public.trabajadores_cyber
  for all using (public.has_role('cotizador')) with check (public.has_role('cotizador'));

-- Trabajadores de Ocampo: visibles para ambos, solo Ocampo los administra.
drop policy if exists "trab_ocampo_select" on public.trabajadores_ocampo;
create policy "trab_ocampo_select" on public.trabajadores_ocampo
  for select using (auth.role() = 'authenticated');
drop policy if exists "trab_ocampo_write" on public.trabajadores_ocampo;
create policy "trab_ocampo_write" on public.trabajadores_ocampo
  for all using (public.has_role('solicitante')) with check (public.has_role('solicitante'));

-- Cotizaciones e items: ambos roles leen/crean; las reglas de columna van en los triggers de arriba.
drop policy if exists "cotizaciones_all" on public.cotizaciones;
create policy "cotizaciones_all" on public.cotizaciones
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "items_all" on public.cotizacion_items;
create policy "items_all" on public.cotizacion_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Faltantes en tienda: SOLO Cyber.
drop policy if exists "faltantes_all" on public.productos_faltantes;
create policy "faltantes_all" on public.productos_faltantes
  for all using (public.has_role('cotizador')) with check (public.has_role('cotizador'));

-- Bitácora: ambos roles pueden registrar acciones, solo Cyber la lee.
drop policy if exists "actividad_insert" on public.actividad;
create policy "actividad_insert" on public.actividad
  for insert with check (auth.role() = 'authenticated');
drop policy if exists "actividad_select" on public.actividad;
create policy "actividad_select" on public.actividad
  for select using (public.has_role('cotizador'));

-- =========================================================
-- PASO FINAL (manual, ver guía):
-- 1. Crea 2 usuarios en Authentication → Users → Add user.
--    La app pide solo "usuario" (sin correo real), pero Supabase Auth
--    necesita un email internamente, así que usa un dominio falso que
--    nadie usa para recibir correo, por ejemplo:
--    - cyber@internal.local     (usuario para iniciar sesión: "cyber")
--    - ocampo@internal.local    (usuario para iniciar sesión: "ocampo")
--    Asegúrate de marcar "Auto Confirm User" al crearlos.
-- 2. Copia el UUID de cada uno y ejecuta:
--
--    insert into public.profiles (id, nombre, role) values
--    ('0a116699-4547-4796-bcc5-3dc52d2352ff', 'Cyber', 'cotizador');
--
--    insert into public.profiles (id, nombre, role) values
--    ('4b8d5aed-69e3-41e1-bd21-c02f1cdebfa3', 'Ocampo', 'solicitante');
--
-- 3. (Opcional) Agrega algunos trabajadores de cada lado, esto también
--    se puede hacer luego desde la app en la pestaña "Equipo":
--
--    insert into public.trabajadores_cyber (nombre) values ('Juan Pérez');
--    insert into public.trabajadores_ocampo (nombre) values ('María Ocampo');
-- =========================================================
