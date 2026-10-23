-- ============================================================
--  CENTRO ODONTOLICO SONRISA SANA - SCRIPT COMPLETO (un solo archivo)
--  Contiene: esquema + roles (paciente/admin/medico) + datos + RLS + auditoria
--  Ejecutar en el SQL Editor de Supabase de arriba a abajo
-- ============================================================

-- ============================================================
--  CENTRO ODONTOLÓGICO "SONRISA SANA" - Script para Supabase
--  PostgreSQL (Supabase SQL Editor)
-- ============================================================
--
--  CÓMO USARLO:
--  1. Crea un proyecto gratis en https://supabase.com
--  2. Entra a "SQL Editor" y pega TODO este script.
--  3. Presiona "Run".
--  4. En Authentication > Settings, desactiva "Confirm email"
--     (para que el registro funcione sin verificar correos en la demo).
--  5. Regístrate desde la página con el correo que quieras como ADMIN
--     y ejecuta esta línea para convertirte en administrador:
--
--     update public.usuarios
--     set rol = 'admin'
--     where id = (select id from auth.users where email = 'TU_CORREO@example.com');
--
-- ============================================================


-- ----------------------------------------------------------
-- 1. TABLA usuarios (pacientes y administradores)
--    Ligada a auth.users de Supabase (login con correo/clave)
-- ----------------------------------------------------------
create table public.usuarios (
  id         uuid primary key references auth.users(id) on delete cascade,
  nombre     text not null,
  email      text,
  telefono   text,
  direccion  text,
  edad       int,
  genero     text,
  rol        text not null default 'paciente' check (rol in ('paciente', 'admin', 'medico')),
  creado_en  timestamptz default now()
);

-- ----------------------------------------------------------
-- 2. TABLA odontologos
-- ----------------------------------------------------------
create table public.odontologos (
  id           serial primary key,
  nombre       text not null,
  especialidad text not null,
  telefono     text
);

-- ----------------------------------------------------------
-- 3. TABLA citas
-- ----------------------------------------------------------
create table public.citas (
  id            serial primary key,
  id_usuario    uuid not null references public.usuarios(id) on delete cascade,
  id_odontologo int  not null references public.odontologos(id),
  fecha         timestamptz not null,
  motivo        text,
  estado        text not null default 'pendiente'
                check (estado in ('pendiente', 'confirmada', 'atendida', 'cancelada')),
  creado_en     timestamptz default now()
);

-- ----------------------------------------------------------
-- 4. TABLA historias_clinicas
-- ----------------------------------------------------------
create table public.historias_clinicas (
  id           serial primary key,
  id_usuario   uuid not null references public.usuarios(id) on delete cascade,
  id_cita      int references public.citas(id) on delete set null,
  fecha        timestamptz not null default now(),
  diagnostico  text not null,
  tratamiento  text,
  notas        text
);

-- ----------------------------------------------------------
-- 5. TABLA facturas
--    numeric(10,2) en vez de float: exacto con dinero
-- ----------------------------------------------------------
create table public.facturas (
  id       serial primary key,
  id_cita  int not null references public.citas(id) on delete cascade,
  fecha    timestamptz not null default now(),
  detalle  text,
  total    numeric(10,2) not null default 0
);

-- ----------------------------------------------------------
-- 6. Índices sobre claves foráneas (rendimiento en JOIN)
-- ----------------------------------------------------------
create index idx_citas_usuario    on public.citas(id_usuario);
create index idx_citas_odontologo on public.citas(id_odontologo);
create index idx_hist_usuario     on public.historias_clinicas(id_usuario);
create index idx_facturas_cita    on public.facturas(id_cita);

-- ----------------------------------------------------------
-- 7. Trigger: al registrarse un usuario se crea su fila en
--    usuarios automáticamente (los datos vienen del registro)
-- ----------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.usuarios (id, nombre, email, telefono, direccion, edad, genero, rol)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', new.email),
    new.email,
    new.raw_user_meta_data ->> 'telefono',
    new.raw_user_meta_data ->> 'direccion',
    nullif(new.raw_user_meta_data ->> 'edad', '')::int,
    new.raw_user_meta_data ->> 'genero',
    'paciente'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------
-- 8. Función auxiliar: ¿el usuario actual es admin?
-- ----------------------------------------------------------
create or replace function public.es_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.usuarios
    where id = auth.uid() and rol = 'admin'
  );
$$;

-- ¿El usuario actual es médico? (ve pacientes, citas e historias, pero NO facturas)
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

-- ----------------------------------------------------------
-- 9. ROW LEVEL SECURITY (seguridad a nivel de fila)
-- ----------------------------------------------------------
alter table public.usuarios          enable row level security;
alter table public.odontologos       enable row level security;
alter table public.citas             enable row level security;
alter table public.historias_clinicas enable row level security;
alter table public.facturas          enable row level security;

-- usuarios: cada uno ve/edita su perfil; el admin ve todos;
-- el médico solo consulta los datos de los pacientes
create policy "usuarios_ver" on public.usuarios
  for select using (auth.uid() = id or public.es_admin() or public.es_medico());

create policy "usuarios_insertar" on public.usuarios
  for insert with check (auth.uid() = id);

create policy "usuarios_actualizar" on public.usuarios
  for update using (auth.uid() = id or public.es_admin());

create policy "usuarios_borrar" on public.usuarios
  for delete using (public.es_admin());

-- odontologos: cualquiera puede verlos (se muestran en la portada);
-- solo el admin los gestiona
create policy "odontologos_ver" on public.odontologos
  for select using (true);

create policy "odontologos_gestionar" on public.odontologos
  for all using (public.es_admin()) with check (public.es_admin());

-- citas: el paciente ve/crea/actualiza las suyas; el admin todas;
-- el médico ve las suyas para atenderlas (sin eliminar)
create policy "citas_ver" on public.citas
  for select using (auth.uid() = id_usuario or public.es_admin() or public.es_medico());

create policy "citas_crear" on public.citas
  for insert with check (auth.uid() = id_usuario or public.es_admin());

create policy "citas_actualizar" on public.citas
  for update using (auth.uid() = id_usuario or public.es_admin() or public.es_medico());

create policy "citas_borrar" on public.citas
  for delete using (auth.uid() = id_usuario or public.es_admin());

-- historias clinicas: el paciente solo consulta; el admin gestiona;
-- el médico consulta y registra (no borra)
create policy "historias_ver" on public.historias_clinicas
  for select using (auth.uid() = id_usuario or public.es_admin() or public.es_medico());

create policy "historias_gestionar" on public.historias_clinicas
  for all using (public.es_admin()) with check (public.es_admin());

create policy "historias_crear_medico" on public.historias_clinicas
  for insert with check (public.es_medico());

-- facturas: el paciente ve las de sus citas; el admin todas
create policy "facturas_ver" on public.facturas
  for select using (
    public.es_admin()
    or exists (
      select 1 from public.citas c
      where c.id = facturas.id_cita and c.id_usuario = auth.uid()
    )
  );

create policy "facturas_gestionar" on public.facturas
  for all using (public.es_admin()) with check (public.es_admin());

-- ----------------------------------------------------------
-- 10. DATOS DE EJEMPLO: odontólogos
-- ----------------------------------------------------------
insert into public.odontologos (nombre, especialidad, telefono) values
  ('Dra. Ana Ríos',      'Ortodoncia',        '3124567890'),
  ('Dr. Carlos Pérez',   'Endodoncia',        '3119876543'),
  ('Dra. Lucía Gómez',   'Periodoncia',       '3102233445'),
  ('Dr. Juan Rodríguez', 'Odontopediatría',   '3145566778'),
  ('Dra. María Torres',  'Prostodoncia',      '3178889990'),
  ('Dr. Pedro Ramírez',  'Cirugía Maxilofacial', '3182223334');

-- ----------------------------------------------------------
-- LISTO. Ahora ve a js/config.js y coloca tu URL y clave anónima
-- ----------------------------------------------------------


-- ============================================================
-- SEGUNDA PARTE: AUDITORIA
-- ============================================================

-- ============================================================
--  AUDITORÍA - Registro de acciones sobre la base de datos
--  Ejecuta SOLO este script en el SQL Editor de Supabase
-- ============================================================

-- 1. Tabla de auditoría
create table public.auditoria (
  id             serial primary key,
  usuario_id     uuid,
  usuario_nombre text,
  tabla          text not null,
  accion         text not null check (accion in ('INSERT', 'UPDATE', 'DELETE')),
  registro_id    text,
  detalle        jsonb,
  fecha          timestamptz default now()
);

create index idx_auditoria_fecha on public.auditoria(fecha desc);

-- 2. Seguridad: solo el admin puede consultar
alter table public.auditoria enable row level security;

create policy "auditoria_solo_admin" on public.auditoria
  for select using (public.es_admin());

-- 3. Función trigger: guarda quién hizo qué y cuándo
create or replace function public.fn_auditar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id   uuid := auth.uid();
  v_nom  text;
begin
  select nombre into v_nom from public.usuarios where id = v_id;

  if TG_OP = 'INSERT' then
    insert into public.auditoria (usuario_id, usuario_nombre, tabla, accion, registro_id, detalle)
    values (v_id, coalesce(v_nom, 'desconocido'), TG_TABLE_NAME, 'INSERT', NEW.id::text, to_jsonb(NEW));
    return NEW;
  elsif TG_OP = 'UPDATE' then
    insert into public.auditoria (usuario_id, usuario_nombre, tabla, accion, registro_id, detalle)
    values (v_id, coalesce(v_nom, 'desconocido'), TG_TABLE_NAME, 'UPDATE', NEW.id::text, to_jsonb(NEW));
    return NEW;
  else
    insert into public.auditoria (usuario_id, usuario_nombre, tabla, accion, registro_id, detalle)
    values (v_id, coalesce(v_nom, 'desconocido'), TG_TABLE_NAME, 'DELETE', OLD.id::text, to_jsonb(OLD));
    return null;
  end if;
end;
$$;

-- 4. Triggers sobre las tablas sensibles
create trigger auditar_citas
  after insert or update or delete on public.citas
  for each row execute function public.fn_auditar();

create trigger auditar_historias
  after insert or update or delete on public.historias_clinicas
  for each row execute function public.fn_auditar();

create trigger auditar_facturas
  after insert or update or delete on public.facturas
  for each row execute function public.fn_auditar();

-- LISTO. Ahora haz una cita de prueba y revisa:
-- select * from public.auditoria order by fecha desc;

