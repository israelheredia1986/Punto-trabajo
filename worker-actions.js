(function(){
  let busy=false;

  function setMessage(message,isError=false){
    if(typeof toast==='function') toast(message);
    const status=document.querySelector('.employee-mobile .status');
    if(status && isError) status.textContent='Revisar';
  }

  function isWorkerView(){ return Boolean(document.querySelector('.employee-mobile')); }

  function updateButtons(entry){
    if(!isWorkerView()) return;
    const mobileActions=document.querySelector('.mobile-actions');
    const statuses=[...document.querySelectorAll('.employee-mobile .status')];
    const clock=document.querySelector('.employee-mobile .clock');
    if(!mobileActions || !statuses.length) return;

    const buttons=[...mobileActions.querySelectorAll('button')];
    const primary=buttons[0];
    const secondary=buttons[1];
    const openBreak=entry?.time_entry_breaks?.find(b=>!b.ended_at);

    const stateClass=!entry?'offline':openBreak?'pause':'online';
    const stateText=!entry?'Fuera de jornada':openBreak?'En pausa':'En jornada';
    statuses.forEach(node=>{
      if(node.closest('.worker-location')) return;
      node.className='status '+stateClass;
      node.textContent=stateText;
    });

    if(!entry){
      if(primary){primary.dataset.action='start';primary.textContent='Fichar entrada';primary.className='btn primary big';primary.disabled=false;}
      if(secondary){secondary.dataset.action='none';secondary.textContent='Iniciar pausa';secondary.disabled=true;secondary.className='btn secondary big';}
      if(clock) clock.textContent='00:00';
      if(typeof PuntoWorker!=='undefined') PuntoWorker.refresh().catch(()=>{});
      return;
    }

    if(primary){primary.dataset.action='end';primary.textContent='Fichar salida';primary.className='btn danger big';primary.disabled=false;}
    if(secondary){secondary.dataset.action=openBreak?'endBreak':'startBreak';secondary.textContent=openBreak?'Reanudar jornada':'Iniciar pausa';secondary.className='btn secondary big';secondary.disabled=false;}
    if(clock) clock.textContent=TimeTracking.formatDuration(TimeTracking.durationMs(entry));
  }

  async function refresh(){
    if(!isWorkerView() || busy) return;
    try{
      const entry=await TimeTracking.getCurrent();
      updateButtons(entry);
    }catch(err){
      console.error('Punto Trabajo jornada:',err);
    }
  }

  async function run(action){
    if(busy) return;
    busy=true;
    try{
      if(action==='start'){
        await TimeTracking.start();
        setMessage('Entrada registrada');
      }else if(action==='startBreak'){
        await TimeTracking.startBreak();
        setMessage('Pausa iniciada');
      }else if(action==='endBreak'){
        await TimeTracking.endBreak();
        setMessage('Jornada reanudada');
      }else if(action==='end'){
        await TimeTracking.end();
        setMessage('Salida registrada');
      }
      await refresh();
      if(typeof PuntoWorker!=='undefined') await PuntoWorker.refresh();
    }catch(err){
      console.error('Punto Trabajo jornada:',err);
      setMessage(err?.message || 'No se ha podido actualizar la jornada.',true);
    }finally{
      busy=false;
    }
  }

  document.addEventListener('click',function(event){
    const button=event.target.closest('.mobile-actions button');
    if(!button || !isWorkerView()) return;
    const action=button.dataset.action;
    if(!action || action==='none'){
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    run(action);
  },true);

  const observer=new MutationObserver(()=>{ if(isWorkerView()) refresh(); });
  observer.observe(document.querySelector('#app'),{childList:true,subtree:true});
  setInterval(()=>{
    if(isWorkerView() && !busy){
      TimeTracking.getCurrent().then(entry=>{
        updateButtons(entry);
      }).catch(()=>{});
    }
  },15000);
})();
