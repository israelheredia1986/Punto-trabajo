(function(){
  const TASK_LABELS={pending:'Pendiente',in_progress:'En curso',completed:'Completada',cancelled:'Cancelada'};
  const TASK_CLASS={pending:'pause',in_progress:'alert',completed:'online',cancelled:'offline'};
  const INCIDENT_LABELS={open:'Abierta',review:'En revisión',closed:'Cerrada'};

  function s(){return Auth.getSession();}
  function real(){return !!(window.PuntoSupabase?.enabled&&s()?.provider==='supabase');}
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function todayStart(){const d=new Date();d.setHours(0,0,0,0);return d.toISOString();}
  function localTime(v){return v?new Date(v).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}):'—';}
  function localDate(v){return v?new Date(v).toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit'}):'—';}
  function taskBadge(t){return `<span class="status ${TASK_CLASS[t.status]||'offline'}">${esc(TASK_LABELS[t.status]||t.status)}</span>`;}
  function incidentBadge(v){return `<span class="status ${v==='closed'?'online':v==='review'?'pause':'alert'}">${esc(INCIDENT_LABELS[v]||v)}</span>`;}

  async function loadData(){
    const session=s();
    if(!real()){
      const tasks=typeof teamTasks==='function'?teamTasks():[];
      const incidents=typeof teamIncidents==='function'?teamIncidents():[];
      return {tasks:tasks.map(t=>({title:t[0],name:t[1],priority:t[2],status:String(t[3]).toLowerCase().includes('complet')?'completed':String(t[3]).toLowerCase().includes('curso')?'in_progress':'pending',due_at:null})),incidents:incidents.map(i=>({title:i[0],status:String(i[3]).toLowerCase().includes('cerr')?'closed':String(i[3]).toLowerCase().includes('revisión')?'review':'open',created_at:null})),hours:[]};
    }
    const client=PuntoSupabase.client;
    const [tasksRes,incRes,hoursRes]=await Promise.all([
      client.from('tasks').select('id,title,description,priority,status,due_at,created_at').eq('company_id',session.companyId).eq('assigned_to',session.id).order('status').order('due_at',{ascending:true,nullsFirst:false}).limit(8),
      client.from('incidents').select('id,title,type,status,created_at').eq('company_id',session.companyId).eq('user_id',session.id).order('created_at',{ascending:false}).limit(5),
      client.from('time_entries').select('id,started_at,ended_at,status').eq('company_id',session.companyId).eq('user_id',session.id).gte('started_at',todayStart()).order('started_at',{ascending:false})
    ]);
    for(const r of [tasksRes,incRes,hoursRes])if(r.error)throw r.error;
    let breaks=[];const ids=(hoursRes.data||[]).map(x=>x.id);
    if(ids.length){const r=await client.from('time_entry_breaks').select('time_entry_id,started_at,ended_at').in('time_entry_id',ids);if(r.error)throw r.error;breaks=r.data||[];}
    const breakMap=new Map();breaks.forEach(b=>{if(!breakMap.has(b.time_entry_id))breakMap.set(b.time_entry_id,[]);breakMap.get(b.time_entry_id).push(b);});
    const hours=(hoursRes.data||[]).map(e=>({...e,time_entry_breaks:breakMap.get(e.id)||[]}));
    return {tasks:tasksRes.data||[],incidents:incRes.data||[],hours};
  }

  function totalToday(entries){
    return entries.reduce((sum,e)=>sum+(typeof TimeTracking!=='undefined'?TimeTracking.durationMs(e):0),0);
  }

  async function workerPage(){
    const session=s();
    if(!session)return renderLogin();
    if(session.role!=='employee')return go('dashboard');
    shell('worker',pageTitle('Mi jornada','Controla tu jornada, tus tareas y tus incidencias.','<button class="btn secondary" onclick="PuntoWorker.refresh()">Actualizar</button>')+`<section class="employee-mobile"><div class="worker-hero card"><div><span class="eyebrow">Hola</span><h2>${esc(session.name)}</h2><p>${esc(session.company)} · Solo tú puedes ver estos datos.</p></div><div class="worker-live-status"><span class="status offline">Cargando</span><div class="clock" id="workerClock">00:00</div></div></div><div class="grid worker-metrics"><div class="card metric"><small>Tiempo de hoy</small><strong id="workerTodayHours">00:00</strong><span class="muted">incluye pausas descontadas</span></div><div class="card metric"><small>Tareas</small><strong id="workerTaskCount">0</strong><span class="muted">asignadas a ti</span></div><div class="card metric"><small>Incidencias</small><strong id="workerIncidentCount">0</strong><span class="muted">propias</span></div></div><section class="card worker-clock-card"><div class="section-head"><div><h2>Jornada</h2><p class="muted">La ubicación se registra cuando la jornada está activa.</p></div><span class="status offline">Fuera de jornada</span></div><div class="mobile-actions"><button class="btn primary big" data-action="start">Fichar entrada</button><button class="btn secondary big" data-action="none" disabled>Iniciar pausa</button></div><div class="worker-location" id="workerLocationStatus"><span class="status offline">Ubicación en espera</span></div></section><div class="grid two worker-content"><section class="card"><div class="section-head"><h2>Mis tareas</h2><button class="btn secondary" onclick="go('tasks')">Ver todas</button></div><div id="workerTasks"><div class="empty">Cargando…</div></div></section><section class="card"><div class="section-head"><h2>Mis incidencias</h2><button class="btn secondary" onclick="go('incidents')">Ver todas</button></div><div id="workerIncidents"><div class="empty">Cargando…</div></div></section></div></section>`);
    await refresh();
  }

  async function refresh(){
    if(s()?.role!=='employee'||!document.querySelector('.employee-mobile'))return;
    try{
      const [data,entry]=await Promise.all([loadData(),TimeTracking.getCurrent()]);
      const duration=entry?TimeTracking.formatDuration(TimeTracking.durationMs(entry)):TimeTracking.formatDuration(totalToday(data.hours));
      const today=document.querySelector('#workerTodayHours');if(today)today.textContent=duration;
      const tc=document.querySelector('#workerTaskCount');if(tc)tc.textContent=data.tasks.filter(t=>t.status!=='completed'&&t.status!=='cancelled').length;
      const ic=document.querySelector('#workerIncidentCount');if(ic)ic.textContent=data.incidents.filter(i=>i.status!=='closed').length;
      const tb=document.querySelector('#workerTasks');if(tb)tb.innerHTML=data.tasks.map(t=>`<div class="worker-list-row"><div><b>${esc(t.title)}</b><span class="muted">${t.due_at?` · ${localDate(t.due_at)}`:''}</span></div><div>${taskBadge(t)}</div></div>`).join('')||'<div class="empty">No tienes tareas asignadas.</div>';
      const ib=document.querySelector('#workerIncidents');if(ib)ib.innerHTML=data.incidents.map(i=>`<div class="worker-list-row"><div><b>${esc(i.title)}</b><span class="muted"> · ${localTime(i.created_at)}</span></div><div>${incidentBadge(i.status)}</div></div>`).join('')||'<div class="empty">No tienes incidencias.</div>';
      if(typeof window.__puntoWorkerEntryUpdate==='function')window.__puntoWorkerEntryUpdate(entry);
    }catch(err){
      console.error('Punto Trabajo · worker',err);
      toast(err?.message||'No se pudo actualizar tu jornada.');
    }
  }

  const originalWorkerPage=window.workerPage;
  window.__PuntoOriginalWorkerPage=originalWorkerPage;
  window.PuntoWorker={refresh};
  window.workerPage=workerPage;
})();
