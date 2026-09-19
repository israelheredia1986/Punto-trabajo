(function(){
  const DEMO_KEY='puntoTrabajoDemoPeople';
  let currentPeople=[];
  let currentTeams=[];
  let loadToken=0;

  const demoPeopleDefault=[
    {id:'u-001',name:'María Gómez',email:'admin@puntotrabajo.demo',role:'admin',roleLabel:'Administrador',status:'active',jobTitle:'Administración',team:'Todos los equipos',teamId:null},
    {id:'u-002',name:'Javier Moreno',email:'encargado@puntotrabajo.demo',role:'supervisor',roleLabel:'Encargado',status:'active',jobTitle:'Encargado',team:'Equipo A',teamId:'demo-team-a'},
    {id:'u-003',name:'Laura García',email:'empleado@puntotrabajo.demo',role:'employee',roleLabel:'Empleado',status:'active',jobTitle:'Técnica',team:'Equipo A',teamId:'demo-team-a'},
    {id:'u-004',name:'Carlos Ruiz',email:'carlos@puntotrabajo.demo',role:'employee',roleLabel:'Empleado',status:'active',jobTitle:'Operario',team:'Equipo A',teamId:'demo-team-a'},
    {id:'u-005',name:'Marta López',email:'marta@puntotrabajo.demo',role:'employee',roleLabel:'Empleado',status:'active',jobTitle:'Supervisora de campo',team:'Equipo B',teamId:'demo-team-b'},
    {id:'u-006',name:'David Martín',email:'david@puntotrabajo.demo',role:'employee',roleLabel:'Empleado',status:'active',jobTitle:'Técnico',team:'Equipo B',teamId:'demo-team-b'},
    {id:'u-007',name:'Ana Torres',email:'ana@puntotrabajo.demo',role:'employee',roleLabel:'Empleado',status:'active',jobTitle:'Operaria',team:'Equipo C',teamId:'demo-team-c'}
  ];
  const demoTeamsDefault=[
    {id:'demo-team-a',name:'Equipo A'},
    {id:'demo-team-b',name:'Equipo B'},
    {id:'demo-team-c',name:'Equipo C'}
  ];

  const roleLabels={admin:'Administrador',supervisor:'Encargado',employee:'Empleado'};

  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function roleText(role){return roleLabels[role]||role}
  function statusPill(status){
    if(status==='invited') return '<span class="status pause employee-table-status">Invitado</span>';
    if(status==='disabled') return '<span class="status offline employee-table-status">Desactivado</span>';
    return '<span class="status online employee-table-status">Activo</span>';
  }
  function storeDemo(people){localStorage.setItem(DEMO_KEY,JSON.stringify(people));return people}
  function demoPeople(){
    try{
      const saved=JSON.parse(localStorage.getItem(DEMO_KEY)||'null');
      if(Array.isArray(saved)) return saved;
    }catch{}
    return storeDemo(demoPeopleDefault.map(x=>({...x})));
  }

  async function listTeams(){
    const s=session();
    if(window.PuntoSupabase?.enabled && s?.provider==='supabase'){
      const {data,error}=await PuntoSupabase.client.from('teams').select('id,name').eq('company_id',s.companyId).order('name');
      if(error) throw error;
      return data||[];
    }
    return demoTeamsDefault;
  }

  async function listPeople(){
    const s=session();
    if(window.PuntoSupabase?.enabled && s?.provider==='supabase'){
      const {data:members,error:membersError}=await PuntoSupabase.client
        .from('company_memberships')
        .select('id,user_id,role,status,job_title,profiles(id,full_name,email)')
        .eq('company_id',s.companyId)
        .order('created_at',{ascending:true});
      if(membersError) throw membersError;
      const ids=(members||[]).map(x=>x.user_id).filter(Boolean);
      let memberships=[];
      if(ids.length){
        const {data:tm,error:tmError}=await PuntoSupabase.client
          .from('team_members')
          .select('user_id,team_id,teams(id,name)')
          .in('user_id',ids);
        if(tmError) throw tmError;
        memberships=tm||[];
      }
      const teamByUser=new Map();
      for(const tm of memberships) teamByUser.set(tm.user_id,{id:tm.team_id,name:tm.teams?.name||'Sin equipo'});
      return (members||[]).map(m=>({
        id:m.user_id,
        membershipId:m.id,
        name:m.profiles?.full_name||'Usuario',
        email:m.profiles?.email||'',
        role:m.role,
        roleLabel:roleText(m.role),
        status:m.status,
        jobTitle:m.job_title||'',
        team:teamByUser.get(m.user_id)?.name || (m.role==='admin'?'Todos los equipos':'Sin equipo'),
        teamId:teamByUser.get(m.user_id)?.id||null
      }));
    }
    return demoPeople();
  }

  function summary(people){
    return `<div class="employee-admin-summary"><div class="mini-stat"><small>Total</small><strong>${people.length}</strong></div><div class="mini-stat"><small>Activos</small><strong>${people.filter(p=>p.status==='active').length}</strong></div><div class="mini-stat"><small>Invitados</small><strong>${people.filter(p=>p.status==='invited').length}</strong></div></div>`;
  }

  function filteredPeople(query='',team='all',status='all'){
    const q=query.trim().toLowerCase();
    return currentPeople.filter(p=>{
      const matchesQ=!q || [p.name,p.email,p.jobTitle,p.team].some(v=>String(v||'').toLowerCase().includes(q));
      const matchesTeam=team==='all' || p.teamId===team;
      const matchesStatus=status==='all' || p.status===status;
      return matchesQ && matchesTeam && matchesStatus;
    });
  }

  function tableRows(people,adminView=false){
    if(!people.length) return `<tr><td colspan="6" class="employee-empty">No hay empleados que coincidan.</td></tr>`;
    return people.map(p=>`<tr>
      <td><b>${esc(p.name)}</b><br><span class="muted">${esc(p.email||'Sin email')}</span></td>
      <td>${esc(p.jobTitle||'—')}</td>
      <td>${esc(p.team||'Sin equipo')}</td>
      <td>${esc(p.roleLabel||roleText(p.role))}</td>
      <td>${statusPill(p.status)}</td>
      <td>${adminView?`<button class="btn secondary" onclick="manageEmployee('${esc(p.id)}')">Gestionar</button>`:'—'}</td>
    </tr>`).join('');
  }

  function renderEmployeesPage(){
    const s=session();
    if(!['admin','supervisor'].includes(s.role)) return go('worker');
    const admin=s.role==='admin';
    shell('employees',pageTitle('Empleados',admin?'Gestiona altas, equipos y accesos de la plantilla.':'Consulta el personal de tu equipo.',admin?'<button class="btn primary" onclick="addEmployee()">+ Añadir empleado</button>':'' )+
      `<div class="employee-sync-note">${window.PuntoSupabase?.enabled&&s.provider==='supabase'?'Conectado a Supabase · los cambios se guardan en la base de datos.':'Modo demo · las altas se guardan solo en este navegador.'}</div>
      <section class="card" style="margin-top:15px">${summary(currentPeople)}<div class="filters"><input id="employeeSearch" placeholder="Buscar por nombre, email, puesto…" oninput="refreshEmployeeTable()"><select id="employeeTeam" class="employee-team-filter" onchange="refreshEmployeeTable()"><option value="all">Todos los equipos</option>${currentTeams.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}</select><select id="employeeStatus" onchange="refreshEmployeeTable()"><option value="all">Todos los estados</option><option value="active">Activos</option><option value="invited">Invitados</option><option value="disabled">Desactivados</option></select></div><div class="table-wrap" style="margin-top:15px"><table class="table"><thead><tr><th>Empleado</th><th>Puesto</th><th>Equipo</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead><tbody id="employeeRowsNew">${tableRows(filteredPeople(),admin)}</tbody></table></div></section>`);
  }

  async function refreshEmployeesPage(){
    const token=++loadToken;
    try{
      currentTeams=await listTeams();
      currentPeople=await listPeople();
      if(token!==loadToken)return;
      if(document.querySelector('#employeeRowsNew')){
        const admin=session().role==='admin';
        document.querySelector('#employeeRowsNew').innerHTML=tableRows(filteredPeople(document.querySelector('#employeeSearch')?.value||'',document.querySelector('#employeeTeam')?.value||'all',document.querySelector('#employeeStatus')?.value||'all'),admin);
        const card=document.querySelector('.employee-admin-summary');
        if(card) card.outerHTML=summary(currentPeople);
      }
      if(!document.querySelector('#employeeRowsNew')){
        renderEmployeesPage();
      }
    }catch(err){
      console.error('Punto Trabajo empleados:',err);
      toast(err?.message||'No se pudieron cargar los empleados.');
    }
  }

  window.refreshEmployeeTable=function(){
    const admin=session().role==='admin';
    const box=document.querySelector('#employeeRowsNew');
    if(!box)return;
    box.innerHTML=tableRows(filteredPeople(document.querySelector('#employeeSearch')?.value||'',document.querySelector('#employeeTeam')?.value||'all',document.querySelector('#employeeStatus')?.value||'all'),admin);
  };

  function roleOptions(){
    return `<option value="employee">Empleado</option><option value="supervisor">Encargado</option>`;
  }

  window.addEmployee=function(){
    const s=session();
    if(s.role!=='admin') return toast('Solo el administrador puede dar de alta usuarios.');
    const teamOptions=currentTeams.length?currentTeams.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join(''):'<option value="">Sin equipos configurados</option>';
    document.body.insertAdjacentHTML('beforeend',`<div class="employee-modal-backdrop" id="employeeModal" role="dialog" aria-modal="true"><div class="employee-modal"><div class="employee-modal-head"><div><h2>Añadir empleado</h2><p class="muted">Envía una invitación para que cree su cuenta.</p></div><button class="employee-modal-close" onclick="closeEmployeeModal()" aria-label="Cerrar">×</button></div><div class="employee-modal-body"><div class="employee-modal-note">La contraseña no se crea desde este panel. Supabase enviará una invitación al email y la persona completará su acceso desde el enlace. La clave secreta permanece en el backend.</div><form class="form" id="employeeInviteForm" onsubmit="submitEmployeeInvite(event)" style="margin-top:15px"><label>Nombre completo<input id="newEmployeeName" required maxlength="120" placeholder="Ej. José García"></label><label>Email profesional<input id="newEmployeeEmail" required type="email" maxlength="200" placeholder="nombre@empresa.com"></label><div class="form-row"><label>Puesto<input id="newEmployeeJobTitle" maxlength="120" placeholder="Ej. Técnico"></label><label>Rol<select id="newEmployeeRole">${roleOptions()}</select></label></div><label>Equipo<select id="newEmployeeTeam">${teamOptions}</select></label><div class="employee-modal-actions"><button type="button" class="btn secondary" onclick="closeEmployeeModal()">Cancelar</button><button type="submit" class="btn primary" id="employeeInviteButton">Enviar invitación</button></div><div id="employeeInviteError" class="auth-error" role="alert"></div></form></div></div></div>`);
  };

  window.closeEmployeeModal=function(){document.querySelector('#employeeModal')?.remove()};

  window.submitEmployeeInvite=async function(event){
    event.preventDefault();
    const s=session();
    const button=document.querySelector('#employeeInviteButton');
    const error=document.querySelector('#employeeInviteError');
    button.disabled=true;button.textContent='Enviando…';error.textContent='';
    const payload={
      companyId:s.companyId,
      fullName:document.querySelector('#newEmployeeName').value.trim(),
      email:document.querySelector('#newEmployeeEmail').value.trim().toLowerCase(),
      jobTitle:document.querySelector('#newEmployeeJobTitle').value.trim(),
      role:document.querySelector('#newEmployeeRole').value,
      teamId:document.querySelector('#newEmployeeTeam').value||null
    };
    try{
      if(window.PuntoSupabase?.enabled && s.provider==='supabase'){
        const {data,error:fnError}=await PuntoSupabase.client.functions.invoke('invite-employee',{body:payload});
        if(fnError) throw new Error(fnError.message||'No se pudo enviar la invitación.');
        if(data?.error) throw new Error(data.error);
        toast('Invitación enviada correctamente.');
      }else{
        const team=currentTeams.find(t=>t.id===payload.teamId);
        const newPerson={id:'demo-user-'+Date.now(),name:payload.fullName,email:payload.email,role:payload.role,roleLabel:roleText(payload.role),status:'invited',jobTitle:payload.jobTitle,team:team?.name||'Sin equipo',teamId:payload.teamId};
        currentPeople=storeDemo([...demoPeople(),newPerson]);
        toast('Invitación simulada en modo demo.');
      }
      closeEmployeeModal();
      renderEmployeesPage();
      await refreshEmployeesPage();
    }catch(err){
      console.error('Punto Trabajo alta empleado:',err);
      error.textContent=err?.message||'No se pudo crear el empleado.';
    }finally{button.disabled=false;button.textContent='Enviar invitación';}
  };

  window.manageEmployee=function(id){
    const p=currentPeople.find(x=>x.id===id); if(!p)return;
    const s=session();
    if(p.role==='admin'){toast('La cuenta de administrador no se modifica desde esta pantalla.');return;}
    if(window.PuntoSupabase?.enabled && s.provider==='supabase'){
      const teams=currentTeams.map(t=>`<option value="${esc(t.id)}" ${t.id===p.teamId?'selected':''}>${esc(t.name)}</option>`).join('');
      document.body.insertAdjacentHTML('beforeend',`<div class="employee-modal-backdrop" id="employeeManageModal" role="dialog" aria-modal="true"><div class="employee-modal"><div class="employee-modal-head"><div><h2>Gestionar empleado</h2><p class="muted">${esc(p.name)} · ${esc(p.email||'')}</p></div><button class="employee-modal-close" onclick="closeManageEmployeeModal()">×</button></div><div class="employee-modal-body"><form class="form" onsubmit="saveEmployeeManagement(event,'${esc(p.id)}')"><label>Nombre completo<input id="manageEmployeeName" value="${esc(p.name)}" disabled></label><label>Puesto<input id="manageEmployeeJob" maxlength="120" value="${esc(p.jobTitle||'')}"></label><div class="form-row"><label>Rol<select id="manageEmployeeRole"><option value="employee" ${p.role==='employee'?'selected':''}>Empleado</option><option value="supervisor" ${p.role==='supervisor'?'selected':''}>Encargado</option></select></label><label>Estado<select id="manageEmployeeStatus"><option value="active" ${p.status==='active'?'selected':''}>Activo</option><option value="invited" ${p.status==='invited'?'selected':''}>Invitado</option><option value="disabled" ${p.status==='disabled'?'selected':''}>Desactivado</option></select></label></div><label>Equipo<select id="manageEmployeeTeam"><option value="">Sin equipo</option>${teams}</select></label><div class="employee-modal-actions"><button type="button" class="btn secondary" onclick="closeManageEmployeeModal()">Cancelar</button><button type="submit" class="btn primary" id="manageEmployeeButton">Guardar cambios</button></div><div id="manageEmployeeError" class="auth-error" role="alert"></div></form></div></div></div>`);
    }else{
      p.status=p.status==='disabled'?'active':'disabled'; storeDemo(currentPeople); toast(`Usuario ${p.status==='active'?'activado':'desactivado'} en modo demo.`); renderEmployeesPage();
    }
  };
  window.closeManageEmployeeModal=function(){document.querySelector('#employeeManageModal')?.remove()};
  window.saveEmployeeManagement=async function(event,id){
    event.preventDefault(); const p=currentPeople.find(x=>x.id===id), s=session(); if(!p)return;
    const btn=document.querySelector('#manageEmployeeButton'), err=document.querySelector('#manageEmployeeError'); btn.disabled=true;btn.textContent='Guardando…';err.textContent='';
    const role=document.querySelector('#manageEmployeeRole').value,statusValue=document.querySelector('#manageEmployeeStatus').value,jobTitle=document.querySelector('#manageEmployeeJob').value.trim(),teamId=document.querySelector('#manageEmployeeTeam').value||null;
    try{
      const client=PuntoSupabase.client;
      const upd=await client.from('company_memberships').update({role,status:statusValue,job_title:jobTitle}).eq('id',p.membershipId).eq('company_id',s.companyId); if(upd.error)throw upd.error;
      const del=await client.from('team_members').delete().eq('user_id',p.id); if(del.error)throw del.error;
      if(teamId){const ins=await client.from('team_members').insert({user_id:p.id,team_id:teamId});if(ins.error)throw ins.error;}
      toast('Cambios guardados correctamente.'); closeManageEmployeeModal(); await refreshEmployeesPage();
    }catch(e){console.error('Punto Trabajo gestión empleado:',e);err.textContent=e?.message||'No se pudieron guardar los cambios.';}
    finally{btn.disabled=false;btn.textContent='Guardar cambios';}
  };

  window.usersPage=function(){
    if(!Auth.can('users'))return forbidden();
    const s=session();
    shell('users',pageTitle('Usuarios y permisos','Cuentas, roles y estado de acceso de la empresa.','<button class="btn primary" onclick="addEmployee()">+ Añadir usuario</button>')+`<section class="card"><div class="section-head"><div><h2>Usuarios de la empresa</h2><p class="muted">Las invitaciones se envían por email y quedan asociadas al rol y equipo seleccionados.</p></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Usuario</th><th>Rol</th><th>Equipo</th><th>Estado</th><th>Acción</th></tr></thead><tbody id="usersRows"><tr><td colspan="5" class="employee-empty">Cargando usuarios…</td></tr></tbody></table></div></section>`);
    loadToken++;
    Promise.all([listTeams(),listPeople()]).then(([teams,people])=>{
      currentTeams=teams;currentPeople=people;
      const rows=document.querySelector('#usersRows');
      if(rows)rows.innerHTML=tableRows(currentPeople,true).replace(/<td>—<\/td>/g,'<td><button class="btn secondary" onclick="manageEmployee(\'__ID__\')">Gestionar</button></td>');
      if(rows){
        rows.innerHTML=currentPeople.map(p=>`<tr><td><b>${esc(p.name)}</b><br><span class="muted">${esc(p.email||'Sin email')}</span></td><td>${esc(p.roleLabel)}</td><td>${esc(p.team)}</td><td>${statusPill(p.status)}</td><td><button class="btn secondary" onclick="manageEmployee('${esc(p.id)}')">Gestionar</button></td></tr>`).join('')||'<tr><td colspan="5" class="employee-empty">No hay usuarios.</td></tr>';
      }
    }).catch(err=>{const rows=document.querySelector('#usersRows');if(rows)rows.innerHTML=`<tr><td colspan="5" class="employee-empty">${esc(err?.message||'No se pudieron cargar los usuarios.')}</td></tr>`});
  };

  window.employeesPage=function(){
    const s=session();
    if(s.role==='employee')return go('worker');
    currentTeams=demoTeamsDefault;currentPeople=demoPeople();
    renderEmployeesPage();
    if(s.provider==='supabase' && window.PuntoSupabase?.enabled) refreshEmployeesPage();
  };

})();
