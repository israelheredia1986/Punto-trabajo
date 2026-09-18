# Despliegue de Punto Trabajo en Supabase

Este proyecto está preparado para Supabase, pero estas instrucciones no deben ejecutarse contra otro proyecto por accidente.

## 1. Elegir el proyecto correcto

Antes de ejecutar SQL, identifica expresamente el proyecto de Supabase que vaya a utilizar **Punto Trabajo**.

No uses un proyecto de otra aplicación solo porque aparezca disponible en la cuenta.

## 2. Aplicar migraciones

Ejecuta en este orden:

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_harden_team_rls.sql`
3. `supabase/migrations/003_time_entry_breaks.sql`
4. `supabase/migrations/004_geofencing_live_location.sql`
5. `supabase/migrations/005_employee_onboarding.sql`
6. `supabase/migrations/006_profile_email.sql`
7. `supabase/migrations/007_operations_rls.sql`
8. `supabase/migrations/008_data_api_grants.sql`

## 3. Ejecutar las pruebas

Después de las migraciones, ejecuta:

`supabase/tests/001_security_access.test.sql`

El test verifica:
- RLS activo en todas las tablas operativas;
- ausencia de lectura directa para `anon`;
- que las tablas sensibles no queden abiertas accidentalmente.

Para probar las políticas de negocio por usuario real, usa las cuentas reales creadas en Auth y la batería funcional del apartado 5.

## 4. Auth y usuarios

Configura Supabase Auth antes de probar el login real.

El alta de empleados utiliza la Edge Function:

`supabase/functions/invite-employee/index.ts`

La función requiere autenticación y las credenciales privilegiadas deben vivir únicamente como secretos del entorno servidor.

## 5. Prueba funcional por rol

### Administrador

Comprueba:
- Panel.
- Empleados/Usuarios.
- Crear y gestionar plantilla.
- Crear/eliminar geocercas.
- Ver mapa.
- Crear y actualizar tareas.
- Crear y resolver incidencias.
- Consultar horarios e informes.

### Encargado

Comprueba:
- Solo empleados/equipos asignados.
- Tareas e incidencias dentro de su ámbito.
- Horarios de su ámbito.
- Mapa de su ámbito.
- Sin gestión de usuarios de empresa.
- Sin creación/eliminación de geocercas.

### Empleado

Comprueba:
- Solo `Mi jornada`.
- Entrada, pausa, reanudación y salida.
- Sus tareas.
- Sus incidencias.
- Su ubicación mientras está en jornada.
- Sin listado de otros empleados.

## 6. Configuración del navegador

Rellena `supabase-config.js` únicamente con:
- URL del proyecto;
- clave publishable (o legacy anon, si corresponde).

Nunca introduzcas una secret/service-role key en el navegador.

## 7. Criterio de salida

No consideres el proyecto listo para producción hasta que:
- todas las migraciones estén aplicadas;
- el test de seguridad pase;
- el login real funcione;
- se prueben los tres roles;
- la geolocalización funcione en HTTPS y móvil;
- la Edge Function de invitaciones esté desplegada y probada;
- el proyecto correcto de Supabase esté confirmado.
