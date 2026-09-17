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
  const session={id:user.id,name:user.name,email:user.email,role:user.role,roleLabel:user.roleLabel,company:user.company,team:user.team,loginAt:new Date().toISOString()};
  localStorage.setItem(AUTH_STORAGE_KEY,JSON.stringify(session));
  return session;
}

function logout(){ localStorage.removeItem(AUTH_STORAGE_KEY); renderLogin(); }
function can(permission,role=getSession()?.role){ return Boolean(role && permissions[role]?.includes(permission)); }

function login(email,password){
  const normalizedEmail=email.trim().toLowerCase();
  const user=demoUsers.find(item=>item.email===normalizedEmail && item.password===password);
  if(!user) return {ok:false,message:'Email o contraseña incorrectos.'};
  return {ok:true,session:setSession(user)};
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
      <button class="btn primary auth-submit">Entrar</button>
      <div id="loginError" class="auth-error" role="alert"></div>
    </form>
    <div class="demo-access"><b>Acceso de demostración</b>
      <button type="button" onclick="fillDemo('admin@puntotrabajo.demo','admin123')"><span>Administrador</span><small>admin@puntotrabajo.demo</small></button>
      <button type="button" onclick="fillDemo('encargado@puntotrabajo.demo','super123')"><span>Encargado</span><small>encargado@puntotrabajo.demo</small></button>
      <button type="button" onclick="fillDemo('empleado@puntotrabajo.demo','empleado123')"><span>Empleado</span><small>empleado@puntotrabajo.demo</small></button>
    </div>
    <p class="auth-note">Esta autenticación es de demostración. Después la conectaremos a un backend seguro y una base de datos real.</p>
  </div></div>`;
}

function fillDemo(email,password){
  document.querySelector('#loginEmail').value=email;
  document.querySelector('#loginPassword').value=password;
  document.querySelector('#loginError').textContent='';
}

function submitLogin(event){
  event.preventDefault();
  const result=login(document.querySelector('#loginEmail').value,document.querySelector('#loginPassword').value);
  const error=document.querySelector('#loginError');
  if(!result.ok){ error.textContent=result.message; return; }
  if(typeof go==='function') go(result.session.role==='employee'?'worker':'dashboard');
}

window.Auth={getSession,setSession,logout,can,login,demoUsers,permissions};
