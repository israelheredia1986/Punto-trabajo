# Punto Trabajo

Plataforma de gestión de equipos con fichaje, localización, tareas, horarios, incidencias e informes.

## Roles

- **Administrador / Manager:** gestión completa de la empresa, usuarios, equipos, mapa, tareas, jornadas, incidencias e informes.
- **Encargado / Supervisor:** acceso operativo limitado a los equipos que tiene asignados.
- **Empleado:** acceso a su jornada, sus tareas, sus fichajes y sus incidencias.

La restricción de acceso no depende solo del menú de la aplicación: el esquema de Supabase incluye PostgreSQL Row Level Security (RLS) para aplicar el aislamiento de datos desde la base de datos.

## Estado actual

La aplicación tiene una demo navegable con acceso por roles y una arquitectura de backend preparada para Supabase. Mientras no se configuren las credenciales del proyecto real, la interfaz conserva el modo demo.

El flujo de jornada está preparado para entrada, pausa, reanudación y salida. Cuando el navegador permite geolocalización, se guardan coordenadas de entrada/salida y, durante una jornada activa, se pueden registrar posiciones periódicas para el mapa.

Las pantallas de **Tareas, Incidencias, Horarios, Panel e Informes** ya tienen una ruta de datos real para Supabase. El modo demo se mantiene como fallback mientras no haya configuración válida.

La **vista móvil del empleado** muestra únicamente su jornada, sus tareas, sus incidencias y su estado de ubicación; no contiene acceso operativo al resto de la plantilla.

## Geofencing y mapa en vivo

Ya está incluido un flujo funcional de geofencing:

- Mapa Leaflet con posiciones de trabajadores autorizados.
- Actualización automática de posiciones cada 15 segundos.
- Geocercas circulares con nombre, coordenadas y radio.
- Estado del trabajador: dentro, fuera o sin geocerca configurada.
- Gestión de geocercas reservada al administrador.
- Botón para rellenar una geocerca usando la ubicación actual del dispositivo.
- En modo demo, las geocercas y posiciones se almacenan localmente.
- Con Supabase configurado, las geocercas se leen/escriben en `geofences` y las posiciones en `location_events`.
- El empleado recibe un aviso cuando pasa de dentro a fuera de una geocerca o viceversa.

## Alta real de empleados y usuarios

El panel **Empleados / Usuarios** ya incluye:

- Alta con nombre, email, puesto, rol y equipo.
- Estados `active`, `invited` y `disabled`.
- Vista de empleados limitada por RLS al ámbito del usuario.
- Modo demo con almacenamiento local.
- Modo Supabase con invitación por email mediante `invite-employee`.
- Creación de perfil y membresía de empresa.
- Asignación inicial a un equipo.
- Activación automática de la membresía invitada en el primer inicio de sesión.

La invitación de Auth se ejecuta en una Edge Function para que la clave secreta nunca llegue al navegador.

## Operaciones conectadas a Supabase

`operations-supabase.js` sustituye las pantallas operativas por consultas reales cuando existe una sesión Supabase:

- **Tareas:** listado, alta, asignación y cambio de estado.
- **Incidencias:** listado, alta y cambio de estado/resolución.
- **Horarios:** día, semana y mes, con pausas descontadas del cálculo de duración.
- El modo demo continúa disponible como fallback.

`supabase/migrations/007_operations_rls.sql` añade la política explícita de inserción de incidencias y los índices operativos utilizados por estas vistas.

## Panel e informes conectados a Supabase

`dashboard-reports-supabase.js` sustituye el Panel e Informes por datos reales cuando Supabase está configurado:

- Panel con empleados visibles, jornadas abiertas, tareas del día, alertas de geofencing recientes e incidencias abiertas/en revisión.
- Informes por día, semana o mes.
- Resumen por empleado de horas, tareas, tareas completadas, incidencias y salidas de geocerca.
- Exportación mediante el diálogo de impresión del navegador para guardar el informe como PDF.
- RLS mantiene el ámbito de empresa/equipo del usuario.

## Vista móvil del empleado

`worker-mobile.js` y `worker-mobile.css` añaden una vista optimizada para móvil:

- Fichar entrada, pausa, reanudación y salida.
- Tiempo acumulado de la jornada.
- Tareas asignadas al empleado.
- Incidencias propias.
- Estado de ubicación durante la jornada.
- Sin listado de otros empleados ni acceso a datos de otros equipos.

## Seguridad y Data API

`supabase/migrations/008_data_api_grants.sql` limita explícitamente los grants del Data API:

- `anon` no recibe acceso a las tablas operativas.
- `authenticated` recibe únicamente las operaciones necesarias para la aplicación.
- `audit_logs` no se expone al navegador.
- RLS permanece activado en todas las tablas públicas usadas por la aplicación.

La batería `supabase/tests/001_security_access.test.sql` comprueba que las tablas operativas tienen RLS y que el rol `anon` no dispone de lectura.

## Validación automática

`.github/workflows/ci.yml` valida cada cambio en `main` y en pull requests:

- sintaxis de todos los archivos JavaScript del proyecto;
- existencia de los módulos frontend requeridos;
- que `supabase-config.js` siga siendo un placeholder seguro mientras no se seleccione el proyecto real;
- existencia y orden de las migraciones 001–008;
- existencia de la prueba de seguridad.

Esto evita que un cambio llegue a despliegue rompiendo JavaScript o conectando accidentalmente el frontend a un proyecto Supabase no autorizado.

## Despliegue

El procedimiento reproducible está en [`supabase/DEPLOY.md`](./supabase/DEPLOY.md). No se debe aplicar el esquema a otro proyecto Supabase por error: primero hay que identificar expresamente el proyecto de Punto Trabajo.

## Módulos

- Panel de gestión
- Empleados
- Usuarios y permisos
- Mapa en vivo
- Geocercas
- Tareas
- Horarios y fichajes
- Incidencias
- Informes
- Vista móvil de empleado

## Modelo de datos inicial

El backend contempla:

- Empresas multiempresa
- Perfiles de usuario
- Membresías por empresa y rol
- Equipos y miembros de equipo
- Geocercas
- Fichajes y jornadas
- Pausas de jornada
- Eventos de ubicación
- Tareas
- Incidencias
- Auditoría de cambios

Migraciones, en este orden:

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_harden_team_rls.sql`
3. `supabase/migrations/003_time_entry_breaks.sql`
4. `supabase/migrations/004_geofencing_live_location.sql`
5. `supabase/migrations/005_employee_onboarding.sql`
6. `supabase/migrations/006_profile_email.sql`
7. `supabase/migrations/007_operations_rls.sql`
8. `supabase/migrations/008_data_api_grants.sql`

Edge Function:

- `supabase/functions/invite-employee/index.ts`

## Supabase

1. Abre o crea el proyecto de Supabase.
2. Ejecuta las migraciones SQL anteriores en el SQL Editor, en ese orden.
3. Configura Supabase Auth para el método de acceso elegido.
4. Despliega la Edge Function `invite-employee`.
5. Rellena `supabase-config.js` con la URL del proyecto y la clave pública/publishable.
6. Configura los secretos de Edge Functions desde Supabase; nunca introduzcas una secret/service-role key en el navegador.

La aplicación carga Supabase JS v2 automáticamente cuando la configuración es válida; mientras tanto continúa funcionando en modo demo.

## Seguridad

Las tablas expuestas al Data API están protegidas con RLS y las políticas están separadas por operación. El aislamiento se aplica también a empresas y equipos, no solo a la interfaz.

El objetivo es que:

- un empleado solo pueda consultar/modificar sus propios datos operativos;
- un encargado pueda operar sobre su equipo asignado;
- un administrador pueda gestionar la empresa completa;
- una empresa no pueda acceder a los datos de otra;
- las claves privilegiadas no lleguen al navegador.

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

## Siguiente bloque funcional

El backend ya está preparado para el despliegue real. El siguiente paso es seleccionar el proyecto Supabase de Punto Trabajo, aplicar las migraciones y ejecutar la prueba funcional completa de administrador, encargado y empleado.
