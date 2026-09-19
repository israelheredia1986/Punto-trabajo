(function(){
  const STATUS_LABELS={
    pending:'Pendiente',
    in_progress:'En curso',
    completed:'Completada',
    cancelled:'Cancelada'
  };
  const INCIDENT_LABELS={open:'Abierta',review:'En revisión',closed:'Cerrada'};
  const PRIORITIES={1:'Alta',2:'Media',3:'Baja'};
  let directoryCache=null;

  function s(){ return Auth.getSession(); }
  function real(){ return !!(window.PuntoSupabase?.enabled && s()?.provider==='supabase'); }
  function esc(v){
    return String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function toastSafe(message){ if(typeof toast==='function') toast(message); }
  function localDate(value){
    if(!value) return '—';
    return new Date(value).toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric'});
  }
  function localDateTime(value){
    if(!value) return '—';
    return new Date(value).toLocaleString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  }
  function time(value){
    if(!value) return '—';
    return new Date(value).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
  }
  function todayString(){ return new Date().toLocaleDateString('en-CA'); }
  function emptyRow(cols,text){ return `<tr><td colspan="${cols}" class="empty">${esc(text)}</td></tr>`; }
  function main(){ return document.querySelector('main'); }

  async function directory(){
    const session=s();
    if(!session) return {people:[],teams:[]};
    if(!real()){
      const people=typeof teamEmployees==='function' ? teamEmployees().map(e=>({id:e.id,name:e.name,role:e.role,team:e.team,teamId:e.team})) : [];
      const teams=[...new Set(people.map(p=>p.team))].map(name=>({id:name,name}));
      directoryCache={people,teams};
      return directoryCache;
    }
    if(directoryCache && directoryCache.companyId===session.companyId) return directoryCache;

    const client=PuntoSupabase.client;
    const {data:members,error:memberError}=await client
      .from('company_memberships')
      .select('user_id,role,status,job_title')
      .eq('company_id',session.companyId)
      .eq('status','active');
    if(memberError) throw memberError;
    const ids=(members||[]).map(m=>m.user_id);

    let profiles=[];
    if(ids.length){
      const {data,error}=await client.from('profiles').select('id,full_name,email').in('id',ids);
      if(error) throw error;
      profiles=data||[];
    }
    const {data:teams,error:teamError}=await client.from('teams').select('id,name,supervisor_id').eq('company_id',session.companyId).order('name');
    if(teamError) throw teamError;
    const teamIds=(teams||[]).map(t=>t.id);
    let teamRows=[];
    if(teamIds.length){
      const {data,error}=await client.from('team_members').select('team_id,user_id').in('team_id',teamIds);
      if(error) throw error;
      teamRows=data||[];
    }
    const teamMap=new Map((teams||[]).map(t=>[t.id,t]));
    const memberships=new Map((members||[]).map(m=>[m.user_id,m]));
    const profileMap=new Map(profiles.map(p=>[p.id,p]));
    const userTeams=new Map();
    teamRows.forEach(row=>{ if(!userTeams.has(row.user_id)) userTeams.set(row.user_id,[]); userTeams.get(row.user_id).push(row.team_id); });
    const people=(members||[]).map(m=>{
      const profile=profileMap.get(m.user_id)||{};
      const teamId=(userTeams.get(m.user_id)||[])[0]||null;
      const team=teamId ? teamMap.get(teamId) : null;
      return {
        id:m.user_id,
        name:profile.full_name||'Sin nombre',
        email:profile.email||'',
        role:m.role,
        roleLabel:m.role==='admin'?'Administrador':m.role==='supervisor'?'Encargado':'Empleado',
        jobTitle:m.job_title||'',
        teamId,
        team:team?.name||'Sin equipo'
      };
    });
    directoryCache={companyId:session.companyId,people,teams:teams||[],memberships,teamMap};
    return directoryCache;
  }

  function shellLoading(active,title,text,action=''){
    shell(active,pageTitle(title,text,action)+`<section class="card"><div class="empty">Cargando datos de Supabase…</div></section>`);
  }

  async function loadTasksReal(){
    const session=s();
    const {data,error}=await PuntoSupabase.client
      .from('tasks')
      .select('id,title,description,assigned_to,team_id,priority,status,due_at,created_by,created_at,updated_at')
      .eq('company_id',session.companyId)
      .order('due_at',{ascending:true,nullsFirst:false})
      .order('created_at',{ascending:false});
    if(error) throw error;
    const d=await directory();
    const people=new Map(d.people.map(p=>[p.id,p]));
    return (data||[]).map(t=>({...t,person:people.get(t.assigned_to)||null,team:d.teamMap?.get(t.team_id)||null}));
  }

  function taskRows(items){
    return items.map(t=>{
      const cls=t.status==='completed'?'online':t.status==='cancelled'?'offline':t.priority===1?'alert':'pause';
      const actions=t.status==='completed' ? '<span class="muted">Finalizada</span>' : `<select aria-label="Estado de ${esc(t.title)}" onchange="PuntoOps.updateTaskStatus('${t.id}',this.value)"><option value="${t.status}">${STATUS_LABELS[t.status]||t.status}</option><option value="in_progress">En curso</option><option value="completed">Completada</option><option value="cancelled">Cancelada</option></select>`;
      return `<tr><td><b>${esc(t.title)}</b><br><span class="muted">${esc(t.description||'Sin descripción')}</span></td><td>${esc(t.person?.name||'Sin asignar')}</td><td>${esc(t.team?.name||'Sin equipo')}</td><td>${esc(PRIORITIES[t.priority]||t.priority)}</td><td><span class="status ${cls}">${esc(STATUS_LABELS[t.status]||t.status)}</span></td><td>${esc(t.due_at?localDate(t.due_at):'Sin fecha')}</td><td>${actions}</td></tr>`;
    }).join('') || emptyRow(7,'No hay tareas para este ámbito.');
  }

  function taskForm(d){
    const people=d.people.filter(p=>p.role!=='admin');
    return `<section class="card" id="task-form"><h2>Asignar tarea</h2><form class="form" onsubmit="PuntoOps.createTask(event)">
      <label>Título<input name="title" required maxlength="180" placeholder="Ej. Revisar instalación"></label>
      <label>Empleado<select name="assigned_to" required>${people.map(p=>`<option value="${p.id}" data-team="${p.teamId||''}">${esc(p.name)} · ${esc(p.team)}</option>`).join('')}</select></label>
      <div class="form-row"><label>Fecha<input type="date" name="due_date" value="${todayString()}"></label><label>Prioridad<select name="priority"><option value="1">Alta</option><option value="2" selected>Media</option><option value="3">Baja</option></select></label></div>
      <label>Descripción<textarea name="description" rows="4" maxlength="5000" placeholder="Detalles de la tarea"></textarea></label>
      <button class="btn primary">Asignar tarea</button>
    </form></section>`;
  }

  async function tasksPage(){
    const session=s();
    if(!session) return renderLogin();
    if(!real()){
      const ts=typeof teamTasks==='function' ? teamTasks() : [];
      const form=session.role==='employee' ? `<section class="card"><h2>Mis tareas</h2><p class="muted">La cuenta demo conserva la simulación local.</p></section>` : taskForm({people:typeof teamEmployees==='function'?teamEmployees().map(e=>({id:e.id,name:e.name,team:e.team,teamId:e.team})):[]});
      shell('tasks',pageTitle('Tareas','En el modo demo se mantiene el comportamiento local.',session.role==='employee'?'':'<button class="btn primary" onclick="PuntoOps.focus(\'task-form\')">+ Asignar tarea</button>')+`<div class="grid two"><section class="card"><div class="section-head"><h2>Hoy</h2></div>${ts.map(t=>`<div class="task"><b>${esc(t[0])}</b><span class="muted">${esc(t[1])} · Prioridad ${esc(t[2])}</span><div style="margin-top:8px"><span class="status">${esc(t[3])}</span></div></div>`).join('')||'<div class="empty">No hay tareas.</div>'}</section>${form}</div>`);
      return;
    }
    shellLoading('tasks','Tareas','Asignación y seguimiento en Supabase.','<button class="btn primary" onclick="PuntoOps.focus(\'task-form\')">+ Asignar tarea</button>');
    try{
      const [items,d]=await Promise.all([loadTasksReal(),directory()]);
      const editable=session.role!=='employee';
      main().innerHTML=pageTitle('Tareas','Asignación y seguimiento en Supabase.',editable?'<button class="btn primary" onclick="PuntoOps.focus(\'task-form\')">+ Asignar tarea</button>':'')+
        `<div class="grid two"><section class="card"><div class="section-head"><h2>Tareas</h2><select id="taskStatusFilter" onchange="PuntoOps.filterTasks(this.value)"><option value="">Todos</option><option value="pending">Pendientes</option><option value="in_progress">En curso</option><option value="completed">Completadas</option><option value="cancelled">Canceladas</option></select></div><div class="table-wrap"><table class="table"><thead><tr><th>Tarea</th><th>Empleado</th><th>Equipo</th><th>Prioridad</th><th>Estado</th><th>Vencimiento</th><th>Acción</th></tr></thead><tbody id="taskRows">${taskRows(items)}</tbody></table></div></section>${editable?taskForm(d):'<section class="card"><h2>Mis tareas</h2><p class="muted">Solo puedes consultar y actualizar las tareas asignadas a tu cuenta.</p></section>'}</div>`;
      window.PuntoOps._tasks=items;
    }catch(error){
      console.error('Punto Trabajo · tasks',error);
      main().innerHTML=pageTitle('Tareas','No se pudieron cargar los datos.')+`<section class="card"><div class="empty">${esc(error.message||'Error de Supabase')}</div></section>`;
    }
  }

  function filterTasks(value){
    const rows=document.querySelector('#taskRows');
    if(!rows) return;
    const items=(window.PuntoOps._tasks||[]).filter(t=>!value||t.status===value);
    rows.innerHTML=taskRows(items);
  }

  async function createTask(event){
    event.preventDefault();
    const session=s();
    if(session.role==='employee') return toastSafe('Tu rol no puede asignar tareas.');
    if(!real()) return toastSafe('La cuenta demo no guarda tareas en Supabase.');
    const form=event.currentTarget;
    const fd=new FormData(form);
    const d=await directory();
    const person=d.people.find(p=>p.id===fd.get('assigned_to'));
    if(!person) return toastSafe('El empleado seleccionado ya no está disponible.');
    const due=fd.get('due_date');
    const payload={
      company_id:session.companyId,
      title:String(fd.get('title')||'').trim(),
      description:String(fd.get('description')||'').trim()||null,
      assigned_to:person.id,
      team_id:person.teamId||null,
      priority:Number(fd.get('priority')||2),
      status:'pending',
      due_at:due?new Date(`${due}T23:59:59`).toISOString():null,
      created_by:session.id
    };
    if(!payload.title) return toastSafe('Escribe un título.');
    const {error}=await PuntoSupabase.client.from('tasks').insert(payload);
    if(error){ console.error(error); return toastSafe(error.message||'No se pudo crear la tarea.'); }
    toastSafe('Tarea creada correctamente.');
    directoryCache=null;
    tasksPage();
  }

  async function updateTaskStatus(id,statusValue){
    if(!real()) return toastSafe('La cuenta demo no guarda cambios en Supabase.');
    const allowed=['pending','in_progress','completed','cancelled'];
    if(!allowed.includes(statusValue)) return;
    const {error}=await PuntoSupabase.client.from('tasks').update({status:statusValue,updated_at:new Date().toISOString()}).eq('id',id);
    if(error){ console.error(error); return toastSafe(error.message||'No se pudo actualizar la tarea.'); }
    toastSafe('Estado de tarea actualizado.');
    tasksPage();
  }

  function incidentClass(status){ return status==='closed'?'online':status==='review'?'pause':'alert'; }

  async function loadIncidentsReal(){
    const session=s();
    const {data,error}=await PuntoSupabase.client
      .from('incidents')
      .select('id,title,description,user_id,type,status,created_by,resolved_by,created_at,resolved_at,updated_at')
      .eq('company_id',session.companyId)
      .order('created_at',{ascending:false});
    if(error) throw error;
    const d=await directory();
    const people=new Map(d.people.map(p=>[p.id,p]));
    return (data||[]).map(i=>({...i,person:people.get(i.user_id)||null,creator:people.get(i.created_by)||null}));
  }

  function incidentRows(items){
    return items.map(i=>`<tr><td><b>${esc(i.title)}</b><br><span class="muted">${esc(i.type)}${i.description?' · '+esc(i.description):''}</span></td><td>${esc(i.person?.name||'Empresa')}</td><td>${esc(localDateTime(i.created_at))}</td><td><span class="status ${incidentClass(i.status)}">${esc(INCIDENT_LABELS[i.status]||i.status)}</span></td><td><select onchange="PuntoOps.updateIncidentStatus('${i.id}',this.value)"><option value="${i.status}">${INCIDENT_LABELS[i.status]||i.status}</option><option value="open">Abierta</option><option value="review">En revisión</option><option value="closed">Cerrada</option></select><button class="btn secondary" style="margin-left:6px" onclick="PuntoOps.showIncidentDetail('${i.id}')">Detalle</button></td></tr>`).join('')||emptyRow(5,'No hay incidencias visibles.');
  }

  function incidentForm(session,d){
    const employee=session.role==='employee';
    const people=employee?[d.people.find(p=>p.id===session.id)].filter(Boolean):d.people.filter(p=>p.role!=='admin');
    return `<section class="card" id="incident-form"><h2>Nueva incidencia</h2><form class="form" onsubmit="PuntoOps.createIncident(event)">
      <label>Título<input name="title" required maxlength="180" placeholder="Ej. Fichaje sin salida"></label>
      ${employee?`<input type="hidden" name="user_id" value="${session.id}"><div class="muted">Se registrará a tu nombre.</div>`:`<label>Empleado<select name="user_id"><option value="">Incidencia general de empresa</option>${people.map(p=>`<option value="${p.id}">${esc(p.name)} · ${esc(p.team)}</option>`).join('')}</select></label>`}
      <label>Tipo<select name="type"><option value="operational">Operativa</option><option value="geofencing">Geofencing</option><option value="time_tracking">Fichaje</option></select></label>
      <label>Descripción<textarea name="description" rows="4" maxlength="5000" placeholder="Describe lo ocurrido"></textarea></label>
      <button class="btn primary">Crear incidencia</button>
    </form></section>`;
  }

  async function incidentsPage(){
    const session=s();
    if(!session) return renderLogin();
    if(!real()){
      const is=typeof teamIncidents==='function'?teamIncidents():[];
      shell('incidents',pageTitle('Incidencias','La cuenta demo mantiene datos simulados.','<button class="btn primary" onclick="PuntoOps.focus(\'incident-form\')">+ Nueva incidencia</button>')+`<section class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Incidencia</th><th>Empleado</th><th>Fecha</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${is.map(i=>`<tr><td><b>${esc(i[0])}</b></td><td>${esc(i[1])}</td><td>${esc(i[2])}</td><td><span class="status">${esc(i[3])}</span></td><td>Demo</td></tr>`).join('')||emptyRow(5,'No hay incidencias.')}</tbody></table></div></section>`);
      return;
    }
    shellLoading('incidents','Incidencias','Gestión de incidencias en Supabase.','<button class="btn primary" onclick="PuntoOps.focus(\'incident-form\')">+ Nueva incidencia</button>');
    try{
      const [items,d]=await Promise.all([loadIncidentsReal(),directory()]);
      main().innerHTML=pageTitle('Incidencias','Gestión de incidencias en Supabase.','<button class="btn primary" onclick="PuntoOps.focus(\'incident-form\')">+ Nueva incidencia</button>')+
        `<div class="grid two"><section class="card"><div class="section-head"><h2>Incidencias</h2><select id="incidentStatusFilter" onchange="PuntoOps.filterIncidents(this.value)"><option value="">Todos</option><option value="open">Abiertas</option><option value="review">En revisión</option><option value="closed">Cerradas</option></select></div><div class="table-wrap"><table class="table"><thead><tr><th>Incidencia</th><th>Empleado</th><th>Fecha</th><th>Estado</th><th>Acción</th></tr></thead><tbody id="incidentRows">${incidentRows(items)}</tbody></table></div></section>${incidentForm(session,d)}</div>`;
      window.PuntoOps._incidents=items;
    }catch(error){
      console.error('Punto Trabajo · incidents',error);
      main().innerHTML=pageTitle('Incidencias','No se pudieron cargar los datos.')+`<section class="card"><div class="empty">${esc(error.message||'Error de Supabase')}</div></section>`;
    }
  }

  function filterIncidents(value){
    const rows=document.querySelector('#incidentRows');
    if(!rows) return;
    rows.innerHTML=incidentRows((window.PuntoOps._incidents||[]).filter(i=>!value||i.status===value));
  }

  async function createIncident(event){
    event.preventDefault();
    if(!real()) return toastSafe('La cuenta demo no guarda incidencias en Supabase.');
    const session=s();
    const fd=new FormData(event.currentTarget);
    const target=String(fd.get('user_id')||'')||null;
    const payload={
      company_id:session.companyId,
      title:String(fd.get('title')||'').trim(),
      description:String(fd.get('description')||'').trim()||null,
      user_id:target,
      type:String(fd.get('type')||'operational'),
      status:'open',
      created_by:session.id
    };
    if(!payload.title) return toastSafe('Escribe un título.');
    const {error}=await PuntoSupabase.client.from('incidents').insert(payload);
    if(error){ console.error(error); return toastSafe(error.message||'No se pudo crear la incidencia.'); }
    toastSafe('Incidencia creada correctamente.');
    incidentsPage();
  }

  function showIncidentDetail(id){
    const i=(window.PuntoOps._incidents||[]).find(x=>x.id===id);
    if(!i)return;
    const modal=document.createElement('div'); modal.className='modal-backdrop';
    const wrap=document.createElement('div'); wrap.className='modal';
    wrap.innerHTML='<div class="section-head"><h2>Detalle de incidencia</h2><button class="btn secondary">Cerrar</button></div><p><b>'+esc(i.title)+'</b></p><p>Empleado: '+esc(i.person?.name||'Empresa')+'<br>Tipo: '+esc(i.type)+'<br>Estado: '+esc(INCIDENT_LABELS[i.status]||i.status)+'<br>Creada: '+esc(localDateTime(i.created_at))+'</p><p>'+esc(i.description||'Sin descripción')+'</p>'+(i.resolved_at?'<p>Resuelta: '+esc(localDateTime(i.resolved_at))+'</p>':'');
    wrap.querySelector('button').onclick=()=>modal.remove(); modal.appendChild(wrap); document.body.appendChild(modal);
  }
  async function updateIncidentStatus(id,statusValue){
    if(!real()) return toastSafe('La cuenta demo no guarda cambios en Supabase.');
    if(!['open','review','closed'].includes(statusValue)) return;
    const patch={status:statusValue,updated_at:new Date().toISOString()};
    if(statusValue==='closed'){ patch.resolved_by=s().id; patch.resolved_at=new Date().toISOString(); }
    else { patch.resolved_by=null; patch.resolved_at=null; }
    const {error}=await PuntoSupabase.client.from('incidents').update(patch).eq('id',id);
    if(error){ console.error(error); return toastSafe(error.message||'No se pudo actualizar la incidencia.'); }
    toastSafe('Estado de incidencia actualizado.');
    incidentsPage();
  }

  function rangeFrom(period,dateString){
    const base=new Date(`${dateString||todayString()}T00:00:00`);
    if(Number.isNaN(base.getTime())) return null;
    let start=new Date(base);
    if(period==='week'){
      const day=(start.getDay()+6)%7;
      start.setDate(start.getDate()-day);
    }else if(period==='month'){
      start.setDate(1);
    }
    let end=new Date(start);
    if(period==='month') end.setMonth(end.getMonth()+1);
    else if(period==='week') end.setDate(end.getDate()+7);
    else end.setDate(end.getDate()+1);
    return {start,end};
  }

  async function loadHoursReal(period,dateString){
    const session=s();
    const range=rangeFrom(period,dateString);
    if(!range) throw new Error('Fecha no válida.');
    const {data,error}=await PuntoSupabase.client
      .from('time_entries')
      .select('id,user_id,started_at,ended_at,status,start_latitude,start_longitude,end_latitude,end_longitude,start_geofence_id,end_geofence_id,notes')
      .eq('company_id',session.companyId)
      .gte('started_at',range.start.toISOString())
      .lt('started_at',range.end.toISOString())
      .order('started_at',{ascending:false});
    if(error) throw error;
    const entries=data||[];
    const ids=entries.map(e=>e.id);
    let breaks=[];
    if(ids.length){
      const res=await PuntoSupabase.client.from('time_entry_breaks').select('id,time_entry_id,started_at,ended_at,reason').in('time_entry_id',ids);
      if(res.error) throw res.error;
      breaks=res.data||[];
    }
    const breakMap=new Map();
    breaks.forEach(b=>{ if(!breakMap.has(b.time_entry_id)) breakMap.set(b.time_entry_id,[]); breakMap.get(b.time_entry_id).push(b); });
    const d=await directory();
    const people=new Map(d.people.map(p=>[p.id,p]));
    return entries.map(e=>({...e,time_entry_breaks:breakMap.get(e.id)||[],person:people.get(e.user_id)||null}));
  }

  function hoursRows(items){
    return items.map(e=>{
      const duration=typeof TimeTracking!=='undefined'?TimeTracking.formatDuration(TimeTracking.durationMs(e)): '—';
      const flags=[];
      if(e.start_latitude!=null && !e.start_geofence_id) flags.push('Entrada sin geocerca');
      if(e.end_latitude!=null && !e.end_geofence_id) flags.push('Salida sin geocerca');
      const gps=e.start_latitude!=null||e.end_latitude!=null;
      return `<tr><td><b>${esc(e.person?.name||'Usuario')}</b><br><span class="muted">${esc(e.person?.team||'')}</span></td><td>${esc(localDateTime(e.started_at))}</td><td>${esc(e.ended_at?localDateTime(e.ended_at):'En curso')}</td><td><b>${esc(duration)}</b></td><td>${gps?'<span class="status online">GPS</span>':'<span class="status alert">Sin GPS</span>'} ${flags.length?flags.map(f=>`<span class="status alert">${esc(f)}</span>`).join(' '):''}</td><td>${e.status==='open'?'<span class="status pause">Abierta</span>':'<span class="status online">Cerrada</span>'} <button class="btn secondary" onclick="PuntoOps.showEntryDetail('${e.id}')">Detalle</button></td></tr>`;
    }).join('')||emptyRow(6,'No hay fichajes en el periodo seleccionado.');
  }

  function showEntryDetail(id){
    const e=(window.PuntoOps._hours||[]).find(x=>x.id===id); if(!e)return;
    const breaks=e.time_entry_breaks||[];
    const total=typeof TimeTracking!=='undefined'?TimeTracking.formatDuration(TimeTracking.durationMs(e)):'—';
    const html=`<div class="modal-backdrop" onclick="this.remove()"><div class="modal" onclick="event.stopPropagation()"><div class="section-head"><h2>Detalle del fichaje</h2><button class="btn secondary" onclick="this.closest('.modal-backdrop').remove()">Cerrar</button></div><p><b>${esc(e.person?.name||'Usuario')}</b></p><p>Entrada: ${esc(localDateTime(e.started_at))}<br>Salida: ${esc(e.ended_at?localDateTime(e.ended_at):'En curso')}<br>Tiempo trabajado: <b>${esc(total)}</b></p><h3>Pausas</h3>${breaks.map(b=>`<div class="task">${esc(b.reason||'Pausa')} · ${esc(localDateTime(b.started_at))} → ${esc(b.ended_at?localDateTime(b.ended_at):'En curso')}</div>`).join('')||'<div class="empty">Sin pausas.</div>'}</div></div>`;
    document.body.insertAdjacentHTML('beforeend',html);
  }

  async function hoursPage(){
    const session=s();
    if(!session) return renderLogin();
    const date=todayString();
    if(!real()){
      const es=typeof teamEmployees==='function'?teamEmployees():[];
      shell('hours',pageTitle('Horarios y fichajes','La cuenta demo muestra fichajes simulados.','<button class="btn primary" onclick="window.print()">Exportar / imprimir</button>')+`<section class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Empleado</th><th>Entrada</th><th>Salida</th><th>Duración</th><th>Flags</th><th>Estado</th></tr></thead><tbody>${es.map((e,i)=>`<tr><td><b>${esc(e.name)}</b></td><td>08:0${i}</td><td>${e.status==='offline'?'17:12':'—'}</td><td>${esc(e.hours)}</td><td>—</td><td>${status(e.status)}</td></tr>`).join('')}</tbody></table></div></section>`);
      return;
    }
    shellLoading('hours','Horarios y fichajes','Consulta de fichajes reales desde Supabase.','<button class="btn primary" onclick="window.print()">Exportar / imprimir</button>');
    try{
      const items=await loadHoursReal('day',date);
      renderHours(items,'day',date);
    }catch(error){
      console.error('Punto Trabajo · hours',error);
      main().innerHTML=pageTitle('Horarios y fichajes','No se pudieron cargar los datos.')+`<section class="card"><div class="empty">${esc(error.message||'Error de Supabase')}</div></section>`;
    }
  }

  async function refreshHours(){
    const period=document.querySelector('#hoursPeriod')?.value||'day';
    const date=document.querySelector('#hoursDate')?.value||todayString();
    const box=document.querySelector('#hoursRows');
    if(box) box.innerHTML=emptyRow(6,'Cargando…');
    try{
      const items=await loadHoursReal(period,date);
      if(box) box.innerHTML=hoursRows(items);
    }catch(error){
      console.error(error);
      if(box) box.innerHTML=emptyRow(6,error.message||'No se pudieron cargar los fichajes.');
    }
  }

  function renderHours(items,period,date){
    main().innerHTML=pageTitle('Horarios y fichajes','Consulta diaria, semanal o mensual y usa el diálogo de impresión para generar PDF.','<button class="btn primary" onclick="window.print()">Exportar / imprimir</button>')+
      `<section class="card"><div class="filters"><select id="hoursPeriod" onchange="PuntoOps.refreshHours()"><option value="day" ${period==='day'?'selected':''}>Día</option><option value="week" ${period==='week'?'selected':''}>Semana</option><option value="month" ${period==='month'?'selected':''}>Mes</option></select><input id="hoursDate" type="date" value="${esc(date)}" onchange="PuntoOps.refreshHours()"></div><div class="table-wrap" style="margin-top:15px"><table class="table"><thead><tr><th>Empleado</th><th>Entrada</th><th>Salida</th><th>Duración</th><th>Flags</th><th>Estado</th></tr></thead><tbody id="hoursRows">${hoursRows(items)}</tbody></table></div></section>`;
  }

  function focus(id){ document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'}); }

  window.PuntoOps={
    tasksPage,
    incidentsPage,
    hoursPage,
    createTask,
    updateTaskStatus,
    filterTasks,
    createIncident,
    updateIncidentStatus,
    showIncidentDetail,
    filterIncidents,
    refreshHours,
    focus,
    _tasks:[],
    _incidents:[],\n    _hours:[]
  };

  window.tasksPage=tasksPage;
  window.incidentsPage=incidentsPage;
  window.hoursPage=hoursPage;
})();
