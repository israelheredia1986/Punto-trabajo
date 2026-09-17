(function(){
  const TASK_LABELS={pending:'Pendiente',in_progress:'En curso',completed:'Completada',cancelled:'Cancelada'};
  const INCIDENT_LABELS={open:'Abierta',review:'En revisión',closed:'Cerrada'};

  function session(){ return Auth.getSession(); }
  function real(){ return !!(window.PuntoSupabase?.enabled && session()?.provider==='supabase'); }
  function esc(v){ return String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function toastSafe(v){ if(typeof toast==='function') toast(v); }
  function main(){ return document.querySelector('main'); }
  function today(){ return new Date().toLocaleDateString('en-CA'); }
  function localDate(v){ return v ? new Date(v).toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric'}) : '—'; }
  function localDateTime(v){ return v ? new Date(v).toLocaleString('es-ES',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—'; }
  function emptyRow(cols,text){ return `<tr><td colspan="${cols}" class="empty">${esc(text)}</td></tr>`; }
  function shellLoading(active,title,text,action=''){ shell(active,pageTitle(title,text,action)+`<section class="card"><div class="empty">Cargando datos de Supabase…</div></section>`); }

  async function directory(){
    const s=session();
    if(!s) return {people:[],teamMap:new Map()};
    if(!real()){
      const source=typeof teamEmployees==='function'?teamEmployees():[];
      return {people:source.map(e=>({id:e.id,name:e.name,team:e.team||'Sin equipo',role:e.role||'employee'})),teamMap:new Map()};
    }
    const client=PuntoSupabase.client;
    const {data:members,error:memberError}=await client.from('company_memberships').select('user_id,role,job_title').eq('company_id',s.companyId).eq('status','active');
    if(memberError) throw memberError;
    const ids=(members||[]).map(x=>x.user_id);
    let profiles=[];
    if(ids.length){
      const res=await client.from('profiles').select('id,full_name,email').in('id',ids);
      if(res.error) throw res.error;
      profiles=res.data||[];
    }
    const tr=await client.from('teams').select('id,name,supervisor_id').eq('company_id',s.companyId);
    if(tr.error) throw tr.error;
    const teams=tr.data||[];
    const teamIds=teams.map(t=>t.id);
    let links=[];
    if(teamIds.length){
      const res=await client.from('team_members').select('team_id,user_id').in('team_id',teamIds);
      if(res.error) throw res.error;
      links=res.data||[];
    }
    const pmap=new Map(profiles.map(p=>[p.id,p]));
    const tmap=new Map(teams.map(t=>[t.id,t]));
    const userTeam=new Map();
    links.forEach(x=>{ if(!userTeam.has(x.user_id)) userTeam.set(x.user_id,x.team_id); });
    return {people:(members||[]).map(m=>{const p=pmap.get(m.user_id)||{};const tid=userTeam.get(m.user_id);return {id:m.user_id,name:p.full_name||'Sin nombre',email:p.email||'',role:m.role,jobTitle:m.job_title||'',teamId:tid||null,team:tmap.get(tid)?.name||'Sin equipo'};}),teamMap:tmap};
  }

  function range(period,dateString){
    const base=new Date(`${dateString||today()}T00:00:00`);
    if(Number.isNaN(base.getTime())) return null;
    let start=new Date(base);
    if(period==='week'){
      const day=(start.getDay()+6)%7;
      start.setDate(start.getDate()-day);
    }else if(period==='month') start.setDate(1);
    const end=new Date(start);
    if(period==='month') end.setMonth(end.getMonth()+1);
    else if(period==='week') end.setDate(end.getDate()+7);
    else end.setDate(end.getDate()+1);
    return {start,end};
  }

  async function loadDashboard(){
    const s=session();
    const client=PuntoSupabase.client;
    const d=await directory();
    const [openEntries,todayTasks,recentIncidents,recentLocations]=await Promise.all([
      client.from('time_entries').select('id,user_id,started_at').eq('company_id',s.companyId).eq('status','open'),
      client.from('tasks').select('id,title,description,assigned_to,priority,status,due_at').eq('company_id',s.companyId).gte('due_at',new Date(`${today()}T00:00:00`).toISOString()).lt('due_at',new Date(new Date(`${today()}T00:00:00`).getTime()+86400000).toISOString()).order('due_at',{ascending:true}).limit(8),
      client.from('incidents').select('id,title,user_id,type,status,created_at').eq('company_id',s.companyId).order('created_at',{ascending:false}).limit(6),
      client.from('location_events').select('id,user_id,inside_geofence,geofence_id,recorded_at').eq('company_id',s.companyId).gte('recorded_at',new Date(Date.now()-24*60*60*1000).toISOString()).order('recorded_at',{ascending:false}).limit(200)
    ]);
    for(const res of [openEntries,todayTasks,recentIncidents,recentLocations]) if(res.error) throw res.error;
    const people=new Map(d.people.map(p=>[p.id,p]));
    const outside=(recentLocations.data||[]).filter(x=>x.inside_geofence===false);
    const activeIds=new Set((openEntries.data||[]).map(x=>x.user_id));
    const activePeople=d.people.filter(p=>activeIds.has(p.id));
    return {
      people:d.people, activePeople,
      tasks:(todayTasks.data||[]).map(t=>({...t,person:people.get(t.assigned_to)})),
      incidents:(recentIncidents.data||[]).map(i=>({...i,person:people.get(i.user_id)})),
      geofenceAlerts:outside.length
    };
  }

  function statusBadgeIncident(status){ return `<span class="status ${status==='closed'?'online':status==='review'?'pause':'alert'}">${esc(INCIDENT_LABELS[status]||status)}</span>`; }
  function taskBadge(t){ return `<span class="status ${t.status==='completed'?'online':t.priority===1?'alert':'pause'}">${esc(TASK_LABELS[t.status]||t.status)}</span>`; }

  async function dashboard(){
    const s=session();
    if(!s) return renderLogin();
    if(!Auth.can('dashboard')) return go('worker');
    if(!real()){ return window.__PuntoOriginalDashboard ? window.__PuntoOriginalDashboard() : shell('dashboard',pageTitle('Panel de gestión','Modo demo.')); }
    shellLoading('dashboard','Panel de gestión',`${esc(s.company)} · datos reales de Supabase.`,'<button class="btn primary" onclick="PuntoDashboard.refresh()">Actualizar</button>');
    try{
      const data=await loadDashboard();
      const incidents=data.incidents.slice(0,4), tasks=data.tasks.slice(0,6);
      main().innerHTML=pageTitle('Panel de gestión',`${esc(s.company)} · datos actualizados ${new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}`,'<button class="btn primary" onclick="PuntoDashboard.refresh()">Actualizar</button>')+
      `<div class="grid metrics">
        <div class="card metric"><small>Empleados visibles</small><strong>${data.people.length}</strong><span class="muted">según permisos</span></div>
        <div class="card metric"><small>Activos ahora</small><strong>${data.activePeople.length}</strong><span class="muted">con jornada abierta</span></div>
        <div class="card metric"><small>Tareas de hoy</small><strong>${data.tasks.length}</strong><span class="muted">${data.tasks.filter(t=>t.status!=='completed').length} pendientes</span></div>
        <div class="card metric"><small>Geofencing</small><strong>${data.geofenceAlerts}</strong><span class="muted">salidas de zona últimas 24 h</span></div>
        <div class="card metric"><small>Incidencias</small><strong>${data.incidents.filter(i=>i.status!=='closed').length}</strong><span class="muted">abiertas o en revisión</span></div>
      </div>
      <div class="grid two" style="margin-top:15px">
        <section class="card"><div class="section-head"><h2>Estado del equipo</h2><button class="btn secondary" onclick="go('employees')">Ver empleados</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Empleado</th><th>Equipo</th><th>Estado</th></tr></thead><tbody>${data.people.slice(0,10).map(p=>`<tr><td><b>${esc(p.name)}</b><br><span class="muted">${esc(p.jobTitle||p.role)}</span></td><td>${esc(p.team)}</td><td>${data.activePeople.some(a=>a.id===p.id)?'<span class="status online">Activo</span>':'<span class="status offline">Inactivo</span>'}</td></tr>`).join('')||emptyRow(3,'No hay empleados visibles.')}</tbody></table></div></section>
        <section class="card"><div class="section-head"><h2>Incidencias recientes</h2><button class="btn secondary" onclick="go('incidents')">Ver todas</button></div>${incidents.map(i=>`<div class="task"><b>${esc(i.title)}</b><span class="muted">${esc(i.person?.name||'Empresa')} · ${localDateTime(i.created_at)}</span><div style="margin-top:7px">${statusBadgeIncident(i.status)}</div></div>`).join('')||'<div class="empty">No hay incidencias.</div>'}</section>
      </div>
      <section class="card" style="margin-top:15px"><div class="section-head"><h2>Tareas de hoy</h2><button class="btn secondary" onclick="go('tasks')">Gestionar</button></div>${tasks.map(t=>`<div class="task"><b>${esc(t.title)}</b><span class="muted">${esc(t.person?.name||'Sin asignar')} · vence ${localDate(t.due_at)}</span> ${taskBadge(t)}</div>`).join('')||'<div class="empty">No hay tareas con vencimiento hoy.</div>'}</section>`;
    }catch(error){
      console.error('Punto Trabajo · dashboard',error);
      main().innerHTML=pageTitle('Panel de gestión','No se pudieron cargar los datos de Supabase.')+`<section class="card"><div class="empty">${esc(error.message||'Error de Supabase')}</div></section>`;
    }
  }

  async function loadReport(period,dateString){
    const s=session();
    const r=range(period,dateString);
    if(!r) throw new Error('Fecha no válida.');
    const client=PuntoSupabase.client;
    const [d,entries,tasks,incidents,locations]=await Promise.all([
      directory(),
      client.from('time_entries').select('id,user_id,started_at,ended_at,status').eq('company_id',s.companyId).gte('started_at',r.start.toISOString()).lt('started_at',r.end.toISOString()),
      client.from('tasks').select('id,assigned_to,status,priority,due_at,created_at').eq('company_id',s.companyId).gte('created_at',r.start.toISOString()).lt('created_at',r.end.toISOString()),
      client.from('incidents').select('id,user_id,status,type,created_at').eq('company_id',s.companyId).gte('created_at',r.start.toISOString()).lt('created_at',r.end.toISOString()),
      client.from('location_events').select('id,user_id,inside_geofence,recorded_at').eq('company_id',s.companyId).gte('recorded_at',r.start.toISOString()).lt('recorded_at',r.end.toISOString())
    ]);
    for(const res of [entries,tasks,incidents,locations]) if(res.error) throw res.error;
    const entryRows=entries.data||[];
    let breaks=[];
    const ids=entryRows.map(x=>x.id);
    if(ids.length){ const res=await client.from('time_entry_breaks').select('time_entry_id,started_at,ended_at').in('time_entry_id',ids); if(res.error) throw res.error; breaks=res.data||[]; }
    const breakMap=new Map();
    breaks.forEach(b=>{if(!breakMap.has(b.time_entry_id))breakMap.set(b.time_entry_id,[]);breakMap.get(b.time_entry_id).push(b);});
    const personMap=new Map(d.people.map(p=>[p.id,p]));
    const totals=new Map();
    function rec(id){ if(!totals.has(id)) totals.set(id,{hours:0,tasks:0,completed:0,incidents:0,geofence:0}); return totals.get(id); }
    for(const e of entryRows){ let ms=e.ended_at?new Date(e.ended_at)-new Date(e.started_at):Date.now()-new Date(e.started_at); for(const b of (breakMap.get(e.id)||[])) ms-=Math.max(0,(new Date(b.ended_at||new Date())-new Date(b.started_at))); rec(e.user_id).hours+=Math.max(0,ms)/3600000; }
    for(const t of (tasks.data||[])){ if(t.assigned_to){rec(t.assigned_to).tasks++; if(t.status==='completed') rec(t.assigned_to).completed++;} }
    for(const i of (incidents.data||[])) if(i.user_id) rec(i.user_id).incidents++;
    for(const l of (locations.data||[])) if(l.user_id && l.inside_geofence===false) rec(l.user_id).geofence++;
    return {people:d.people,totals,range:r,tasks:tasks.data||[],incidents:incidents.data||[]};
  }

  function reportRows(data){
    return data.people.map(p=>{const x=data.totals.get(p.id)||{hours:0,tasks:0,completed:0,incidents:0,geofence:0};return `<tr><td><b>${esc(p.name)}</b><br><span class="muted">${esc(p.team)}</span></td><td>${x.hours.toFixed(2)} h</td><td>${x.tasks}</td><td>${x.completed}</td><td>${x.incidents}</td><td>${x.geofence}</td></tr>`;}).join('')||emptyRow(6,'No hay datos para este periodo.');
  }

  async function reportsPage(){
    const s=session();
    if(!s) return renderLogin();
    if(!Auth.can('reports')) return forbidden();
    if(!real()){
      shell('reports',pageTitle('Informes','El modo demo mostrará datos simulados cuando estén disponibles.','<button class="btn primary" onclick="window.print()">Exportar / imprimir</button>')+`<section class="card"><div class="empty">Conecta Supabase para generar informes reales.</div></section>`);
      return;
    }
    shellLoading('reports','Informes',`${esc(s.company)} · resumen de actividad.`,'<button class="btn primary" onclick="window.print()">Exportar / imprimir</button>');
    try{
      const period='month',date=today(),data=await loadReport(period,date);
      renderReport(data,period,date);
    }catch(error){
      console.error('Punto Trabajo · reports',error);
      main().innerHTML=pageTitle('Informes','No se pudieron cargar los datos.')+`<section class="card"><div class="empty">${esc(error.message||'Error de Supabase')}</div></section>`;
    }
  }

  async function refreshReports(){
    const period=document.querySelector('#reportPeriod')?.value||'month';
    const date=document.querySelector('#reportDate')?.value||today();
    try{ const data=await loadReport(period,date); renderReport(data,period,date); }
    catch(error){ console.error(error); toastSafe(error.message||'No se pudo actualizar el informe.'); }
  }

  function renderReport(data,period,date){
    const total=[...data.totals.values()].reduce((a,x)=>({hours:a.hours+x.hours,tasks:a.tasks+x.tasks,completed:a.completed+x.completed,incidents:a.incidents+x.incidents,geofence:a.geofence+x.geofence}),{hours:0,tasks:0,completed:0,incidents:0,geofence:0});
    main().innerHTML=pageTitle('Informes','Resumen de horas, tareas, incidencias y geofencing.','<button class="btn primary" onclick="window.print()">Exportar / imprimir</button>')+
      `<section class="card"><div class="filters"><select id="reportPeriod" onchange="PuntoDashboard.refreshReports()"><option value="day" ${period==='day'?'selected':''}>Día</option><option value="week" ${period==='week'?'selected':''}>Semana</option><option value="month" ${period==='month'?'selected':''}>Mes</option></select><input id="reportDate" type="date" value="${esc(date)}" onchange="PuntoDashboard.refreshReports()"></div></section>
      <div class="grid metrics" style="margin-top:15px"><div class="card metric"><small>Horas</small><strong>${total.hours.toFixed(2)}</strong></div><div class="card metric"><small>Tareas</small><strong>${total.tasks}</strong></div><div class="card metric"><small>Completadas</small><strong>${total.completed}</strong></div><div class="card metric"><small>Incidencias</small><strong>${total.incidents}</strong></div><div class="card metric"><small>Alertas geofence</small><strong>${total.geofence}</strong></div></div>
      <section class="card" style="margin-top:15px"><div class="section-head"><h2>Resumen por empleado</h2></div><div class="table-wrap"><table class="table"><thead><tr><th>Empleado</th><th>Horas</th><th>Tareas</th><th>Completadas</th><th>Incidencias</th><th>Fuera de zona</th></tr></thead><tbody>${reportRows(data)}</tbody></table></div></section>`;
  }

  window.PuntoDashboard={dashboard,refresh:dashboard,reportsPage,refreshReports,_loadReport:loadReport};
  window.__PuntoOriginalDashboard=window.dashboard;
  window.dashboard=dashboard;
  window.reportsPage=reportsPage;
})();
