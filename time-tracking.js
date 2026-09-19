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

  async function history(days=31){
    const session=Auth.getSession();
    if(!session) return [];
    const since=new Date(Date.now()-Math.max(1,days)*86400000).toISOString();
    if(window.PuntoSupabase?.enabled && session.provider==='supabase'){
      const {data,error}=await PuntoSupabase.client
        .from('time_entries')
        .select('id,started_at,ended_at,status,start_latitude,start_longitude,end_latitude,end_longitude,time_entry_breaks(id,started_at,ended_at,reason)')
        .eq('user_id',session.id)
        .gte('started_at',since)
        .order('started_at',{ascending:false});
      if(error) throw error;
      return data||[];
    }
    const current=getDemo();
    return current?[current]:[];
  }

  function netDurationMs(entry){
    return durationMs(entry, entry?.ended_at ? new Date(entry.ended_at).getTime() : Date.now());
  }

  let locationTimer=null;
  function distanceMeters(lat1,lon1,lat2,lon2){
    const R=6371000,rad=Math.PI/180,dLat=(lat2-lat1)*rad,dLon=(lon2-lon1)*rad;
    const a=Math.sin(dLat/2)**2+Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin(dLon/2)**2;
    return 2*R*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  }
  async function evaluateGeofence(s,pos){
    const {data:zones,error}=await PuntoSupabase.client.from('geofences').select('id,name,latitude,longitude,radius_m,active').eq('company_id',s.companyId).eq('active',true);
    if(error) throw error;
    if(!(zones||[]).length) return {inside:null,geofenceId:null,zone:null};
    const matches=zones.map(z=>({...z,distance_m:distanceMeters(pos.latitude,pos.longitude,z.latitude,z.longitude)})).filter(z=>z.distance_m<=z.radius_m).sort((a,b)=>a.distance_m-b.distance_m);
    return matches.length?{inside:true,geofenceId:matches[0].id,zone:matches[0]}:{inside:false,geofenceId:null,zone:null};
  }
  async function maybeCreateGeofenceIncident(s,pos,inside,zone){
    if(inside!==false) return;
    const since=new Date(Date.now()-30*60000).toISOString();
    const recent=await PuntoSupabase.client.from('incidents').select('id').eq('company_id',s.companyId).eq('user_id',s.id).eq('type','geofencing').eq('status','open').gte('created_at',since).limit(1);
    if(recent.error) throw recent.error;
    if((recent.data||[]).length) return;
    await PuntoSupabase.client.from('incidents').insert({company_id:s.companyId,title:'Salida de geocerca',description:'El dispositivo del empleado ha registrado una posición fuera de las geocercas activas.',user_id:s.id,type:'geofencing',status:'open',created_by:s.id});
  }
  async function recordLocation(){
    const s=Auth.getSession(); if(!s||!(window.PuntoSupabase?.enabled&&s.provider==='supabase')) return null;
    const entry=await getCurrent(); if(!entry) return null;
    const pos=await location(); if(!pos) return null;
    const geo=await evaluateGeofence(s,pos);
    const payload={company_id:s.companyId,user_id:s.id,latitude:pos.latitude,longitude:pos.longitude,accuracy_m:pos.accuracy_m,recorded_at:nowIso(),source:'browser',inside_geofence:geo.inside,geofence_id:geo.geofenceId};
    const {data,error}=await PuntoSupabase.client.from('location_events').insert(payload).select().single();
    if(error) throw error;
    await maybeCreateGeofenceIncident(s,pos,geo.inside,geo.zone);
    return data;
  }
  function startLocationTracking(intervalMs=60000){
    stopLocationTracking(); recordLocation().catch(e=>console.debug('Punto Trabajo ubicación:',e));
    locationTimer=setInterval(()=>recordLocation().catch(e=>console.debug('Punto Trabajo ubicación:',e)),intervalMs);
  }
  function stopLocationTracking(){if(locationTimer){clearInterval(locationTimer);locationTimer=null}}
  window.TimeTracking={getCurrent,start,startBreak,endBreak,end,history,durationMs,netDurationMs,formatDuration,recordLocation,startLocationTracking,stopLocationTracking};
})();
