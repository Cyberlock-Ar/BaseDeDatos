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
