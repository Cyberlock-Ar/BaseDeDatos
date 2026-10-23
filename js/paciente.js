// ============================================================
//  PANEL DEL PACIENTE
// ============================================================

let perfilActual = null;

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
(async function iniciar() {
  const session = await requerirSesion();
  if (!session) return;

  const perfil = await obtenerPerfil();
  if (!perfil) {
    window.location.href = "index.html";
    return;
  }

  // Un admin o médico usa su propio panel
  if (perfil.rol === "admin") {
    window.location.href = "admin.html";
    return;
  }
  if (perfil.rol === "medico") {
    window.location.href = "medico.html";
    return;
  }

  perfilActual = perfil;
  document.getElementById("usuario-nombre").textContent = perfil.nombre || "Paciente";
  document.getElementById("usuario-email").textContent = session.user.email || "";
  document.getElementById("bienvenida").textContent = (perfil.nombre || "").split(" ")[0] || "paciente";

  // Fecha mínima para agendar: ahora
  document.getElementById("cita-fecha").min = new Date().toISOString().slice(0, 16);

  await cargarOdontologos();
  await Promise.all([cargarCitas(), cargarHistorial(), cargarFacturas(), cargarEstadisticas()]);
})();

// ---------- ODONTÓLOGOS DISPONIBLES ----------
async function cargarOdontologos() {
  const { data, error } = await db
    .from("odontologos")
    .select("id, nombre, especialidad")
    .order("nombre");

  const select = document.getElementById("cita-odontologo");
  if (error || !data) return;

  select.innerHTML =
    '<option value="">Selecciona...</option>' +
    data
      .map((o) => `<option value="${o.id}">${o.nombre} - ${o.especialidad}</option>`)
      .join("");
}

// ---------- AGENDAR CITA ----------
document.getElementById("form-cita").addEventListener("submit", async (e) => {
  e.preventDefault();
  limpiarError("cita-error");
  limpiarError("cita-exito");

  const btn = document.getElementById("btn-cita");
  btn.disabled = true;
  btn.textContent = "Agendando...";

  const fecha = document.getElementById("cita-fecha").value;
  const { error } = await db.from("citas").insert({
    id_usuario: perfilActual.id,
    id_odontologo: Number(document.getElementById("cita-odontologo").value),
    fecha: new Date(fecha).toISOString(),
    motivo: document.getElementById("cita-motivo").value.trim(),
    estado: "pendiente",
  });

  btn.disabled = false;
  btn.textContent = "Agendar cita";

  if (error) {
    mostrarError("cita-error", "No se pudo agendar: " + error.message);
    return;
  }

  mostrarError("cita-exito", "¡Cita agendada con éxito!");
  document.getElementById("form-cita").reset();
  await Promise.all([cargarCitas(), cargarEstadisticas()]);
  setTimeout(() => limpiarError("cita-exito"), 4000);
});

// ---------- LISTAR CITAS ----------
async function cargarCitas() {
  const contenedor = document.getElementById("lista-citas");

  const { data, error } = await db
    .from("citas")
    .select("id, fecha, motivo, estado, odontologos(nombre, especialidad)")
    .order("fecha", { ascending: false });

  if (error || !data) {
    contenedor.innerHTML = '<p class="vacio">Error al cargar las citas.</p>';
    return;
  }

  if (data.length === 0) {
    contenedor.innerHTML = '<p class="vacio">Aún no tienes citas agendadas.</p>';
    return;
  }

  contenedor.innerHTML = data
    .map((c) => {
      const puedeCancelar = c.estado === "pendiente" || c.estado === "confirmada";
      return `
      <div class="cita-item">
        <div>
          <strong>${c.odontologos ? c.odontologos.nombre : "Odontólogo"}</strong>
          <span class="detalle">
            ${formatearFecha(c.fecha)} &bull; ${c.motivo || "Sin motivo"}
            ${c.odontologos ? " &bull; " + c.odontologos.especialidad : ""}
          </span>
        </div>
        <div style="display:flex;gap:0.5rem;align-items:center;">
          <span class="${claseEstado(c.estado)}">${c.estado}</span>
          ${puedeCancelar ? `<button class="btn btn-peligro btn-sm" onclick="cancelarCita(${c.id})">Cancelar</button>` : ""}
        </div>
      </div>`;
    })
    .join("");
}

// ---------- CANCELAR CITA ----------
async function cancelarCita(id) {
  if (!confirm("¿Seguro que deseas cancelar esta cita?")) return;

  const { error } = await db
    .from("citas")
    .update({ estado: "cancelada" })
    .eq("id", id);

  if (error) {
    alert("No se pudo cancelar: " + error.message);
    return;
  }
  await Promise.all([cargarCitas(), cargarEstadisticas()]);
}

// ---------- HISTORIAL CLÍNICO ----------
async function cargarHistorial() {
  const contenedor = document.getElementById("lista-historial");

  const { data, error } = await db
    .from("historias_clinicas")
    .select("id, fecha, diagnostico, tratamiento, notas")
    .order("fecha", { ascending: false });

  if (error || !data) {
    contenedor.innerHTML = '<p class="vacio">Error al cargar el historial.</p>';
    return;
  }

  if (data.length === 0) {
    contenedor.innerHTML = '<p class="vacio">No tienes registros clínicos todavía.</p>';
    return;
  }

  contenedor.innerHTML = data
    .map(
      (h) => `
      <div class="cita-item">
        <div>
          <strong>${h.diagnostico}</strong>
          <span class="detalle">${formatearFecha(h.fecha)}</span>
          <span class="detalle"><b>Tratamiento:</b> ${h.tratamiento || "—"}</span>
          ${h.notas ? `<span class="detalle"><b>Notas:</b> ${h.notas}</span>` : ""}
        </div>
      </div>`
    )
    .join("");
}

// ---------- FACTURAS ----------
async function cargarFacturas() {
  const tbody = document.getElementById("tabla-facturas");

  const { data, error } = await db
    .from("facturas")
    .select("id, fecha, detalle, total, citas(fecha)")
    .order("fecha", { ascending: false });

  if (error || !data) {
    tbody.innerHTML = '<tr><td colspan="5" class="vacio">Error al cargar facturas.</td></tr>';
    return;
  }

  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="vacio">No tienes facturas registradas.</td></tr>';
    return;
  }

  tbody.innerHTML = data
    .map(
      (f) => `
      <tr>
        <td>${f.id}</td>
        <td>${formatearFecha(f.fecha)}</td>
        <td>${f.citas ? formatearFecha(f.citas.fecha) : "—"}</td>
        <td>${f.detalle || "—"}</td>
        <td><b>${formatearMoneda(f.total)}</b></td>
      </tr>`
    )
    .join("");
}

// ---------- ESTADÍSTICAS DEL INICIO ----------
async function cargarEstadisticas() {
  const [citas, historias, facturas] = await Promise.all([
    db.from("citas").select("id, estado, fecha", { count: "exact", head: false }),
    db.from("historias_clinicas").select("id", { count: "exact" }),
    db.from("facturas").select("id, total", { count: "exact" }),
  ]);

  const totalCitas = citas.data ? citas.data.length : 0;
  const pendientes = citas.data
    ? citas.data.filter((c) => c.estado === "pendiente" || c.estado === "confirmada").length
    : 0;

  document.getElementById("stat-citas").textContent = totalCitas;
  document.getElementById("stat-pendientes").textContent = pendientes;
  document.getElementById("stat-historias").textContent = historias.count || 0;
  document.getElementById("stat-facturas").textContent = facturas.count || 0;

  // Próxima cita (la más cercana que no esté cancelada/atendida)
  const contenedor = document.getElementById("proxima-cita");
  const ahora = Date.now();
  const futuras = (citas.data || [])
    .filter((c) => new Date(c.fecha).getTime() >= ahora && c.estado !== "cancelada")
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

  if (futuras.length === 0) {
    contenedor.innerHTML =
      '<p class="vacio">No tienes citas próximas. ¡Agenda una en "Mis citas"!</p>';
  } else {
    const c = futuras[0];
    contenedor.innerHTML = `
      <div class="cita-item">
        <div>
          <strong>${formatearFecha(c.fecha)}</strong>
          <span class="detalle">${c.motivo || "Consulta"}</span>
        </div>
        <span class="${claseEstado(c.estado)}">${c.estado}</span>
      </div>`;
  }
}
