// API privada para registrar, consultar y editar solicitantes.
// Todas las operaciones exigen una sesión de administrador válida.
import {
  db, error, hashPin, json, leerJSON, sesionValida, validarRegistro, verificarOrigen,
} from "../lib/seguridad.mjs";

const POR_PAGINA = 25;

// Columnas que el panel puede ver. El PIN nunca se devuelve.
function publicar(fila) {
  return {
    id: String(fila.id),
    folio: fila.folio,
    nombre: fila.nombre,
    proceso: fila.proceso,
    etapa: fila.etapa,
    estado: fila.estado,
    ultima_actualizacion: fila.ultima_actualizacion,
    mensaje: fila.mensaje,
    created_at: fila.created_at,
  };
}

function esFolioDuplicado(e) {
  return e && e.code === "23505";
}

export default async (req, context) => {
  if (!verificarOrigen(req)) return error("Solicitud no permitida.", 403);
  if (!(await sesionValida(req))) return error("Sesión no válida. Inicia sesión de nuevo.", 401);

  const sql = db();
  const idTexto = context.params?.id;
  const id = idTexto && /^\d{1,18}$/.test(idTexto) ? idTexto : null;
  if (idTexto && !id) return error("No encontrado.", 404);

  // Listado y búsqueda
  if (!id && req.method === "GET") {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim().slice(0, 100);
    const pagina = Math.max(1, Math.min(10000, parseInt(url.searchParams.get("pagina") || "1", 10) || 1));
    const patron = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const desplazamiento = (pagina - 1) * POR_PAGINA;

    const filas = q
      ? await sql`
          SELECT id, folio, nombre, proceso, etapa, estado, ultima_actualizacion, mensaje, created_at
          FROM registros
          WHERE folio ILIKE ${patron} OR nombre ILIKE ${patron}
          ORDER BY ultima_actualizacion DESC, id DESC
          LIMIT ${POR_PAGINA + 1} OFFSET ${desplazamiento}`
      : await sql`
          SELECT id, folio, nombre, proceso, etapa, estado, ultima_actualizacion, mensaje, created_at
          FROM registros
          ORDER BY ultima_actualizacion DESC, id DESC
          LIMIT ${POR_PAGINA + 1} OFFSET ${desplazamiento}`;

    return json({
      registros: filas.slice(0, POR_PAGINA).map(publicar),
      pagina,
      hayMas: filas.length > POR_PAGINA,
    });
  }

  // Alta de solicitante
  if (!id && req.method === "POST") {
    const datos = await leerJSON(req);
    if (!datos) return error("Datos no válidos.", 400);
    const { errores, valores: v } = validarRegistro(datos);
    if (errores.length) return json({ error: errores.join(" ") }, 422);

    const pinHash = await hashPin(v.pin);
    try {
      const [fila] = await sql`
        INSERT INTO registros (folio, nombre, proceso, etapa, estado, ultima_actualizacion, mensaje, pin_acceso)
        VALUES (${v.folio}, ${v.nombre}, ${v.proceso}, ${v.etapa}, ${v.estado},
                COALESCE(${v.ultima}::timestamptz, NOW()), ${v.mensaje}, ${pinHash})
        RETURNING id, folio, nombre, proceso, etapa, estado, ultima_actualizacion, mensaje, created_at`;
      return json({ registro: publicar(fila) }, 201);
    } catch (e) {
      if (esFolioDuplicado(e)) return error("Ya existe un registro con ese folio.", 409);
      throw e;
    }
  }

  if (!id) return error("Método no permitido.", 405);

  // Consulta de un solicitante
  if (req.method === "GET") {
    const [fila] = await sql`
      SELECT id, folio, nombre, proceso, etapa, estado, ultima_actualizacion, mensaje, created_at
      FROM registros WHERE id = ${id}`;
    return fila ? json({ registro: publicar(fila) }) : error("No encontrado.", 404);
  }

  // Edición de un solicitante (el PIN solo se cambia si se envía uno nuevo)
  if (req.method === "PUT") {
    const datos = await leerJSON(req);
    if (!datos) return error("Datos no válidos.", 400);
    const { errores, valores: v } = validarRegistro(datos, { pinOpcional: true });
    if (errores.length) return json({ error: errores.join(" ") }, 422);

    const pinHash = v.pin ? await hashPin(v.pin) : null;
    try {
      const [fila] = await sql`
        UPDATE registros SET
          folio = ${v.folio},
          nombre = ${v.nombre},
          proceso = ${v.proceso},
          etapa = ${v.etapa},
          estado = ${v.estado},
          ultima_actualizacion = COALESCE(${v.ultima}::timestamptz, NOW()),
          mensaje = ${v.mensaje},
          pin_acceso = COALESCE(${pinHash}::text, pin_acceso)
        WHERE id = ${id}
        RETURNING id, folio, nombre, proceso, etapa, estado, ultima_actualizacion, mensaje, created_at`;
      return fila ? json({ registro: publicar(fila) }) : error("No encontrado.", 404);
    } catch (e) {
      if (esFolioDuplicado(e)) return error("Ya existe un registro con ese folio.", 409);
      throw e;
    }
  }

  return error("Método no permitido.", 405);
};

export const config = {
  path: ["/api/admin/registros", "/api/admin/registros/:id"],
};
