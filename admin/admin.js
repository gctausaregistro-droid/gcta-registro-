(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const vistaLogin = $("vistaLogin");
  const vistaPanel = $("vistaPanel");
  const btnSalir = $("btnSalir");
  const dlg = $("dlgRegistro");
  const formRegistro = $("formRegistro");

  let pagina = 1;
  let busqueda = "";
  let editandoId = null;
  const cache = new Map();

  async function api(url, opciones = {}) {
    const init = { credentials: "same-origin", headers: {}, ...opciones };
    if (init.body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(init.body);
    }
    const res = await fetch(url, init);
    let datos = {};
    try { datos = await res.json(); } catch { /* respuesta sin JSON */ }
    if (res.status === 401 && url.startsWith("/api/admin/registros")) {
      mostrarLogin("Tu sesión terminó. Inicia sesión de nuevo.");
    }
    if (!res.ok) throw new Error(datos.error || "Ocurrió un error. Inténtalo de nuevo.");
    return datos;
  }

  function aviso(el, texto, ok = false) {
    el.textContent = texto || "";
    el.classList.toggle("ok", ok);
    el.hidden = !texto;
  }

  function fechaCorta(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
  }

  function fechaInput(iso) {
    return iso ? new Date(iso).toISOString().slice(0, 10) : "";
  }

  function el(tag, clase, texto) {
    const n = document.createElement(tag);
    if (clase) n.className = clase;
    if (texto !== undefined) n.textContent = texto;
    return n;
  }

  function celda(clase, etiqueta, valor, extraClase) {
    const c = el("div", clase);
    c.append(el("small", "", etiqueta));
    c.append(el("span", extraClase || "", valor));
    return c;
  }

  // ---------- Sesión ----------

  function mostrarLogin(mensaje) {
    vistaPanel.hidden = true;
    btnSalir.hidden = true;
    vistaLogin.hidden = false;
    if (dlg.open) dlg.close();
    aviso($("msgLogin"), mensaje || "");
    $("contrasena").focus();
  }

  function mostrarPanel() {
    vistaLogin.hidden = true;
    vistaPanel.hidden = false;
    btnSalir.hidden = false;
    cargar();
  }

  $("formLogin").addEventListener("submit", async (e) => {
    e.preventDefault();
    const boton = e.submitter || e.target.querySelector("button");
    boton.disabled = true;
    aviso($("msgLogin"), "");
    try {
      await api("/api/admin/login", { method: "POST", body: { contrasena: $("contrasena").value } });
      $("contrasena").value = "";
      mostrarPanel();
    } catch (err) {
      aviso($("msgLogin"), err.message);
    } finally {
      boton.disabled = false;
    }
  });

  btnSalir.addEventListener("click", async () => {
    try { await api("/api/admin/logout", { method: "POST", body: {} }); } catch { /* se ignora */ }
    cache.clear();
    $("lista").replaceChildren();
    mostrarLogin("Sesión cerrada.");
    $("msgLogin").classList.add("ok");
  });

  // ---------- Listado ----------

  async function cargar() {
    aviso($("msgLista"), "");
    const params = new URLSearchParams({ pagina: String(pagina) });
    if (busqueda) params.set("q", busqueda);
    try {
      const datos = await api(`/api/admin/registros?${params}`);
      pintar(datos);
    } catch (err) {
      if (!vistaPanel.hidden) aviso($("msgLista"), err.message);
    }
  }

  function pintar({ registros, hayMas }) {
    const lista = $("lista");
    cache.clear();
    lista.replaceChildren();
    if (!registros.length) {
      lista.append(el("div", "vacio", busqueda ? "No hay registros que coincidan con la búsqueda." : "Aún no hay solicitantes registrados."));
    }
    for (const r of registros) {
      cache.set(r.id, r);
      const fila = el("article", "fila");
      fila.append(celda("c-folio", "Folio", r.folio, "folio"));
      fila.append(celda("c-nombre", "Nombre", r.nombre, "nombre"));
      fila.append(celda("c-proceso", "Proceso", r.proceso));
      fila.append(celda("c-etapa", "Etapa", r.etapa));
      fila.append(celda("c-estado", "Estado", r.estado, `chip ${r.estado}`));
      fila.append(celda("c-fecha", "Actualizado", fechaCorta(r.ultima_actualizacion)));
      const editar = el("button", "btn-sec c-editar", "Editar");
      editar.type = "button";
      editar.addEventListener("click", () => abrir(r.id));
      fila.append(editar);
      lista.append(fila);
    }
    $("btnAnterior").hidden = pagina <= 1;
    $("btnSiguiente").hidden = !hayMas;
    $("paginaActual").textContent = pagina > 1 || hayMas ? `Página ${pagina}` : "";
  }

  $("formBuscar").addEventListener("submit", (e) => {
    e.preventDefault();
    busqueda = $("q").value.trim();
    pagina = 1;
    cargar();
  });
  $("btnAnterior").addEventListener("click", () => { pagina = Math.max(1, pagina - 1); cargar(); });
  $("btnSiguiente").addEventListener("click", () => { pagina += 1; cargar(); });

  // ---------- Alta y edición ----------

  function abrir(id) {
    editandoId = id || null;
    formRegistro.reset();
    aviso($("msgRegistro"), "");
    const r = id ? cache.get(id) : null;
    $("tituloDialogo").textContent = r ? `Editar ${r.folio}` : "Nuevo solicitante";
    const f = formRegistro.elements;
    f.pin.required = !r;
    f.pin.placeholder = r ? "Dejar vacío para conservar el PIN actual" : "";
    $("ayudaPin").textContent = r
      ? "El PIN actual no se muestra. Escribe uno nuevo solo si deseas cambiarlo."
      : "De 4 a 12 dígitos. Compártelo solo con el solicitante.";
    if (r) {
      f.folio.value = r.folio;
      f.nombre.value = r.nombre;
      f.proceso.value = r.proceso;
      f.etapa.value = r.etapa;
      f.estado.value = r.estado;
      f.mensaje.value = r.mensaje || "";
    }
    f.ultima_actualizacion.value = fechaInput(new Date().toISOString());
    dlg.showModal();
    f.folio.focus();
  }

  $("btnNuevo").addEventListener("click", () => abrir(null));
  $("btnCerrarDlg").addEventListener("click", () => dlg.close());
  $("btnCancelar").addEventListener("click", () => dlg.close());

  formRegistro.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = formRegistro.elements;
    const datos = {
      folio: f.folio.value.trim().toUpperCase(),
      nombre: f.nombre.value.trim(),
      proceso: f.proceso.value,
      etapa: f.etapa.value,
      estado: f.estado.value,
      ultima_actualizacion: f.ultima_actualizacion.value,
      mensaje: f.mensaje.value.trim(),
      pin: f.pin.value.trim(),
    };
    if (!datos.folio || !datos.nombre || (!editandoId && !datos.pin)) {
      aviso($("msgRegistro"), "Completa folio, nombre y PIN.");
      return;
    }
    const boton = $("btnGuardar");
    boton.disabled = true;
    try {
      if (editandoId) {
        await api(`/api/admin/registros/${encodeURIComponent(editandoId)}`, { method: "PUT", body: datos });
      } else {
        await api("/api/admin/registros", { method: "POST", body: datos });
      }
      f.pin.value = "";
      dlg.close();
      aviso($("msgLista"), editandoId ? "Registro actualizado." : "Solicitante registrado.", true);
      const mensaje = $("msgLista").textContent;
      await cargar();
      aviso($("msgLista"), mensaje, true);
    } catch (err) {
      aviso($("msgRegistro"), err.message);
    } finally {
      boton.disabled = false;
    }
  });

  dlg.addEventListener("close", () => { formRegistro.elements.pin.value = ""; });

  // ---------- Inicio ----------

  api("/api/admin/sesion")
    .then((d) => (d.autenticado ? mostrarPanel() : mostrarLogin()))
    .catch(() => mostrarLogin("No se pudo verificar la sesión."));
})();
