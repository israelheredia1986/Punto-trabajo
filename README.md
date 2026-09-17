# Punto Trabajo

Plataforma de gestión de equipos con fichaje, localización, tareas, horarios, incidencias e informes.

## Roles

- **Administrador / Manager:** gestión completa de la empresa, usuarios, equipos, mapa, tareas, jornadas, incidencias e informes.
- **Encargado / Supervisor:** acceso operativo limitado a los equipos que tiene asignados.
- **Empleado:** acceso a su jornada, sus tareas, sus fichajes y sus incidencias.

La restricción de acceso no depende solo del menú de la aplicación: el esquema de Supabase incluye PostgreSQL Row Level Security (RLS) para aplicar el aislamiento de datos desde la base de datos.

## Estado actual

La aplicación tiene una demo navegable con acceso por roles y una primera arquitectura de backend preparada para Supabase. Mientras no se configuren las credenciales del proyecto real, la interfaz conserva el modo demo.

El flujo de jornada ya está preparado para entrada, pausa, reanudación y salida. En un proyecto Supabase configurado, registra los eventos en la base de datos y guarda las coordenadas de entrada/salida cuando el dispositivo proporciona geolocalización.

## Módulos

- Panel de gestión
- Empleados
- Usuarios y permisos
- Mapa en vivo
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

## Supabase

1. Abre o crea el proyecto de Supabase.
2. Ejecuta las migraciones SQL anteriores en el SQL Editor, en ese orden.
3. Configura Supabase Auth para el método de acceso elegido.
4. Rellena `supabase-config.js` con la URL del proyecto y la clave pública/publishable.
5. Nunca introduzcas la `service_role` key en el navegador.

La aplicación carga Supabase JS v2 automáticamente cuando la configuración es válida; mientras tanto continúa funcionando en modo demo.

La conexión del cliente usa `signInWithPassword` y sesiones persistentes del SDK; el acceso a datos se protege con RLS. citeturn824176search3turn824176search4turn824176search0

## Seguridad

Las tablas expuestas al Data API están protegidas con RLS y las políticas están separadas por operación. Las funciones `security definer` usadas para resolver membresías están en el esquema privado y fijan `search_path` explícitamente, siguiendo las recomendaciones de Supabase. citeturn824176search0turn824176search2

El objetivo es que:

- un empleado solo pueda consultar/modificar sus propios datos operativos;
- un encargado pueda operar sobre su equipo asignado;
- un administrador pueda gestionar la empresa completa;
- una empresa no pueda acceder a los datos de otra.

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

Con esta base, el siguiente bloque es conectar el **geofencing real y el mapa en vivo** con los eventos de ubicación y el equipo autorizado, y después construir la pantalla de altas de empleados/usuarios sobre la misma base de datos.
