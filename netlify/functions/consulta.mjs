// Consulta pública: devuelve solo los campos permitidos de un registro
// después de verificar folio y PIN. No permite listar ni enumerar registros.
import {
  db, error, ipCliente, json, leerJSON, normalizarFolio, registrarFallo, segundosBloqueo, sha256,
  verificarOrigen, verificarPin, FOLIO_RE, PIN_RE,
} from "../lib/seguridad.mjs";

const MENSAJE_GENERICO = "No encontramos un registro con ese folio y PIN. Verifica los datos o comunícate con GCTA.";

export default async (req, context) => {
  if (req.method !== "POST") return error("Método no permitido.", 405);
  if (!verificarOrigen(req)) return error("Solicitud no permitida.", 403);

  const datos = await leerJSON(req);
  const folio = normalizarFolio(datos?.folio);
  const pin = typeof datos?.pin === "string" ? datos.pin.trim() : "";

  const claveIp = `consulta-ip:${sha256(ipCliente(req, context))}`;
  const claveFolio = `consulta-folio:${sha256(folio)}`;
  const espera = Math.max(await segundosBloqueo(claveIp), await segundosBloqueo(claveFolio));
  if (espera) {
    return json({ error: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." }, 429, {
      "Retry-After": String(espera),
    });
  }

  const sql = db();
  const formatoValido = FOLIO_RE.test(folio) && PIN_RE.test(pin);
  const [fila] = formatoValido
    ? await sql`
        SELECT folio, nombre, proceso, etapa, estado, ultima_actualizacion, mensaje, pin_acceso
        FROM registros WHERE folio = ${folio}`
    : [];

  // Siempre se calcula el hash para no revelar por tiempo si el folio existe.
  const correcto = await verificarPin(pin || "0000", fila?.pin_acceso);

  if (!formatoValido || !fila || !correcto) {
    await registrarFallo(claveIp, 10, 15 * 60, 15 * 60);
    if (FOLIO_RE.test(folio)) await registrarFallo(claveFolio, 5, 15 * 60, 30 * 60);
    return error(MENSAJE_GENERICO, 404);
  }

  return json({
    registro: {
      folio: fila.folio,
      nombre: fila.nombre,
      proceso: fila.proceso,
      etapa: fila.etapa,
      estado: fila.estado,
      ultima_actualizacion: fila.ultima_actualizacion,
      mensaje: fila.mensaje,
    },
  });
};

export const config = {
  path: "/api/consulta",
};
