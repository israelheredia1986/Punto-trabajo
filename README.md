# Punto Trabajo

Plataforma de gestión de equipos con fichaje, localización, tareas, horarios, incidencias e informes.

## Roles

- **Administrador:** gestión completa de empresa, usuarios, empleados, equipos, mapa, tareas, horarios, incidencias e informes.
- **Encargado:** gestión operativa limitada a su equipo asignado.
- **Empleado:** acceso a su jornada, tareas e información propia.

## Estado actual

La primera base visual ya ha evolucionado a una **demo navegable con acceso por roles**. La autenticación actual es local y de demostración; todavía no sustituye a un sistema de autenticación seguro ni a una base de datos de producción.

### Incluido ahora

- Pantalla de inicio de sesión.
- Sesión local con persistencia en el navegador.
- Tres roles: Administrador, Encargado y Empleado.
- Menú condicionado por permisos.
- Bloqueo de navegación de secciones no autorizadas.
- Ámbito por equipo para el rol Encargado.
- Sección de Usuarios y permisos para el Administrador.
- Panel de gestión.
- Empleados.
- Mapa en vivo con datos simulados.
- Tareas.
- Horarios y fichajes con datos simulados.
- Incidencias.
- Informes.
- Vista de empleado / Mi jornada.

## Cuentas de demostración

**Administrador**  
Email: `admin@puntotrabajo.demo`  
Contraseña: `admin123`

**Encargado**  
Email: `encargado@puntotrabajo.demo`  
Contraseña: `super123`

**Empleado**  
Email: `empleado@puntotrabajo.demo`  
Contraseña: `empleado123`

> Las credenciales anteriores son únicamente para la demo. No deben utilizarse como credenciales reales.

## Próximo bloque técnico

- Backend de autenticación seguro.
- Base de datos multiempresa.
- Usuarios, empleados y equipos persistentes.
- Fichaje real con geolocalización.
- Geofencing y alertas.
- Notificaciones.
- Exportación PDF/Excel real.
- Auditoría de cambios.

## Ejecutar

La interfaz puede abrirse directamente o desplegarse en GitHub Pages. Para producción habrá que conectar el frontend a un backend y aplicar el control de permisos también en servidor/base de datos.
