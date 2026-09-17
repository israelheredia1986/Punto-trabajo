(function(){
  const DEMO_KEY='puntoTrabajoDemoTimeEntry';

  function nowIso(){ return new Date().toISOString(); }

  function getDemo(){
    try { return JSON.parse(localStorage.getItem(DEMO_KEY) || 'null'); } catch { return null; }
  }
  function saveDemo(value){ localStorage.setItem(DEMO_KEY,JSON.stringify(value)); return value; }

  function location(){
    return new Promise(resolve=>{
      if(!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        p=>resolve({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy_m:p.coords.accuracy}),
        ()=>resolve(null),
        {enableHighAccuracy:true,timeout:8000,maximumAge:15000}
      );
    });
  }

  async function getCurrent(){
    const session=Auth.getSession();
    if(!session) return null;

    if(window.PuntoSupabase?.enabled && session.provider==='supabase'){
      const {data,error}=await PuntoSupabase.client
        .from('time_entries')
        .select('id,company_id,user_id,started_at,ended_at,status,start_latitude,start_longitude,end_latitude,end_longitude,time_entry_breaks(id,started_at,ended_at,reason)')
        .eq('user_id',session.id)
        .eq('status','open')
        .order('started_at',{ascending:false})
        .limit(1)
        .maybeSingle();
      if(error) throw error;
      return data || null;
    }

    return getDemo();
  }

  async function start(){
    const session=Auth.getSession();
    if(!session) throw new Error('No hay sesión activa.');
    const existing=await getCurrent();
    if(existing) return existing;
    const pos=await location();
    const startedAt=nowIso();

    if(window.PuntoSupabase?.enabled && session.provider==='supabase'){
      const {data,error}=await PuntoSupabase.client
        .from('time_entries')
        .insert({
          company_id:session.companyId,
          user_id:session.id,
          started_at:startedAt,
          status:'open',
          start_latitude:pos?.latitude ?? null,
          start_longitude:pos?.longitude ?? null
        })
        .select('id,company_id,user_id,started_at,ended_at,status,start_latitude,start_longitude,end_latitude,end_longitude,time_entry_breaks(id,started_at,ended_at,reason)')
        .single();
      if(error) throw error;
      return data;
    }

    return saveDemo({
      id:'demo-'+Date.now(),
      company_id:session.companyId || 'demo-company',
      user_id:session.id,
      started_at:startedAt,
      ended_at:null,
      status:'open',
      start_latitude:pos?.latitude ?? null,
      start_longitude:pos?.longitude ?? null,
      time_entry_breaks:[]
    });
  }

  async function startBreak(reason='Pausa'){
    const session=Auth.getSession();
    const entry=await getCurrent();
    if(!entry) throw new Error('Primero debes fichar la entrada.');
    const openBreak=(entry.time_entry_breaks || []).find(b=>!b.ended_at);
    if(openBreak) return entry;
    const startedAt=nowIso();

    if(window.PuntoSupabase?.enabled && session.provider==='supabase'){
      const {error}=await PuntoSupabase.client.from('time_entry_breaks').insert({
        company_id:session.companyId,
        time_entry_id:entry.id,
        user_id:session.id,
        started_at:startedAt,
        reason
      });
      if(error) throw error;
      return getCurrent();
    }

    entry.time_entry_breaks=entry.time_entry_breaks || [];
    entry.time_entry_breaks.push({id:'break-'+Date.now(),started_at:startedAt,ended_at:null,reason});
    return saveDemo(entry);
  }

  async function endBreak(){
    const session=Auth.getSession();
    const entry=await getCurrent();
    if(!entry) throw new Error('No hay una jornada activa.');
    const openBreak=(entry.time_entry_breaks || []).find(b=>!b.ended_at);
    if(!openBreak) return entry;
    const endedAt=nowIso();

    if(window.PuntoSupabase?.enabled && session.provider==='supabase'){
      const {error}=await PuntoSupabase.client.from('time_entry_breaks').update({ended_at:endedAt}).eq('id',openBreak.id).eq('user_id',session.id);
      if(error) throw error;
      return getCurrent();
    }

    openBreak.ended_at=endedAt;
    return saveDemo(entry);
  }

  async function end(){
    const session=Auth.getSession();
    const entry=await getCurrent();
    if(!entry) return null;
    const openBreak=(entry.time_entry_breaks || []).find(b=>!b.ended_at);
    if(openBreak) await endBreak();
    const pos=await location();
    const endedAt=nowIso();

    if(window.PuntoSupabase?.enabled && session.provider==='supabase'){
      const {error}=await PuntoSupabase.client
        .from('time_entries')
        .update({
          ended_at:endedAt,
          status:'closed',
          end_latitude:pos?.latitude ?? null,
          end_longitude:pos?.longitude ?? null
        })
        .eq('id',entry.id)
        .eq('user_id',session.id);
      if(error) throw error;
      return {...entry,ended_at:endedAt,status:'closed',end_latitude:pos?.latitude ?? null,end_longitude:pos?.longitude ?? null};
    }

    entry.ended_at=endedAt;
    entry.status='closed';
    entry.end_latitude=pos?.latitude ?? null;
    entry.end_longitude=pos?.longitude ?? null;
    return saveDemo(entry);
  }

  function durationMs(entry,at=Date.now()){
    if(!entry?.started_at) return 0;
    const end=entry.ended_at ? new Date(entry.ended_at).getTime() : at;
    let total=Math.max(0,end-new Date(entry.started_at).getTime());
    for(const b of entry.time_entry_breaks || []){
      const breakEnd=b.ended_at ? new Date(b.ended_at).getTime() : at;
      total-=Math.max(0,breakEnd-new Date(b.started_at).getTime());
    }
    return Math.max(0,total);
  }

  function formatDuration(ms){
    const totalMinutes=Math.floor(ms/60000);
    const h=String(Math.floor(totalMinutes/60)).padStart(2,'0');
    const m=String(totalMinutes%60).padStart(2,'0');
    return `${h}:${m}`;
  }

  window.TimeTracking={getCurrent,start,startBreak,endBreak,end,durationMs,formatDuration};
})();
