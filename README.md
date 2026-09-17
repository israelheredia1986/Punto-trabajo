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

## Geofencing y mapa en vivo

Ya está incluido un primer flujo funcional de geofencing:

- Mapa Leaflet con posiciones de trabajadores autorizados.
- Actualización automática de posiciones cada 15 segundos.
- Geocercas circulares con nombre, coordenadas y radio.
- Estado del trabajador: dentro o fuera de zona.
- Gestión de geocercas desde el mapa para responsables.
- Botón para rellenar una geocerca usando la ubicación actual del dispositivo.
- En modo demo, las geocercas y posiciones se almacenan localmente.
- Con Supabase configurado, las geocercas se leen/escriben en `geofences` y las posiciones en `location_events`.
- El empleado recibe un aviso cuando pasa de dentro a fuera de una geocerca o viceversa.

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
- Vista de empleado

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

Migraciones:

- `supabase/migrations/001_initial_schema.sql`
- `supabase/migrations/002_harden_team_rls.sql`
- `supabase/migrations/003_time_entry_breaks.sql`
- `supabase/migrations/004_geofencing_live_location.sql`

## Supabase

1. Abre o crea el proyecto de Supabase.
2. Ejecuta las migraciones SQL anteriores en el SQL Editor, en ese orden.
3. Configura Supabase Auth para el método de acceso elegido.
4. Rellena `supabase-config.js` con la URL del proyecto y la clave pública/publishable.
5. Nunca introduzcas la `service_role` key en el navegador.

La aplicación carga Supabase JS v2 automáticamente cuando la configuración es válida; mientras tanto continúa funcionando en modo demo.

La conexión del cliente usa `signInWithPassword` y sesiones persistentes del SDK; el acceso a datos se protege con RLS.

## Seguridad

Las tablas expuestas al Data API están protegidas con RLS y las políticas están separadas por operación. El objetivo es que:

- un empleado solo pueda consultar/modificar sus propios datos operativos;
- un encargado pueda operar sobre su equipo asignado;
- un administrador pueda gestionar la empresa completa;
- una empresa no pueda acceder a los datos de otra.

Las geocercas son configurables por administradores en la política SQL actual; el mapa solo muestra la información que el usuario autorizado puede consultar.

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

Con el mapa y geofencing preparados, el siguiente bloque es terminar el **alta real de empleados y usuarios** y conectarlo con los equipos, roles y empresa de Supabase para que toda la gestión deje de depender de datos simulados.
