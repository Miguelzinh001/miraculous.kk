import { supabase } from './supabase.js';

const textOf = el => (el?.textContent || '').trim().toLowerCase().replace(/\s+/g,' ');
let modal;

function ensureModal(){
  if(modal) return modal;
  modal=document.createElement('div');
  modal.id='mk-auth-center-modal';
  modal.innerHTML=`<div class="mk-fix-backdrop"></div><div class="mk-fix-box"><button class="mk-fix-close" aria-label="Fechar">×</button><div id="mk-fix-content"></div></div>`;
  document.body.appendChild(modal);
  modal.querySelector('.mk-fix-backdrop').onclick=closeModal;
  modal.querySelector('.mk-fix-close').onclick=closeModal;
  return modal;
}
function closeModal(){ modal?.classList.remove('show'); }
function show(title,html){ const m=ensureModal(); m.querySelector('#mk-fix-content').innerHTML=`<h2>${title}</h2>${html}`; m.classList.add('show'); }

function login(){
  show('Iniciar sessão',`<p class="mk-fix-muted">Entra na tua conta miraculous.kk.</p><input id="mk-email" type="email" placeholder="Email" autocomplete="email"><input id="mk-password" type="password" placeholder="Palavra-passe" autocomplete="current-password"><button class="mk-fix-primary" id="mk-login-submit">Iniciar sessão</button><button class="mk-fix-link" id="mk-to-signup">Ainda não tens conta? Criar conta</button><div class="mk-fix-error" id="mk-auth-error"></div>`);
  modal.querySelector('#mk-login-submit').onclick=async()=>{ const email=modal.querySelector('#mk-email').value.trim(),password=modal.querySelector('#mk-password').value; const err=modal.querySelector('#mk-auth-error'); if(!email||!password){err.textContent='Preenche o email e a palavra-passe.';return;} const {error}=await supabase.auth.signInWithPassword({email,password}); if(error){err.textContent=error.message;return;} closeModal(); window.dispatchEvent(new CustomEvent('miraculous-auth-changed')); };
  modal.querySelector('#mk-to-signup').onclick=signup;
}
function signup(){
  show('Criar conta',`<p class="mk-fix-muted">Cria a tua conta gratuita.</p><input id="mk-signup-name" type="text" placeholder="Nome de utilizador" autocomplete="username"><input id="mk-signup-email" type="email" placeholder="Email" autocomplete="email"><input id="mk-signup-password" type="password" placeholder="Palavra-passe (mín. 6 caracteres)" autocomplete="new-password"><button class="mk-fix-primary" id="mk-signup-submit">Criar conta</button><button class="mk-fix-link" id="mk-to-login">Já tenho conta · Iniciar sessão</button><div class="mk-fix-error" id="mk-auth-error"></div>`);
  modal.querySelector('#mk-signup-submit').onclick=async()=>{ const name=modal.querySelector('#mk-signup-name').value.trim(),email=modal.querySelector('#mk-signup-email').value.trim(),password=modal.querySelector('#mk-signup-password').value,err=modal.querySelector('#mk-auth-error'); if(!name||!email||password.length<6){err.textContent='Preenche tudo e usa uma palavra-passe com pelo menos 6 caracteres.';return;} const {data,error}=await supabase.auth.signUp({email,password,options:{data:{username:name,display_name:name}}}); if(error){err.textContent=error.message;return;} if(data.user){ await supabase.from('profiles').upsert({id:data.user.id,username:name,display_name:name}); } err.textContent='Conta criada! Verifica o teu email se a confirmação estiver ativada.'; setTimeout(closeModal,1600); };
  modal.querySelector('#mk-to-login').onclick=login;
}
function center(){
  show('Centro miraculous.kk',`<p class="mk-fix-muted">Aqui podes encontrar ajuda rápida.</p><div class="mk-help"><b>🎬 Episódios</b><span>Escolhe um episódio para abrir o player.</span></div><div class="mk-help"><b>👤 Conta</b><span>Usa Iniciar sessão ou Criar conta para teres o teu perfil.</span></div><div class="mk-help"><b>🗳️ Votações e 🤝 amigos</b><span>Estas funções ficam ligadas à tua conta.</span></div>`);
}

function handleClick(e){
  const el=e.target.closest('button,a,[role="button"]'); if(!el) return;
  const t=textOf(el);
  if(/^(iniciar sessão|iniciar|entrar|login)$/.test(t) || t.includes('iniciar sessão')){ e.preventDefault(); login(); return; }
  if(t.includes('criar conta') || t.includes('registar') || t.includes('cadastro')){ e.preventDefault(); signup(); return; }
  if(t.includes('abrir centro') || t==='centro' || t.includes('centro de ajuda')){ e.preventDefault(); center(); return; }
}

document.addEventListener('click',handleClick,true);
window.addEventListener('miraculous-open-login',login);
window.addEventListener('miraculous-open-signup',signup);
window.addEventListener('miraculous-open-center',center);

const style=document.createElement('style');
style.textContent=`#mk-auth-center-modal{display:none;position:fixed;inset:0;z-index:99999;place-items:center;padding:18px}.mk-fix-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.78);backdrop-filter:blur(8px)}#mk-auth-center-modal.show{display:grid}.mk-fix-box{position:relative;width:min(430px,100%);max-height:90vh;overflow:auto;background:#101015;border:1px solid #30303a;border-radius:22px;padding:26px;color:#fff;box-shadow:0 20px 70px #000}.mk-fix-box h2{margin:0 0 8px;font-size:28px}.mk-fix-box input{display:block;width:100%;margin:9px 0;padding:13px;border-radius:11px;border:1px solid #30303a;background:#08080c;color:#fff;outline:none}.mk-fix-close{position:absolute;right:12px;top:8px;background:none;border:0;color:#aaa;font-size:29px;cursor:pointer}.mk-fix-primary{width:100%;margin-top:10px;padding:13px;border:0;border-radius:11px;background:#e62b45;color:#fff;font-weight:800;cursor:pointer}.mk-fix-link{width:100%;margin-top:10px;padding:10px;background:none;border:0;color:#ff7180;cursor:pointer}.mk-fix-muted{color:#a5a5b2;line-height:1.6}.mk-fix-error{min-height:20px;margin-top:10px;color:#ff7180;font-size:13px}.mk-help{padding:13px;margin:9px 0;border:1px solid #292933;border-radius:12px;background:#08080c}.mk-help b{display:block}.mk-help span{display:block;color:#a5a5b2;font-size:13px;margin-top:4px}`;
document.head.appendChild(style);
