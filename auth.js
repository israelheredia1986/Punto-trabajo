const AUTH_STORAGE_KEY = 'puntoTrabajoSession';

const demoUsers = [
  { id:'u-001', name:'María Gómez', email:'admin@puntotrabajo.demo', password:'admin123', role:'admin', roleLabel:'Administrador', company:'Punto Trabajo Demo', team:'Todos los equipos' },
  { id:'u-002', name:'Javier Moreno', email:'encargado@puntotrabajo.demo', password:'super123', role:'supervisor', roleLabel:'Encargado', company:'Punto Trabajo Demo', team:'Equipo A' },
  { id:'u-003', name:'Laura García', email:'empleado@puntotrabajo.demo', password:'empleado123', role:'employee', roleLabel:'Empleado', company:'Punto Trabajo Demo', team:'Equipo A' }
];

const permissions = {
  admin: ['dashboard','employees','users','map','tasks','hours','incidents','reports','worker'],
  supervisor: ['dashboard','employees','map','tasks','hours','incidents','reports'],
  employee: ['worker']
};

function getSession(){
  try { return JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || 'null'); } catch { return null; }
}

function setSession(user){
  const session={
    id:user.id,
    name:user.name,
    email:user.email,
    role:user.role,
    roleLabel:user.roleLabel,
    company:user.company,
    companyId:user.companyId || null,
    team:user.team,
    teamId:user.teamId || null,
    provider:user.provider || 'demo',
    loginAt:new Date().toISOString()
  };
  localStorage.setItem(AUTH_STORAGE_KEY,JSON.stringify(session));
  return session;
}

async function logout(){
  try {
    if(window.PuntoSupabase?.enabled) await PuntoSupabase.signOut();
  } finally {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    renderLogin();
  }
}

function can(permission,role=getSession()?.role){
  return Boolean(role && permissions[role]?.includes(permission));
}

async function loadSupabaseUserSession(){
  const authState = await PuntoSupabase.getSession();
  const authUser = authState?.data?.session?.user;
  if(!authUser) return null;

  const client = PuntoSupabase.client;
  // An invitation creates the Auth user with membership status "invited".
  // The first authenticated session activates that membership through a narrow SECURITY DEFINER RPC.
  try { await client.rpc('activate_my_membership'); } catch (err) { console.debug('Punto Trabajo: no se pudo activar la membresía invitada.',err); }

  const [{data:profile},{data:membership}] = await Promise.all([
    client.from('profiles').select('id,full_name,email').eq('id',authUser.id).maybeSingle(),
    client.from('company_memberships').select('id,company_id,user_id,role,status,job_title').eq('user_id',authUser.id).eq('status','active').limit(1).maybeSingle()
  ]);

  if(!membership) return null;

  const [{data:company},{data:teamMembership}] = await Promise.all([
    client.from('companies').select('id,name').eq('id',membership.company_id).maybeSingle(),
    client.from('team_members').select('team_id,teams(name)').eq('user_id',authUser.id).limit(1).maybeSingle()
  ]);

  const roleLabels={admin:'Administrador',supervisor:'Encargado',employee:'Empleado'};
  return setSession({
    id:authUser.id,
    name:profile?.full_name || authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'Usuario',
    email:profile?.email || authUser.email || '',
    role:membership.role,
    roleLabel:roleLabels[membership.role] || membership.role,
    company:company?.name || 'Empresa',
    companyId:membership.company_id,
    team:teamMembership?.teams?.name || (membership.role==='admin' ? 'Todos los equipos' : 'Sin equipo'),
    teamId:teamMembership?.team_id || null,
    provider:'supabase'
  });
}

async function login(email,password){
  const normalizedEmail=email.trim().toLowerCase();

  if(window.PuntoSupabase?.enabled){
    const {data,error}=await PuntoSupabase.signIn(normalizedEmail,password);
    if(!error && data?.session){
      const session=await loadSupabaseUserSession();
      if(session) return {ok:true,session};
      await PuntoSupabase.signOut();
      return {ok:false,message:'La cuenta no tiene una empresa activa asignada.'};
    }
    return {ok:false,message:'Email o contraseña incorrectos.'};
  }

  const user=demoUsers.find(item=>item.email===normalizedEmail && item.password===password);
  if(!user) return {ok:false,message:'Email o contraseña incorrectos.'};
  return {ok:true,session:setSession({...user,provider:'demo'})};
}

function renderLogin(){
  const app=document.querySelector('#app');
  app.innerHTML=`<div class="auth-page"><div class="auth-card">
    <div class="auth-brand">Punto <span>Trabajo</span></div>
    <h1>Acceder a tu cuenta</h1>
    <p class="muted">Gestiona tu empresa, equipos, jornadas y tareas desde un mismo sitio.</p>
    <form class="auth-form" onsubmit="submitLogin(event)">
      <label>Email<input id="loginEmail" type="email" autocomplete="username" placeholder="tu@email.com" required></label>
      <label>Contraseña<input id="loginPassword" type="password" autocomplete="current-password" placeholder="••••••••" required></label>
      <button class="btn primary auth-submit" id="loginButton">Entrar</button>
      <div id="loginError" class="auth-error" role="alert"></div>
    </form>
    <div class="demo-access"><b>Acceso de demostración</b>
      <button type="button" onclick="fillDemo('admin@puntotrabajo.demo','admin123')"><span>Administrador</span><small>admin@puntotrabajo.demo</small></button>
      <button type="button" onclick="fillDemo('encargado@puntotrabajo.demo','super123')"><span>Encargado</span><small>encargado@puntotrabajo.demo</small></button>
      <button type="button" onclick="fillDemo('empleado@puntotrabajo.demo','empleado123')"><span>Empleado</span><small>empleado@puntotrabajo.demo</small></button>
    </div>
    <p class="auth-note">${window.PuntoSupabase?.enabled ? 'Conexión Supabase activa. El acceso usa autenticación real.' : 'Modo demo activo. Al configurar Supabase, este acceso pasará a autenticación real.'}</p>
  </div></div>`;
}

function fillDemo(email,password){
  document.querySelector('#loginEmail').value=email;
  document.querySelector('#loginPassword').value=password;
  document.querySelector('#loginError').textContent='';
}

async function submitLogin(event){
  event.preventDefault();
  const button=document.querySelector('#loginButton');
  const error=document.querySelector('#loginError');
  button.disabled=true;
  button.textContent='Entrando…';

  try {
    const result=await login(document.querySelector('#loginEmail').value,document.querySelector('#loginPassword').value);
    if(!result.ok){ error.textContent=result.message; return; }
    go(result.session.role==='employee'?'worker':'dashboard');
  } catch(err){
    console.error('Punto Trabajo login:',err);
    error.textContent='No se ha podido iniciar sesión. Revisa la configuración de acceso.';
  } finally {
    if(button){ button.disabled=false; button.textContent='Entrar'; }
  }
}

async function bootAuth(){ if(!window.PuntoSupabase?.enabled)return; try{const session=await loadSupabaseUserSession(); if(session&&typeof go==='function')go(session.role==='employee'?'worker':'dashboard');}catch(err){console.debug('Punto Trabajo: no se pudo restaurar la sesión Supabase.',err);} } window.Auth={getSession,setSession,logout,can,login,loadSupabaseUserSession,bootAuth,demoUsers,permissions}; if(window.PuntoSupabase?.enabled)setTimeout(bootAuth,0);
