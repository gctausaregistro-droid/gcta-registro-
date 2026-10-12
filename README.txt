# GCTA — conexión inicial de base de datos

Este paquete conserva la página actual y añade la configuración mínima para que Netlify Database pueda aplicar la primera migración.

La migración crea la tabla `registros` con:
- folio
- nombre
- proceso
- etapa
- estado
- ultima_actualizacion
- mensaje
- pin_acceso

IMPORTANTE:
- No contiene datos reales de solicitantes.
- No expone credenciales de la base de datos.
- La consulta pública (/api/consulta) y el panel privado (/admin) ya usan la base, siempre desde funciones del servidor.
- El PIN se guarda cifrado (scrypt) y nunca se devuelve al navegador.
- El panel requiere la variable de entorno privada ADMIN_PASSWORD (mínimo 12 caracteres) configurada en Netlify.
