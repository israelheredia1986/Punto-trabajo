(function(){
  async function load(){
    const s=Auth.getSession(); if(!s||s.provider!=='supabase'||!PuntoSupabase?.enabled)return [];
    const {data,error}=await PuntoSupabase.client.from('notifications').select('id,kind,title,body,entity_type,entity_id,read_at,created_at').order('created_at',{ascending:false}).limit(50);
    if(error) throw error; return data||[];
  }
  async function check(){try{const s=Auth.getSession();if(s?.provider==='supabase'&&PuntoSupabase?.enabled)await PuntoSupabase.client.rpc('run_notification_checks');}catch(e){console.debug('notification check',e)}}
  async function unread(){const s=Auth.getSession();if(!s||s.provider!=='supabase'||!PuntoSupabase?.enabled)return 0;const {count,error}=await PuntoSupabase.client.from('notifications').select('id',{count:'exact',head:true}).is('read_at',null);if(error)throw error;return count||0}
  async function markRead(id){const {error}=await PuntoSupabase.client.from('notifications').update({read_at:new Date().toISOString()}).eq('id',id);if(error)throw error;render()}
  async function markAll(){const s=Auth.getSession();const {error}=await PuntoSupabase.client.from('notifications').update({read_at:new Date().toISOString()}).eq('user_id',s.id).is('read_at',null);if(error)throw error;render()}
  async function render(){const box=document.querySelector('#notificationsPanel');if(!box)return;try{await check();const rows=await load();box.innerHTML='<div class="section-head"><h2>Avisos</h2><button class="btn secondary" onclick="PuntoNotifications.markAll()">Marcar todos como leídos</button></div>'+(rows.length?rows.map(n=>'<div class="task" style="cursor:pointer;'+(n.read_at?'opacity:.65':'')+'" onclick="PuntoNotifications.markRead(\''+n.id+'\')"><b>'+esc(n.title)+'</b><span class="muted">'+esc(n.body||'')+' · '+new Date(n.created_at).toLocaleString('es-ES')+'</span></div>').join(''):'<div class="empty">No hay avisos.</div>');const badge=document.querySelector('#notificationBadge');if(badge){const u=rows.filter(n=>!n.read_at).length;badge.textContent=u;badge.style.display=u?'inline-flex':'none'}}catch(e){box.innerHTML='<div class="empty">'+esc(e.message||'No se pudieron cargar los avisos.')+'</div>'}}
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  window.PuntoNotifications={load,check,unread,markRead,markAll,render};
})();