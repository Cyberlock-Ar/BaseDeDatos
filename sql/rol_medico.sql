-- ============================================================
--  ROL MÉDICO - Actualización para una BD ya existente
--  Ejecuta SOLO este script en el SQL Editor de Supabase
--  (si acabas de crear la BD desde script_completo.sql,
--   este script NO es necesario)
-- ============================================================

-- 1. Ampliar el rol permitido: paciente | admin | medico
alter table public.usuarios drop constraint if exists usuarios_rol_check;
alter table public.usuarios
  add constraint usuarios_rol_check check (rol in ('paciente', 'admin', 'medico'));

-- 2. Función: ¿el usuario actual es médico?
create or replace function public.es_medico()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.usuarios
    where id = auth.uid() and rol = 'medico'
  );
$$;

-- 3. Políticas RLS con el rol médico incluido
--    (usuarios, citas e historias: sí; facturas y auditoría: NO)

drop policy if exists "usuarios_ver" on public.usuarios;
create policy "usuarios_ver" on public.usuarios
  for select using (auth.uid() = id or public.es_admin() or public.es_medico());

drop policy if exists "citas_ver" on public.citas;
create policy "citas_ver" on public.citas
  for select using (auth.uid() = id_usuario or public.es_admin() or public.es_medico());

drop policy if exists "citas_actualizar" on public.citas;
create policy "citas_actualizar" on public.citas
  for update using (auth.uid() = id_usuario or public.es_admin() or public.es_medico());

drop policy if exists "historias_ver" on public.historias_clinicas;
create policy "historias_ver" on public.historias_clinicas
  for select using (auth.uid() = id_usuario or public.es_admin() or public.es_medico());

drop policy if exists "historias_crear_medico" on public.historias_clinicas;
create policy "historias_crear_medico" on public.historias_clinicas
  for insert with check (public.es_medico());

-- ============================================================
--  PARA CONVERTIR A ALGUIEN EN MÉDICO:
--  (desde el panel admin: columna "Rol" de la tabla Usuarios,
--   o manualmente con esta línea)
--
--  update public.usuarios
--  set rol = 'medico'
--  where email = 'correo_del_medico@example.com';
-- ============================================================
