-- ===========================================================================
-- Licitaciones: devolver el MISMO Excel que llegó, con su diseño
--
-- Ejecutar UNA VEZ en Supabase → SQL Editor. Es seguro correrlo varias veces.
--
-- Al importar, el .xlsx original se guarda en Storage (bucket privado
-- "licitaciones") y se anota en qué fila y columna real está cada renglón.
-- Al descargar se abre ese archivo y solo se escriben las celdas cotizadas.
-- ===========================================================================

-- Ruta del archivo original dentro del bucket: "<id licitación>/original.xlsx"
alter table public.licitaciones add column if not exists archivo_path text;
-- Encabezado del Excel → letra de su columna real: {"PRECIO UNITARIO":"G",...}
alter table public.licitaciones add column if not exists columnas_excel jsonb;
-- Número de fila real del Excel de cada renglón (null = agregado en la app)
alter table public.licitacion_items add column if not exists fila_excel integer;

-- Bucket privado para los Excel originales
insert into storage.buckets (id, name, public)
values ('licitaciones', 'licitaciones', false)
on conflict (id) do nothing;

-- Ambos roles (Cyber y Ocampo) suben y descargan, igual que las tablas.
drop policy if exists "licitaciones_archivos_select" on storage.objects;
create policy "licitaciones_archivos_select" on storage.objects
  for select to authenticated using (bucket_id = 'licitaciones');

drop policy if exists "licitaciones_archivos_insert" on storage.objects;
create policy "licitaciones_archivos_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'licitaciones');

drop policy if exists "licitaciones_archivos_update" on storage.objects;
create policy "licitaciones_archivos_update" on storage.objects
  for update to authenticated using (bucket_id = 'licitaciones') with check (bucket_id = 'licitaciones');
