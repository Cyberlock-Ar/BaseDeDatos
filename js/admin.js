// ============================================================
//  PANEL DE ADMINISTRACIÓN
// ============================================================

// ---------- Utilidad para insertar texto del usuario en HTML ----------
function esc(texto) {
  if (texto === null || texto === undefined) return "";
  return String(texto)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// ---------- NAVEGACIÓN ENTRE PANELES ----------
document.querySelectorAll(".nav-lateral button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-lateral button").forEach((b) => b.classList.remove("activo"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("activo"));
    btn.classList.add("activo");
    document.getElementById("panel-" + btn.dataset.panel).classList.add("activo");
  });
});

// ---------- INICIO ----------
let perfilActual = null;

(async function iniciar() {
  const perfil = await requerirAdmin();
  if (!perfil) return;

  perfilActual = perfil;
  document.getElementById("usuario-nombre").textContent = perfil.nombre || "Admin";
  document.getElementById("ac-fecha").min = new Date().toISOString().slice(0, 16);

  await Promise.all([
    cargarDashboard(),
    cargarPacientes(),
    cargarOdontologos(),
    cargarCitas(),
    cargarHistorias(),
    cargarFacturas(),
    cargarSelectPacientes(),
    cargarSelectOdontologos(),
    cargarSelectCitas(),
    cargarAuditoria(),
  ]);
})();

// ============================================================
//  DASHBOARD
// ============================================================
async function cargarDashboard() {
  const [pacientes, citas, pendientes, facturas] = await Promise.all([
    db.from("usuarios").select("id", { count: "exact", head: true }).eq("rol", "paciente"),
    db.from("citas").select("id, estado, fecha, usuarios(nombre), odontologos(nombre)", { count: "exact" }),
    db.from("citas").select("id", { count: "exact", head: true }).eq("estado", "pendiente"),
    db.from("facturas").select("total"),
  ]);

  document.getElementById("stat-pacientes").textContent = pacientes.count || 0;
  document.getElementById("stat-citas").textContent = citas.count || 0;
  document.getElementById("stat-pendientes").textContent = pendientes.count || 0;

  const ingresos = (facturas.data || []).reduce((s, f) => s + Number(f.total || 0), 0);
  document.getElementById("stat-ingresos").textContent = formatearMoneda(ingresos);

  // Últimas 6 citas
  const recientes = [...(citas.data || [])]
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
    .slice(0, 6);

  const tbody = document.getElementById("tabla-recientes");
  tbody.innerHTML = recientes.length
    ? recientes
        .map(
          (c) => `
      <tr>
        <td>${esc(c.usuarios ? c.usuarios.nombre : "—")}</td>
        <td>${esc(c.odontologos ? c.odontologos.nombre : "—")}</td>
        <td>${formatearFecha(c.fecha)}</td>
        <td><span class="${claseEstado(c.estado)}">${c.estado}</span></td>
      </tr>`
        )
        .join("")
    : '<tr><td colspan="4" class="vacio">No hay citas registradas.</td></tr>';
}

// ============================================================
//  PACIENTES
// ============================================================
let listaPacientes = [];

async function cargarPacientes() {
  const { data, error } = await db
    .from("usuarios")
    .select("id, nombre, email, telefono, direccion, edad, genero, rol")
    .order("nombre");

  if (error) {
    document.getElementById("tabla-pacientes").innerHTML =
      '<tr><td colspan="8" class="vacio">Error al cargar pacientes.</td></tr>';
    return;
  }

  listaPacientes = data || [];
  pintarPacientes(listaPacientes);
}

function pintarPacientes(lista) {
  const tbody = document.getElementById("tabla-pacientes");
  document.getElementById("conteo-pacientes").textContent =
    lista.length + (lista.length === 1 ? " registro" : " registros");

  tbody.innerHTML = lista.length
    ? lista
        .map(
          (p) => `
      <tr>
        <td><b>${esc(p.nombre)}</b></td>
        <td>${p.edad ?? "—"}</td>
        <td>${esc(p.genero) || "—"}</td>
        <td>${esc(p.telefono) || "—"}</td>
        <td>${esc(p.direccion) || "—"}</td>
        <td>${esc(p.email) || "—"}</td>
        <td>
          <select onchange="cambiarRol('${p.id}', this.value)"
                  style="padding:0.3rem;border-radius:6px;border:1px solid var(--borde);font-family:inherit;text-transform:capitalize;">
            ${["paciente", "medico", "admin"]
              .map((r) => `<option value="${r}" ${p.rol === r ? "selected" : ""}>${r}</option>`)
              .join("")}
          </select>
        </td>
        <td>${
          p.rol === "admin"
            ? ""
            : `<button class="btn btn-peligro btn-sm" onclick="eliminarPaciente('${p.id}')">Eliminar</button>`
        }</td>
      </tr>`
        )
        .join("")
    : '<tr><td colspan="8" class="vacio">No se encontraron pacientes.</td></tr>';
}

function filtrarPacientes() {
  const texto = document.getElementById("buscar-paciente").value.toLowerCase();
  const filtrados = listaPacientes.filter(
    (p) =>
      (p.nombre || "").toLowerCase().includes(texto) ||
      (p.email || "").toLowerCase().includes(texto) ||
      (p.genero || "").toLowerCase().includes(texto)
  );
  pintarPacientes(filtrados);
}

// Cambiar el rol de un usuario (paciente <-> médico <-> admin)
async function cambiarRol(id, rol) {
  if (id === perfilActual.id) {
    alert("No puedes cambiar tu propio rol.");
    await cargarPacientes();
    return;
  }

  const { error } = await db.from("usuarios").update({ rol }).eq("id", id);
  if (error) {
    alert("No se pudo cambiar el rol: " + error.message);
    await cargarPacientes();
    return;
  }

  await cargarPacientes();
}

async function eliminarPaciente(id) {
  if (!confirm("¿Eliminar este paciente? Se borrarán también sus citas, historias y facturas.")) return;

  const { error } = await db.from("usuarios").delete().eq("id", id);
  if (error) {
    alert("No se pudo eliminar: " + error.message);
    return;
  }
  await Promise.all([cargarPacientes(), cargarDashboard(), cargarCitas(), cargarSelectPacientes()]);
}

// ============================================================
//  ODONTÓLOGOS
// ============================================================
async function cargarOdontologos() {
  const [{ data: odos, error }, { data: cuentas }] = await Promise.all([
    db.from("odontologos").select("id, nombre, especialidad, telefono, id_usuario"),
    db.from("usuarios").select("id, nombre, email, rol").order("nombre"),
  ]);

  const tbody = document.getElementById("tabla-odontologos");
  if (error || !odos) {
    const faltaScript = error && /id_usuario/.test(error.message || "");
    tbody.innerHTML = `<tr><td colspan="6" class="vacio">${
      faltaScript
        ? "Falta ejecutar el script sql/vinculo_medico.sql en Supabase."
        : "Error al cargar."
    }</td></tr>`;
    return;
  }

  // Opciones: cuentas con rol médico (y la que ya esté vinculada)
  const opcionesCuenta = (o) =>
    '<option value="">— Sin vincular —</option>' +
    (cuentas || [])
      .filter((u) => u.rol === "medico" || u.id === o.id_usuario)
      .map(
        (u) =>
          `<option value="${u.id}" ${u.id === o.id_usuario ? "selected" : ""}>${esc(u.nombre)}${
            u.email ? " (" + esc(u.email) + ")" : ""
          }</option>`
      )
      .join("");

  tbody.innerHTML = odos.length
    ? odos
        .map(
          (o) => `
      <tr>
        <td>${o.id}</td>
        <td><b>${esc(o.nombre)}</b></td>
        <td><span class="especialidad">${esc(o.especialidad)}</span></td>
        <td>${esc(o.telefono) || "—"}</td>
        <td>
          <select onchange="vincularCuenta(${o.id}, this.value)"
                  style="padding:0.35rem;border-radius:6px;border:1px solid var(--borde);font-family:inherit;max-width:230px;">
            ${opcionesCuenta(o)}
          </select>
        </td>
        <td><button class="btn btn-peligro btn-sm" onclick="eliminarOdontologo(${o.id})">Eliminar</button></td>
      </tr>`
        )
        .join("")
    : '<tr><td colspan="6" class="vacio">No hay odontólogos registrados.</td></tr>';
}

// Vincular la ficha del odontólogo con la cuenta de login del médico
async function vincularCuenta(idFicha, idUsuario) {
  const { error } = await db
    .from("odontologos")
    .update({ id_usuario: idUsuario || null })
    .eq("id", idFicha);

  if (error) {
    alert("No se pudo vincular la cuenta: " + error.message);
    await cargarOdontologos();
  }
}

document.getElementById("form-odontologo").addEventListener("submit", async (e) => {
  e.preventDefault();
  limpiarError("odo-error");

  const { error } = await db.from("odontologos").insert({
    nombre: document.getElementById("odo-nombre").value.trim(),
    especialidad: document.getElementById("odo-especialidad").value,
    telefono: document.getElementById("odo-telefono").value.trim() || null,
  });

  if (error) {
    mostrarError("odo-error", "No se pudo guardar: " + error.message);
    return;
  }

  document.getElementById("form-odontologo").reset();
  await Promise.all([cargarOdontologos(), cargarSelectOdontologos()]);
});

async function eliminarOdontologo(id) {
  if (!confirm("¿Eliminar este odontólogo?")) return;

  const { error } = await db.from("odontologos").delete().eq("id", id);
  if (error) {
    alert(
      "No se pudo eliminar porque tiene citas asociadas. " +
        "Reasigna o cancela esas citas primero."
    );
    return;
  }
  await Promise.all([cargarOdontologos(), cargarSelectOdontologos(), cargarCitas()]);
}

// ============================================================
//  CITAS
// ============================================================
let listaCitas = [];

async function cargarSelectPacientes() {
  const { data } = await db.from("usuarios").select("id, nombre").eq("rol", "paciente").order("nombre");
  const opciones =
    '<option value="">Selecciona...</option>' +
    (data || []).map((p) => `<option value="${p.id}">${esc(p.nombre)}</option>`).join("");

  document.getElementById("ac-paciente").innerHTML = opciones;
  document.getElementById("h-paciente").innerHTML = opciones;
}

async function cargarSelectOdontologos() {
  const { data } = await db.from("odontologos").select("id, nombre, especialidad").order("nombre");
  const opciones =
    '<option value="">Selecciona...</option>' +
    (data || [])
      .map((o) => `<option value="${o.id}">${esc(o.nombre)} - ${esc(o.especialidad)}</option>`)
      .join("");

  document.getElementById("ac-odontologo").innerHTML = opciones;
}

async function cargarCitas() {
  const { data, error } = await db
    .from("citas")
    .select(
      "id, fecha, motivo, estado, id_usuario, id_odontologo, usuarios(nombre), odontologos(nombre)"
    )
    .order("fecha", { ascending: false });

  const tbody = document.getElementById("tabla-citas");
  if (error || !data) {
    tbody.innerHTML = '<tr><td colspan="7" class="vacio">Error al cargar citas.</td></tr>';
    return;
  }

  listaCitas = data;
  pintarCitas(listaCitas);
}

function pintarCitas(lista) {
  const tbody = document.getElementById("tabla-citas");

  tbody.innerHTML = lista.length
    ? lista
        .map(
          (c) => `
      <tr>
        <td>${c.id}</td>
        <td><b>${esc(c.usuarios ? c.usuarios.nombre : "—")}</b></td>
        <td>${esc(c.odontologos ? c.odontologos.nombre : "—")}</td>
        <td>${formatearFecha(c.fecha)}</td>
        <td>${esc(c.motivo) || "—"}</td>
        <td>
          <select onchange="cambiarEstadoCita(${c.id}, this.value)" style="padding:0.3rem;border-radius:6px;border:1px solid var(--borde);font-family:inherit;">
            ${["pendiente", "confirmada", "atendida", "cancelada"]
              .map(
                (e) =>
                  `<option value="${e}" ${c.estado === e ? "selected" : ""}>${e}</option>`
              )
              .join("")}
          </select>
        </td>
        <td><button class="btn btn-peligro btn-sm" onclick="eliminarCita(${c.id})">Borrar</button></td>
      </tr>`
        )
        .join("")
    : '<tr><td colspan="7" class="vacio">No hay citas con esos filtros.</td></tr>';
}

function filtrarCitas() {
  const texto = document.getElementById("buscar-cita").value.toLowerCase();
  const estado = document.getElementById("filtro-estado").value;

  const filtradas = listaCitas.filter((c) => {
    const coincideTexto =
      (c.usuarios?.nombre || "").toLowerCase().includes(texto) ||
      (c.odontologos?.nombre || "").toLowerCase().includes(texto) ||
      (c.motivo || "").toLowerCase().includes(texto);
    const coincideEstado = !estado || c.estado === estado;
    return coincideTexto && coincideEstado;
  });

  pintarCitas(filtradas);
}

async function cambiarEstadoCita(id, estado) {
  const { error } = await db.from("citas").update({ estado }).eq("id", id);
  if (error) {
    alert("No se pudo actualizar: " + error.message);
    return;
  }
  await Promise.all([cargarCitas(), cargarDashboard()]);
}

document.getElementById("form-cita-admin").addEventListener("submit", async (e) => {
  e.preventDefault();
  limpiarError("ac-error");

  const fecha = document.getElementById("ac-fecha").value;
  const { error } = await db.from("citas").insert({
    id_usuario: document.getElementById("ac-paciente").value,
    id_odontologo: Number(document.getElementById("ac-odontologo").value),
    fecha: new Date(fecha).toISOString(),
    motivo: document.getElementById("ac-motivo").value.trim() || null,
    estado: "confirmada",
  });

  if (error) {
    mostrarError("ac-error", "No se pudo crear: " + error.message);
    return;
  }

  document.getElementById("form-cita-admin").reset();
  await Promise.all([cargarCitas(), cargarDashboard(), cargarSelectCitas()]);
});

async function eliminarCita(id) {
  if (!confirm("¿Eliminar esta cita? Sus facturas y registros ligados también se afectarán.")) return;

  const { error } = await db.from("citas").delete().eq("id", id);
  if (error) {
    alert("No se pudo eliminar: " + error.message);
    return;
  }
  await Promise.all([cargarCitas(), cargarDashboard(), cargarFacturas(), cargarSelectCitas()]);
}

// ============================================================
//  HISTORIAS CLÍNICAS
// ============================================================
async function cargarHistorias() {
  const { data, error } = await db
    .from("historias_clinicas")
    .select("id, fecha, diagnostico, tratamiento, id_usuario, usuarios(nombre)")
    .order("fecha", { ascending: false });

  const tbody = document.getElementById("tabla-historias");
  if (error || !data) {
    tbody.innerHTML = '<tr><td colspan="6" class="vacio">Error al cargar.</td></tr>';
    return;
  }

  tbody.innerHTML = data.length
    ? data
        .map(
          (h) => `
      <tr>
        <td>${h.id}</td>
        <td><b>${esc(h.usuarios ? h.usuarios.nombre : "—")}</b></td>
        <td>${formatearFecha(h.fecha)}</td>
        <td>${esc(h.diagnostico)}</td>
        <td>${esc(h.tratamiento) || "—"}</td>
        <td><button class="btn btn-peligro btn-sm" onclick="eliminarHistoria(${h.id})">Borrar</button></td>
      </tr>`
        )
        .join("")
    : '<tr><td colspan="6" class="vacio">No hay registros clínicos.</td></tr>';
}

document.getElementById("form-historia").addEventListener("submit", async (e) => {
  e.preventDefault();
  limpiarError("h-error");

  const cita = document.getElementById("h-cita").value;
  const { error } = await db.from("historias_clinicas").insert({
    id_usuario: document.getElementById("h-paciente").value,
    id_cita: cita ? Number(cita) : null,
    diagnostico: document.getElementById("h-diagnostico").value.trim(),
    tratamiento: document.getElementById("h-tratamiento").value.trim() || null,
    notas: document.getElementById("h-notas").value.trim() || null,
  });

  if (error) {
    mostrarError("h-error", "No se pudo guardar: " + error.message);
    return;
  }

  document.getElementById("form-historia").reset();
  await Promise.all([cargarHistorias(), cargarSelectCitas()]);
});

async function eliminarHistoria(id) {
  if (!confirm("¿Eliminar este registro de historia clínica?")) return;

  const { error } = await db.from("historias_clinicas").delete().eq("id", id);
  if (error) {
    alert("No se pudo eliminar: " + error.message);
    return;
  }
  await cargarHistorias();
}

// ============================================================
//  FACTURAS
// ============================================================
async function cargarSelectCitas() {
  const { data } = await db
    .from("citas")
    .select("id, fecha, usuarios(nombre)")
    .order("fecha", { ascending: false });

  document.getElementById("f-cita").innerHTML =
    '<option value="">Selecciona...</option>' +
    (data || [])
      .map(
        (c) =>
          `<option value="${c.id}">#${c.id} - ${esc(c.usuarios ? c.usuarios.nombre : "—")} - ${formatearFecha(c.fecha)}</option>`
      )
      .join("");

  document.getElementById("h-cita").innerHTML =
    '<option value="">Sin cita específica</option>' +
    (data || [])
      .map(
        (c) =>
          `<option value="${c.id}">#${c.id} - ${esc(c.usuarios ? c.usuarios.nombre : "—")}</option>`
      )
      .join("");
}

async function cargarFacturas() {
  const { data, error } = await db
    .from("facturas")
    .select("id, fecha, detalle, total, citas(fecha, usuarios(nombre))")
    .order("fecha", { ascending: false });

  const tbody = document.getElementById("tabla-facturas");
  if (error || !data) {
    tbody.innerHTML = '<tr><td colspan="7" class="vacio">Error al cargar.</td></tr>';
    return;
  }

  tbody.innerHTML = data.length
    ? data
        .map(
          (f) => `
      <tr>
        <td>${f.id}</td>
        <td>${formatearFecha(f.fecha)}</td>
        <td><b>${esc(f.citas?.usuarios?.nombre || "—")}</b></td>
        <td>${f.citas ? formatearFecha(f.citas.fecha) : "—"}</td>
        <td>${esc(f.detalle) || "—"}</td>
        <td><b>${formatearMoneda(f.total)}</b></td>
        <td><button class="btn btn-peligro btn-sm" onclick="eliminarFactura(${f.id})">Borrar</button></td>
      </tr>`
        )
        .join("")
    : '<tr><td colspan="7" class="vacio">No hay facturas emitidas.</td></tr>';
}

document.getElementById("form-factura").addEventListener("submit", async (e) => {
  e.preventDefault();
  limpiarError("f-error");

  const { error } = await db.from("facturas").insert({
    id_cita: Number(document.getElementById("f-cita").value),
    total: Number(document.getElementById("f-total").value),
    detalle: document.getElementById("f-detalle").value.trim() || null,
  });

  if (error) {
    mostrarError("f-error", "No se pudo emitir: " + error.message);
    return;
  }

  document.getElementById("form-factura").reset();
  await Promise.all([cargarFacturas(), cargarDashboard()]);
});

async function eliminarFactura(id) {
  if (!confirm("¿Eliminar esta factura?")) return;

  const { error } = await db.from("facturas").delete().eq("id", id);
  if (error) {
    alert("No se pudo eliminar: " + error.message);
    return;
  }
  await Promise.all([cargarFacturas(), cargarDashboard()]);
}

// ============================================================
//  AUDITORÍA
// ============================================================
let listaAuditoria = [];

const CLASE_ACCION = {
  INSERT: "badge-atendida",
  UPDATE: "badge-confirmada",
  DELETE: "badge-cancelada",
};

async function cargarAuditoria() {
  const { data, error } = await db
    .from("auditoria")
    .select("id, fecha, usuario_nombre, tabla, accion, registro_id, detalle")
    .order("fecha", { ascending: false })
    .limit(200);

  const tbody = document.getElementById("tabla-auditoria");

  if (error) {
    tbody.innerHTML =
      '<tr><td colspan="6" class="vacio">No se pudo cargar. ¿Ya ejecutaste sql/auditoria.sql en Supabase?</td></tr>';
    return;
  }

  listaAuditoria = data || [];
  pintarAuditoria(listaAuditoria);
}

function pintarAuditoria(lista) {
  const tbody = document.getElementById("tabla-auditoria");
  document.getElementById("conteo-auditoria").textContent =
    lista.length + (lista.length === 1 ? " evento" : " eventos");

  tbody.innerHTML = lista.length
    ? lista
        .map((a) => {
          const detalle = a.detalle ? JSON.stringify(a.detalle) : "";
          return `
      <tr>
        <td>${formatearFecha(a.fecha)}</td>
        <td><b>${esc(a.usuario_nombre)}</b></td>
        <td>${esc(a.tabla)}</td>
        <td><span class="badge ${CLASE_ACCION[a.accion] || "badge-pendiente"}">${a.accion}</span></td>
        <td>${esc(a.registro_id)}</td>
        <td title="${esc(detalle)}">${esc(detalle.substring(0, 90))}${detalle.length > 90 ? "..." : ""}</td>
      </tr>`;
        })
        .join("")
    : '<tr><td colspan="6" class="vacio">Sin eventos registrados todavía. Haz una acción (agendar cita, emitir factura...) y recarga.</td></tr>';
}

function filtrarAuditoria() {
  const texto = document.getElementById("buscar-auditoria").value.toLowerCase();
  const filtrados = listaAuditoria.filter(
    (a) =>
      (a.usuario_nombre || "").toLowerCase().includes(texto) ||
      (a.tabla || "").toLowerCase().includes(texto) ||
      (a.accion || "").toLowerCase().includes(texto)
  );
  pintarAuditoria(filtrados);
}
