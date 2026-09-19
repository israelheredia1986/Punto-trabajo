/* Punto Trabajo - real first-company onboarding */
(function(){
  function ready(){
    if(!window.PuntoSupabase?.enabled) return;
    const form=document.querySelector('.auth-form');
    if(!form || document.querySelector('#realOnboardingButton')) return;
    const button=document.createElement('button');
    button.type='button'; button.id='realOnboardingButton';
    button.className='btn secondary'; button.textContent='Crear empresa y cuenta';
    button.onclick=async function(){
      const email=document.querySelector('#loginEmail')?.value?.trim().toLowerCase();
      const password=document.querySelector('#loginPassword')?.value||'';
      const error=document.querySelector('#loginError');
      if(!email||!password){if(error)error.textContent='Introduce primero email y contraseña.';return;}
      const company=prompt('Nombre de la empresa');
      const fullName=prompt('Tu nombre');
      if(!company||!fullName)return;
      button.disabled=true; button.textContent='Creando…';
      try{
        const result=await PuntoSupabase.signUp(email,password,{full_name:fullName});
        if(result.error)throw result.error;
        if(!result.data?.session){if(error)error.textContent='Cuenta creada. Confirma tu correo y vuelve a iniciar sesión.';return;}
        const uid=result.data.user.id;
        const c=await PuntoSupabase.client.from('companies').insert({name:company.trim(),created_by:uid}).select('id,name').single();
        if(c.error)throw c.error;
        const m=await PuntoSupabase.client.from('company_memberships').insert({company_id:c.data.id,user_id:uid,role:'admin',status:'active',job_title:'Administrador'});
        if(m.error)throw m.error;
        if(window.Auth?.loadSupabaseUserSession)await window.Auth.loadSupabaseUserSession();
        if(window.go)go('dashboard');
      }catch(err){if(error)error.textContent=err?.message||'No se pudo crear la empresa.';}
      finally{button.disabled=false;button.textContent='Crear empresa y cuenta';}
    };
    form.appendChild(button);
  }
  window.addEventListener('punto:supabase-ready',ready);
  setTimeout(ready,1000);
})();
