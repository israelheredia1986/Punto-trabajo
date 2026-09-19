(function(){
  const cfg = window.PUNTO_TRABAJO_SUPABASE;
  const valid = cfg && cfg.url && cfg.anonKey && !cfg.url.includes('TU-PROYECTO') && !cfg.anonKey.includes('TU_SUPABASE');

  window.PuntoSupabase = {
    enabled: false,
    client: null,
    async signIn(email, password){
      if(!this.enabled) return { data:null, error:new Error('Supabase no está configurado todavía.') };
      return this.client.auth.signInWithPassword({email, password});
    },
    async signUp(email,password,metadata={}){
      if(!this.enabled) return { data:null, error:new Error('Supabase no está configurado todavía.') };
      return this.client.auth.signUp({email,password,options:{data:metadata}});
    },
    async signOut(){
      if(!this.enabled) return { error:null };
      return this.client.auth.signOut();
    },
    async getSession(){
      if(!this.enabled) return { data:{ session:null }, error:null };
      return this.client.auth.getSession();
    }
  };

  if(!valid){
    console.info('Punto Trabajo: Supabase pendiente de configuración. Se mantiene el modo demo.');
    return;
  }

  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  script.onload = function(){
    if(!window.supabase?.createClient) return;
    PuntoSupabase.client = window.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession:true, autoRefreshToken:true, detectSessionInUrl:true }
    });
    PuntoSupabase.enabled = true;
    window.dispatchEvent(new CustomEvent('punto:supabase-ready'));
  };
  script.onerror = function(){
    console.warn('Punto Trabajo: no se pudo cargar Supabase JS.');
  };
  document.head.appendChild(script);
})();
