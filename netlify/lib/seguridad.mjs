// Utilidades de servidor compartidas por las funciones de GCTA.
// Nada de este archivo se envía al navegador.
import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { getDatabase } from "@netlify/database";

const scryptAsync = promisify(scrypt);

export const COOKIE_SESION = "__Host-gcta_admin";
const DURACION_SESION_SEG = 8 * 60 * 60; // 8 horas

export const PROCESOS = ["H-2A", "H-2B", "TN"];
export const ETAPAS = ["Registro", "Evaluación", "Preparación", "Trámite", "Traslado"];
export const ESTADOS = ["En proceso", "Documentación", "Completado", "Pendiente"];

let dbCache;
export function db() {
  if (!dbCache) dbCache = getDatabase();
  return dbCache.sql;
}

// ---------- Respuestas ----------

const CABECERAS_BASE = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
};

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CABECERAS_BASE, "Content-Type": "application/json; charset=utf-8", ...extra },
  });
}

export function error(mensaje, status) {
  return json({ error: mensaje }, status);
}

// Rechaza peticiones que cambian datos si no vienen del mismo origen (defensa CSRF
// adicional a SameSite=Strict) o si no envían JSON.
export function verificarOrigen(req) {
  const origen = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (origen) {
    try {
      if (new URL(origen).host !== host) return false;
    } catch {
      return false;
    }
  } else if (req.headers.get("sec-fetch-site") && req.headers.get("sec-fetch-site") !== "same-origin") {
    return false;
  }
  const tipo = req.headers.get("content-type") || "";
  return req.method === "GET" || tipo.toLowerCase().startsWith("application/json");
}

export async function leerJSON(req) {
  try {
    const texto = await req.text();
    if (texto.length > 20000) return null;
    const datos = JSON.parse(texto);
    return datos && typeof datos === "object" && !Array.isArray(datos) ? datos : null;
  } catch {
    return null;
  }
}

export function ipCliente(req, context) {
  return context?.ip || req.headers.get("x-nf-client-connection-ip") || "desconocida";
}

// ---------- Hash y comparación ----------

export function sha256(valor) {
  return createHash("sha256").update(String(valor)).digest("hex");
}

// Comparación en tiempo constante de dos cadenas arbitrarias.
export function igualesSeguro(a, b) {
  const clave = randomBytes(32);
  const ha = createHmac("sha256", clave).update(String(a)).digest();
  const hb = createHmac("sha256", clave).update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

export async function hashPin(pin) {
  const sal = randomBytes(16);
  const hash = await scryptAsync(pin, sal, 32);
  return `scrypt$${sal.toString("base64")}$${hash.toString("base64")}`;
}

const HASH_FICTICIO = "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

// Verifica un PIN contra el valor guardado. Si no hay registro se calcula un hash
// ficticio igualmente, para que el tiempo de respuesta no revele si el folio existe.
export async function verificarPin(pin, guardado) {
  const valor = guardado || HASH_FICTICIO;
  if (valor.startsWith("scrypt$")) {
    const [, salB64, hashB64] = valor.split("$");
    const esperado = Buffer.from(hashB64 || "", "base64");
    const calculado = await scryptAsync(pin, Buffer.from(salB64 || "", "base64"), 32);
    return Boolean(guardado) && esperado.length === 32 && timingSafeEqual(esperado, calculado);
  }
  // Compatibilidad con un PIN guardado en texto plano (no debería ocurrir).
  await scryptAsync(pin, Buffer.alloc(16), 32);
  return igualesSeguro(pin, valor);
}

// ---------- Límite de intentos ----------

// Devuelve los segundos restantes de bloqueo, o 0 si la clave no está bloqueada.
export async function segundosBloqueo(clave) {
  const sql = db();
  const [fila] = await sql`
    SELECT CEIL(EXTRACT(EPOCH FROM (bloqueado_hasta - NOW())))::int AS restante
    FROM intentos_fallidos
    WHERE clave = ${clave} AND bloqueado_hasta > NOW()
  `;
  return fila ? Math.max(1, fila.restante) : 0;
}

export async function registrarFallo(clave, maxFallos, ventanaSeg, bloqueoSeg) {
  const sql = db();
  await sql`
    INSERT INTO intentos_fallidos AS t (clave, fallos, ventana_inicio)
    VALUES (${clave}, 1, NOW())
    ON CONFLICT (clave) DO UPDATE SET
      fallos = CASE WHEN t.ventana_inicio < NOW() - make_interval(secs => ${ventanaSeg}) THEN 1 ELSE t.fallos + 1 END,
      ventana_inicio = CASE WHEN t.ventana_inicio < NOW() - make_interval(secs => ${ventanaSeg}) THEN NOW() ELSE t.ventana_inicio END
  `;
  await sql`
    UPDATE intentos_fallidos
    SET bloqueado_hasta = NOW() + make_interval(secs => ${bloqueoSeg}), fallos = 0, ventana_inicio = NOW()
    WHERE clave = ${clave} AND fallos >= ${maxFallos}
  `;
}

export async function limpiarFallos(clave) {
  const sql = db();
  await sql`DELETE FROM intentos_fallidos WHERE clave = ${clave}`;
}

// ---------- Sesión de administrador ----------

function leerCookie(req, nombre) {
  const cabecera = req.headers.get("cookie") || "";
  for (const parte of cabecera.split(";")) {
    const [k, ...v] = parte.trim().split("=");
    if (k === nombre) return v.join("=");
  }
  return null;
}

export function cookieSesion(token) {
  return `${COOKIE_SESION}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${DURACION_SESION_SEG}`;
}

export function cookieBorrada() {
  return `${COOKIE_SESION}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export async function crearSesion() {
  const sql = db();
  const token = randomBytes(32).toString("base64url");
  await sql`DELETE FROM admin_sesiones WHERE expira_en < NOW()`;
  await sql`
    INSERT INTO admin_sesiones (token_hash, expira_en)
    VALUES (${sha256(token)}, NOW() + make_interval(secs => ${DURACION_SESION_SEG}))
  `;
  return token;
}

export async function sesionValida(req) {
  const token = leerCookie(req, COOKIE_SESION);
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const sql = db();
  const [fila] = await sql`
    SELECT 1 AS ok FROM admin_sesiones WHERE token_hash = ${sha256(token)} AND expira_en > NOW()
  `;
  return Boolean(fila);
}

export async function cerrarSesion(req) {
  const token = leerCookie(req, COOKIE_SESION);
  if (!token) return;
  const sql = db();
  await sql`DELETE FROM admin_sesiones WHERE token_hash = ${sha256(token)}`;
}

// ---------- Validación de datos ----------

export function normalizarFolio(valor) {
  return typeof valor === "string" ? valor.trim().toUpperCase() : "";
}

export const FOLIO_RE = /^[A-Z0-9][A-Z0-9-]{1,29}$/;
export const PIN_RE = /^\d{4,12}$/;

// Valida los datos de un solicitante. `pinOpcional` permite omitir el PIN al editar.
export function validarRegistro(datos, { pinOpcional = false } = {}) {
  const errores = [];
  const folio = normalizarFolio(datos.folio);
  const nombre = typeof datos.nombre === "string" ? datos.nombre.trim().replace(/\s+/g, " ") : "";
  const proceso = datos.proceso;
  const etapa = datos.etapa;
  const estado = datos.estado;
  const mensaje = typeof datos.mensaje === "string" ? datos.mensaje.trim() : "";
  const pin = typeof datos.pin === "string" ? datos.pin.trim() : "";
  const fecha = typeof datos.ultima_actualizacion === "string" ? datos.ultima_actualizacion.trim() : "";

  if (!FOLIO_RE.test(folio)) errores.push("El folio debe tener de 2 a 30 caracteres: letras, números y guiones.");
  if (nombre.length < 2 || nombre.length > 150) errores.push("El nombre debe tener entre 2 y 150 caracteres.");
  if (!PROCESOS.includes(proceso)) errores.push("Proceso no válido.");
  if (!ETAPAS.includes(etapa)) errores.push("Etapa no válida.");
  if (!ESTADOS.includes(estado)) errores.push("Estado no válido.");
  if (mensaje.length > 2000) errores.push("El mensaje no puede superar 2000 caracteres.");
  if (pin || !pinOpcional) {
    if (!PIN_RE.test(pin)) errores.push("El PIN debe tener de 4 a 12 dígitos.");
  }
  let ultima = null;
  if (fecha) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(`${fecha}T12:00:00Z`))) {
      errores.push("La fecha de última actualización no es válida.");
    } else {
      ultima = `${fecha}T12:00:00Z`;
    }
  }

  return { errores, valores: { folio, nombre, proceso, etapa, estado, mensaje, pin, ultima } };
}
