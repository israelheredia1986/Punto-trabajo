(function(){
  let timer=null,busy=false;
  const LAST_ZONE_KEY='puntoTrabajoLastGeofenceState';
  function isWorkerView(){return Boolean(document.querySelector('.employee-mobile'));}
  function lastState(userId){try{return JSON.parse(localStorage.getItem(`${LAST_ZONE_KEY}:${userId}`)||'null')}catch{return null}}
  function saveState(userId,state){localStorage.setItem(`${LAST_ZONE_KEY}:${userId}`,JSON.stringify(state));}
  function ensureUi(){if(!isWorkerView()||document.querySelector('#workerLocationStatus'))return;const buttons=document.querySelector('.mobile-actions');if(buttons){const node=document.createElement('div');node.id='workerLocationStatus';buttons.parentElement.appendChild(node);}}
  async function capture(){
    if(busy||!isWorkerView())return;ensureUi();const s=Auth.getSession();if(!s?.id)return;
    try{
      const entry=await TimeTracking.getCurrent();if(!entry||entry.status!=='open'){stop();return;}busy=true;
      const point=await PuntoGeo.recordCurrentLocation();
      const configured=point.geofencesConfigured!==false;
      const inside=configured?Boolean(point.zone):null;
      const previous=lastState(s.id);
      if(configured&&previous&&previous.inside!==inside)toast(inside?'Has entrado en una geocerca.':'Has salido de una geocerca.');
      saveState(s.id,{configured,inside,zoneId:point.zone?.id||null});
      const locationStatus=document.querySelector('#workerLocationStatus');
      if(locationStatus){const text=!configured?'Sin geocercas configuradas':inside?'Dentro de zona':'Fuera de zona';const cls=!configured?'offline':inside?'online':'alert';locationStatus.innerHTML=`<span class="status ${cls}">${text}</span> <span class="muted">· ubicación actualizada ${new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}</span>`;}
    }catch(err){ensureUi();const locationStatus=document.querySelector('#workerLocationStatus');if(locationStatus)locationStatus.innerHTML='<span class="status pause">Ubicación no disponible</span>';console.debug('Punto Trabajo ubicación:',err?.message||err);}finally{busy=false;}
  }
  function start(){ensureUi();if(timer)clearInterval(timer);timer=setInterval(capture,15000);capture();}
  function stop(){if(timer){clearInterval(timer);timer=null;}}
  const observer=new MutationObserver(async()=>{if(!isWorkerView()){stop();return;}ensureUi();const entry=await TimeTracking.getCurrent().catch(()=>null);if(entry?.status==='open')start();else stop();});
  observer.observe(document.querySelector('#app'),{childList:true,subtree:true});
  setInterval(async()=>{if(!isWorkerView())return;const entry=await TimeTracking.getCurrent().catch(()=>null);if(entry?.status==='open')start();else stop();},15000);
})();
