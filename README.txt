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
- El portal público y el panel administrativo todavía NO están conectados a la base.
- El PIN no debe exponerse directamente desde el navegador; en la siguiente fase se debe implementar una función server-side para validar el acceso.
