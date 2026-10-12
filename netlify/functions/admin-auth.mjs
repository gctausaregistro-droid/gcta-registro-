// Inicio de sesión, verificación de sesión y cierre de sesión del panel /admin.
import {
  cerrarSesion, cookieBorrada, cookieSesion, crearSesion, error, igualesSeguro, ipCliente, json,
  leerJSON, limpiarFallos, registrarFallo, segundosBloqueo, sesionValida, sha256, verificarOrigen,
} from "../lib/seguridad.mjs";

const MAX_FALLOS = 5;
const VENTANA_SEG = 15 * 60;
const BLOQUEO_SEG = 15 * 60;

export default async (req, context) => {
  const accion = context.params?.accion;

  if (accion === "sesion" && req.method === "GET") {
    return json({ autenticado: await sesionValida(req) });
  }

  if (req.method !== "POST") return error("Método no permitido.", 405);
  if (!verificarOrigen(req)) return error("Solicitud no permitida.", 403);

  if (accion === "logout") {
    await cerrarSesion(req);
    return json({ ok: true }, 200, { "Set-Cookie": cookieBorrada() });
  }

  if (accion !== "login") return error("No encontrado.", 404);

  const contrasena = process.env.ADMIN_PASSWORD;
  if (!contrasena || contrasena.length < 12) {
    return error("El acceso de administración no está configurado.", 503);
  }

  const clave = `login:${sha256(ipCliente(req, context))}`;
  const espera = await segundosBloqueo(clave);
  if (espera) {
    return json({ error: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." }, 429, {
      "Retry-After": String(espera),
    });
  }

  const datos = await leerJSON(req);
  const intento = typeof datos?.contrasena === "string" ? datos.contrasena : "";

  if (!intento || intento.length > 256 || !igualesSeguro(intento, contrasena)) {
    await registrarFallo(clave, MAX_FALLOS, VENTANA_SEG, BLOQUEO_SEG);
    await new Promise((r) => setTimeout(r, 600));
    return error("Contraseña incorrecta.", 401);
  }

  await limpiarFallos(clave);
  const token = await crearSesion();
  return json({ ok: true }, 200, { "Set-Cookie": cookieSesion(token) });
};

export const config = {
  path: "/api/admin/:accion(login|logout|sesion)",
};
