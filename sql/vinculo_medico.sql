-- ============================================================
--  VINCULO: CUENTA DE LOGIN DEL MÉDICO <-> FICHA DE ODONTÓLOGO
--  Ejecutar en: Supabase > SQL Editor > New query > Run
--
--  ¿Para qué? Para que cada médico solo vea SUS citas,
--  sus estadísticas y sus próximas citas en medico.html.
-- ============================================================

-- 1. Columna que liga la ficha del odontólogo con su cuenta
alter table public.odontologos
  add column if not exists id_usuario uuid
  references public.usuarios(id) on delete set null;

-- 2. Índice para buscar la ficha del médico rápidamente
create index if not exists idx_odontologos_usuario
  on public.odontologos(id_usuario);

-- ============================================================
--  LISTO. Luego ve al panel ADMIN > Odontólogos y usa la
--  columna "Cuenta" para vincular cada ficha con la cuenta
--  (rol médico) del doctor.
--
--  Vincular desde SQL es opcional:
--  update public.odontologos
--  set id_usuario = (
--    select id from public.usuarios where email = 'doctor@ejemplo.com'
--  )
--  where nombre = 'Dra. Ana Ríos';
-- ============================================================
