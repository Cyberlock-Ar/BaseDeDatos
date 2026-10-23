// ============================================================
//  PANEL MÉDICO (odontólogo)
//  Ve agenda, citas, pacientes e historias.
//  NO tiene acceso a facturas ni auditoría.
// ============================================================

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
let listaCitas = [];
let listaPacientes = [];

(async function iniciar() {
  const perfil = await requerirMedico();
  if (!perfil) return;

  document.getElementById("usuario-nombre").textContent = perfil.nombre || "Médico";

  await Promise.all([
    cargarEstadisticas(),
    cargarCitas(),
    cargarPacientes(),
    cargarHistorias(),
    cargarSelectPacientes(),
  ]);
})();

// ============================================================
//  AGENDA (ESTADÍSTICAS + PRÓXIMAS CITAS)
// ============================================================
async function cargarEstadisticas() {
  const [citas, pacientes] = await Promise.all([
    db.from("citas").select("id, estado, fecha"),
    db.from("usuarios").select("id", { count: "exact", head: true }).eq("rol", "paciente"),
  ]);

  const filas = citas.data || [];
  const pendientes = filas.filter((c) => c.estado === "pendiente" || c.estado === "confirmada").length;
  const atendidas = filas.filter((c) => c.estado === "atendida").length;

  document.getElementById("stat-citas").textContent = filas.length;
  document.getElementById("stat-pendientes").textContent = pendientes;
  document.getElementById("stat-atendidas").textContent = atendidas;
  document.getElementById("stat-pacientes").textContent = pacientes.count || 0;

  // Próximas citas (pendientes/confirmadas futuras)
  const ahora = Date.now();
  const futuras = filas
    .filter((c) => new Date(c.fecha).getTime() >= ahora && (c.estado === "pendiente" || c.estado === "confirmada"))
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha))
    .slice(0, 5);

  const contenedor = document.getElementById("proxima-cita");
  if (futuras.length === 0) {
    contenedor.innerHTML = '<p class="vacio">No tienes citas próximas.</p>';
  } else {
    contenedor.innerHTML = '<div class="lista">' +
      futuras
        .map(
          (c) => `
      <div class="cita-item">
        <div>
          <strong>${formatearFecha(c.fecha)}</strong>
          <span class="detalle">${c.motivo || "Consulta"}</span>
        </div>
        <span class="${claseEstado(c.estado)}">${c.estado}</span>
      </div>`
        )
        .join("") +
      "</div>";
  }
}

// ============================================================
//  CITAS
// ============================================================
async function cargarCitas() {
  const { data, error } = await db
    .from("citas")
    .select("id, fecha, motivo, estado, usuarios(nombre)")
    .order("fecha", { ascending: false });

  const tbody = document.getElementById("tabla-citas");
  if (error || !data) {
    tbody.innerHTML = '<tr><td colspan="5" class="vacio">Error al cargar citas.</td></tr>';
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
        <td>${formatearFecha(c.fecha)}</td>
        <td>${esc(c.motivo) || "—"}</td>
        <td>
          <select onchange="cambiarEstadoCita(${c.id}, this.value)" style="padding:0.3rem;border-radius:6px;border:1px solid var(--borde);font-family:inherit;">
            ${["pendiente", "confirmada", "atendida", "cancelada"]
              .map((e) => `<option value="${e}" ${c.estado === e ? "selected" : ""}>${e}</option>`)
              .join("")}
          </select>
        </td>
      </tr>`
        )
        .join("")
    : '<tr><td colspan="5" class="vacio">No hay citas con esos filtros.</td></tr>';
}

function filtrarCitas() {
  const texto = document.getElementById("buscar-cita").value.toLowerCase();
  const estado = document.getElementById("filtro-estado").value;

  pintarCitas(
    listaCitas.filter((c) => {
      const okTexto =
        (c.usuarios?.nombre || "").toLowerCase().includes(texto) ||
        (c.motivo || "").toLowerCase().includes(texto);
      const okEstado = !estado || c.estado === estado;
      return okTexto && okEstado;
    })
  );
}

async function cambiarEstadoCita(id, estado) {
  const { error } = await db.from("citas").update({ estado }).eq("id", id);
  if (error) {
    alert("No se pudo actualizar: " + error.message);
    return;
  }
  await Promise.all([cargarCitas(), cargarEstadisticas()]);
}

// ============================================================
//  PACIENTES (solo consulta)
// ============================================================
async function cargarPacientes() {
  const { data, error } = await db
    .from("usuarios")
    .select("id, nombre, edad, genero, telefono, direccion")
    .eq("rol", "paciente")
    .order("nombre");

  const tbody = document.getElementById("tabla-pacientes");
  if (error || !data) {
    tbody.innerHTML = '<tr><td colspan="5" class="vacio">Error al cargar pacientes.</td></tr>';
    return;
  }

  listaPacientes = data;
  pintarPacientes(listaPacientes);
}

function pintarPacientes(lista) {
  const tbody = document.getElementById("tabla-pacientes");
  document.getElementById("conteo-pacientes").textContent =
    lista.length + (lista.length === 1 ? " paciente" : " pacientes");

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
      </tr>`
        )
        .join("")
    : '<tr><td colspan="5" class="vacio">No se encontraron pacientes.</td></tr>';
}

function filtrarPacientes() {
  const texto = document.getElementById("buscar-paciente").value.toLowerCase();
  pintarPacientes(
    listaPacientes.filter(
      (p) =>
        (p.nombre || "").toLowerCase().includes(texto) ||
        (p.telefono || "").toLowerCase().includes(texto) ||
        (p.genero || "").toLowerCase().includes(texto)
    )
  );
}

// ============================================================
//  HISTORIAS CLÍNICAS
// ============================================================
async function cargarSelectPacientes() {
  const { data } = await db
    .from("usuarios")
    .select("id, nombre")
    .eq("rol", "paciente")
    .order("nombre");

  document.getElementById("h-paciente").innerHTML =
    '<option value="">Selecciona...</option>' +
    (data || []).map((p) => `<option value="${p.id}">${esc(p.nombre)}</option>`).join("");
}

async function cargarHistorias() {
  const { data, error } = await db
    .from("historias_clinicas")
    .select("id, fecha, diagnostico, tratamiento, usuarios(nombre)")
    .order("fecha", { ascending: false });

  const tbody = document.getElementById("tabla-historias");
  if (error || !data) {
    tbody.innerHTML = '<tr><td colspan="5" class="vacio">Error al cargar.</td></tr>';
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
      </tr>`
        )
        .join("")
    : '<tr><td colspan="5" class="vacio">No hay registros clínicos.</td></tr>';
}

document.getElementById("form-historia").addEventListener("submit", async (e) => {
  e.preventDefault();
  limpiarError("h-error");
  limpiarError("h-exito");

  const { error } = await db.from("historias_clinicas").insert({
    id_usuario: document.getElementById("h-paciente").value,
    diagnostico: document.getElementById("h-diagnostico").value.trim(),
    tratamiento: document.getElementById("h-tratamiento").value.trim() || null,
    notas: document.getElementById("h-notas").value.trim() || null,
  });

  if (error) {
    mostrarError("h-error", "No se pudo guardar: " + error.message);
    return;
  }

  mostrarError("h-exito", "Registro guardado con éxito.");
  document.getElementById("form-historia").reset();
  await cargarHistorias();
  setTimeout(() => limpiarError("h-exito"), 4000);
});
