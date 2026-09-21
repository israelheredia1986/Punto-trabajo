# Punto Trabajo · batería de pruebas (lista maestra)

Marca cada punto. Lo que dice **[Android]** requiere el móvil real con la app instalada; no se puede validar desde un ordenador.
Antes de empezar: migraciones 011–013 aplicadas, `003_completion.test.sql` en verde, `invite-employee` desplegada, URLs de Auth configuradas.

## 1. Empleados
- [ ] Admin → Empleados → Añadir empleado (email real tuyo). Llega el correo.
- [ ] Abrir el enlace: pide **crear contraseña** → entra en «Mi jornada».
- [ ] Salir y entrar de nuevo con esa contraseña. «He olvidado mi contraseña» envía un enlace.
- [ ] Repetir el alta con el mismo email → error «ya pertenece a esta empresa» (con pista si está invitado/desactivado).
- [ ] Email que ya tiene cuenta en otra empresa → mensaje claro (una cuenta = una empresa).
- [ ] Gestionar → cambiar de equipo: aparece en el equipo nuevo.
- [ ] Gestionar → empleado → encargado con equipo: el equipo lo muestra como responsable (si no tenía). Entrar como ese encargado: ve solo su equipo.
- [ ] Encargado → empleado: deja de ser responsable del equipo.
- [ ] Empleado con jornada abierta → Desactivar: la jornada se cierra sola; no puede entrar; sus tareas/fichajes siguen en los informes.
- [ ] Intentar quitar/desactivar al **único** administrador → error.

## 2. Tareas
- [ ] Admin y encargado crean tarea; el empleado la ve en «Mis tareas» y en «Mi jornada».
- [ ] Empleado: Pendiente → En curso → Completada. No puede cancelar ni editar el título (error).
- [ ] Manager: cancelar, editar, reasignar. «Historial» muestra cada cambio con autor.
- [ ] Tarea con fecha pasada: sale «Vencida»; filtro «Solo vencidas» funciona.
- [ ] Encargado no puede asignar a alguien de otro equipo (error).

## 3. Incidencias
- [ ] Empleado crea incidencia; el manager recibe aviso.
- [ ] Flujo abierta → en revisión → cerrada (pide comentario) → reabierta (pide motivo). Historial con autor y fechas.
- [ ] Empleado no ve botones de cambio de estado; sí puede comentar.

## 4. Control horario
- [ ] Filtros día/semana/mes y por empleado/equipo. Total del periodo correcto.
- [ ] Varias pausas: la duración descuenta todas.
- [ ] **Jornada que cruza medianoche**: entrada 23:00, salida 01:00 → día 1 = 01:00 h, día 2 = 01:00 h; aparece la etiqueta «Cruza medianoche».
- [ ] Fichar sin GPS (denegar permiso): se registra y sale «Entrada sin GPS».
- [ ] Fichar fuera de geocerca: sale «Entrada fuera de zona». Con «Bloquear fichajes fuera de geocerca» activado, no deja.
- [ ] Intentar editar la hora de entrada desde la consola del navegador → el servidor lo rechaza.
- [ ] Jornada olvidada: el manager abre Detalle → «Cerrar jornada ahora».

## 4b. GPS y mapa **[Android]**
- [ ] Instalar la PWA. Fichar entrada, guardar el móvil 10 min con la pantalla apagada. **Esperado**: puede haber huecos (Android suspende la web). Al volver a abrir, se recupera. Anotar los huecos.
- [ ] Quitar el permiso de ubicación durante la jornada: banner «Permiso denegado». Devolverlo: se reanuda.
- [ ] Modo avión 3 min y volver: «Sin conexión…» y luego las posiciones pendientes se envían.
- [ ] Mala precisión (interior): aviso «Precisión baja»; no genera alertas.
- [ ] Varios empleados a la vez en el mapa; ordenados (fuera de zona primero). Dejar de enviar posición 10+ min → «Sin señal».
- [ ] Mapa se refresca cada 60 s (Configuración lo cambia) y se detiene al salir de la pantalla.

## 5. Geocercas
- [ ] Crear, editar, desactivar, eliminar. Pulsar en el mapa rellena coordenadas.
- [ ] Dos geocercas solapadas: aviso «Se solapa con…»; estando en la zona común figura dentro.
- [ ] Entrar → salir → entrar: **una** incidencia «Salida de geocerca» + aviso al admin y al encargado. Volver a salir antes de 10 min: no duplica; pasado el enfriamiento, crea otra.

## 6. Panel, informes y coherencia
Con SQL Editor (sustituye `TU_EMPRESA`), compara con el Panel de hoy:

```sql
select count(*) filter (where status in ('open','review')) as incidencias_abiertas,
       count(*) filter (where type='geofencing' and created_at::date = current_date) as alertas_hoy
from incidents where company_id = 'TU_EMPRESA';
select count(*) as activos_ahora from time_entries where company_id='TU_EMPRESA' and status='open';
```
- [ ] Coinciden: incidencias abiertas, alertas de hoy, activos ahora.
- [ ] Informe diario de hoy = Panel (horas, tareas, alertas).
- [ ] CSV se abre en Excel con acentos. «PDF / Imprimir» → Guardar como PDF: cabecera con logo, totales, tablas sin cortar filas.

## 7. Auditoría / Avisos / Configuración
- [ ] Auditoría (solo admin): alta de empleado, tarea, incidencia, geocerca y fichaje con autor y hora; filtros; CSV. Un encargado/empleado no ve la sección.
- [ ] Avisos: salida de geocerca, incidencia nueva, tarea asignada, tarea próxima (crea una con vencimiento mañana), vencida, incidencia pendiente. Contador y «Marcar como leído».
- [ ] Configuración: logo (aparece en cabecera e informes), jornada, pausas, GPS, alertas, añadir/quitar administrador.

## 8. Seguridad
- [ ] Con dos empresas de prueba: un admin no ve ni modifica datos de la otra (URL/consola).
- [ ] Empleado: no ve a otros empleados, ni mapa, ni auditoría.
- [ ] Empleado no puede cerrar sus incidencias ni editar sus fichajes/tareas (probado en consola).
- [ ] Empleado desactivado no accede.
- [ ] Advisors → Security sin críticos.

## 9. Prueba final de empresa real
Crear empresa → admin → crear equipo → invitar empleado → aceptar → asignar equipo → crear geocerca → fichar → GPS → mapa en vivo → salir de la geocerca → incidencia automática → revisar → cerrar → tarea → completar → fichaje con pausas → horas → Panel → Informe → CSV/PDF → Auditoría.