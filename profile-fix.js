(() => {
  'use strict';
  const sb = window.supabaseClient;
  const esc = s => String(s ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#039;'}[c]));
  let modal;
  function ensureModal(){
    if(modal) return modal;
    modal=document.createElement('div');
    modal.id='globalProfileModal';
    modal.innerHTML=`<div class="gpm-backdrop"></div><div class="gpm-card"><button class="gpm-close" aria-label="Fechar">×</button><div id="gpm-content">A carregar…</div></div>`;
    document.body.appendChild(modal);
    const st=document.createElement('style');st.textContent=`#globalProfileModal{position:fixed;inset:0;z-index:2147483647;display:none}#globalProfileModal.open{display:block}.gpm-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.65);backdrop-filter:blur(4px)}.gpm-card{position:relative;margin:8vh auto 0;max-width:520px;width:calc(100% - 32px);max-height:84vh;overflow:auto;background:#10141b;color:#fff;border:1px solid #2cff62;border-radius:20px;padding:22px;box-shadow:0 20px 80px #000}.gpm-close{position:absolute;right:12px;top:8px;background:transparent;border:0;color:#fff;font-size:30px;cursor:pointer}.gpm-avatar{width:82px;height:82px;border-radius:50%;object-fit:cover;background:#2cff62;display:block;margin:0 auto 12px}.gpm-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.gpm-actions button{cursor:pointer;border:0;border-radius:10px;padding:10px 14px}.gpm-list{margin-top:18px}.gpm-user{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #29303a}.gpm-user img{width:42px;height:42px;border-radius:50%;object-fit:cover;background:#222}`;document.head.appendChild(st);
    const close=()=>modal.classList.remove('open'); modal.querySelector('.gpm-close').onclick=close; modal.querySelector('.gpm-backdrop').onclick=close; return modal;
  }
  async function client(){ if(window.supabaseClient)return window.supabaseClient; const mod=await import('https://esm.sh/@supabase/supabase-js@2'); window.supabaseClient=mod.createClient('https://gfnpyzmhhwkpzvjwkckg.supabase.co','sb_publishable_CGhjWdOcexqk0ac_WyYfOg_3jif0Bwz'); return window.supabaseClient; }
  async function open(){
    const m=ensureModal();m.classList.add('open');const c=m.querySelector('#gpm-content');c.innerHTML='A carregar perfil…';
    try{
      const s=await client(); const {data:{user}}=await s.auth.getUser();
      if(!user){c.innerHTML='<h2>Perfil</h2><p>Inicia sessão para usar perfis e amigos.</p>';return;}
      let {data:p}=await s.from('profiles').select('*').eq('id',user.id).maybeSingle();
      if(!p){const username=(user.user_metadata?.username||user.email?.split('@')[0]||'utilizador').replace(/[^a-zA-Z0-9_.-]/g,'').slice(0,30)||'utilizador';await s.from('profiles').upsert({id:user.id,username,display_name:user.user_metadata?.display_name||username},{onConflict:'id'});p={id:user.id,username,display_name:username};}
      const avatar=p.avatar_url||'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="%232cff62"/><text x="50" y="65" text-anchor="middle" font-size="52">🙂</text></svg>';
      const {data:friends}=await s.from('friend_requests').select('*').or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`).eq('status','accepted');
      const ids=(friends||[]).map(x=>x.sender_id===user.id?x.receiver_id:x.sender_id);let friendProfiles=[];if(ids.length){const r=await s.from('profiles').select('*').in('id',ids);friendProfiles=r.data||[];}
      c.innerHTML=`<img class="gpm-avatar" src="${esc(avatar)}"><h2 style="text-align:center">${esc(p.display_name||p.username)}</h2><p style="text-align:center;color:#aab">@${esc(p.username)}</p><p>${esc(p.bio||'Sem biografia.')}</p><div class="gpm-actions"><button id="gpm-edit">Editar perfil</button><button id="gpm-refresh">Atualizar</button></div><div class="gpm-list"><h3>Amigos (${friendProfiles.length})</h3>${friendProfiles.map(f=>`<div class="gpm-user"><img src="${esc(f.avatar_url||avatar)}"><div><b>${esc(f.display_name||f.username)}</b><br><small>@${esc(f.username)}</small></div></div>`).join('')||'<p style="color:#aab">Ainda não tens amigos.</p>'}</div>`;
      c.querySelector('#gpm-refresh').onclick=open;
      c.querySelector('#gpm-edit').onclick=async()=>{c.innerHTML=`<h2>Editar perfil</h2><label>Nome</label><input id="gpm-name" value="${esc(p.display_name||'')}"><label>Avatar URL</label><input id="gpm-avatar" value="${esc(p.avatar_url||'')}"><label>Bio</label><textarea id="gpm-bio">${esc(p.bio||'')}</textarea><div class="gpm-actions"><button id="gpm-save">Guardar</button></div>`;const save=c.querySelector('#gpm-save');save.onclick=async()=>{const r=await s.from('profiles').upsert({id:user.id,display_name:c.querySelector('#gpm-name').value.trim(),avatar_url:c.querySelector('#gpm-avatar').value.trim(),bio:c.querySelector('#gpm-bio').value.trim(),username:p.username,updated_at:new Date().toISOString()},{onConflict:'id'});if(r.error)alert(r.error.message);else open();};};
    }catch(e){c.innerHTML=`<p>Erro ao carregar o perfil: ${esc(e.message)}</p>`;console.error('[ProfileFix]',e);}
  }
  function looksLikeProfile(el){
    if(!el||el===document.body)return false;const a=[el.id,el.className,el.getAttribute?.('aria-label'),el.getAttribute?.('title')].join(' ').toLowerCase();if(/perfil|profile|avatar|user-menu|user menu/.test(a))return true;const t=(el.textContent||'').trim();return ['👤','🙂','😀','😎','🐞','🦋'].includes(t)&&el.tagName!=='BODY';
  }
  function bind(){document.addEventListener('click',e=>{const el=e.target.closest?.('button,a,[role="button"]');if(looksLikeProfile(el)){e.preventDefault();e.stopImmediatePropagation();open();}},true);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();
