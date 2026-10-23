// ============================================================
//  FUNCIONES COMUNES DE SESIÓN Y PERFIL
//  Usado por index, registro, paciente y admin
// ============================================================

async function obtenerSesion() {
  const { data } = await db.auth.getSession();
  return data.session;
}

async function obtenerPerfil() {
  const session = await obtenerSesion();
  if (!session) return null;
  const { data, error } = await db
    .from("usuarios")
    .select("*")
    .eq("id", session.user.id)
    .single();
  if (error) return null;
  return data;
}

async function cerrarSesion() {
  await db.auth.signOut();
  window.location.href = "index.html";
}

// Exige estar logueado; si no, redirige a la portada
async function requerirSesion() {
  const session = await obtenerSesion();
  if (!session) {
    window.location.href = "index.html";
    return null;
  }
  return session;
}

// Exige rol admin; si no, redirige al panel del paciente
async function requerirAdmin() {
  const session = await requerirSesion();
  if (!session) return null;
  const perfil = await obtenerPerfil();
  if (!perfil || perfil.rol !== "admin") {
    window.location.href = "paciente.html";
    return null;
  }
  return perfil;
}

// Exige rol médico (o admin); si no, redirige a su panel correcto
async function requerirMedico() {
  const session = await requerirSesion();
  if (!session) return null;
  const perfil = await obtenerPerfil();
  if (!perfil || (perfil.rol !== "medico" && perfil.rol !== "admin")) {
    window.location.href = perfil && perfil.rol === "admin" ? "admin.html" : "paciente.html";
    return null;
  }
  return perfil;
}

// Utilidades de interfaz
function mostrarError(id, mensaje) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = mensaje;
  el.classList.remove("oculto");
}

function limpiarError(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = "";
  el.classList.add("oculto");
}

function formatearFecha(fecha) {
  if (!fecha) return "-";
  return new Date(fecha).toLocaleString("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatearMoneda(valor) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(valor || 0);
}

function claseEstado(estado) {
  return "badge badge-" + (estado || "pendiente");
}

function opcionDias() {
  const opciones = [];
  for (let i = 0; i <= 30; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    opciones.push(d.toISOString().slice(0, 10));
  }
  return opciones;
}
