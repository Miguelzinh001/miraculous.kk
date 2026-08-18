(() => {
  "use strict";
  const sb = window.supabaseClient || window.miraculousSupabase;
  if (!sb) { console.error("[V5] Supabase client unavailable"); return; }
  const $ = id => document.getElementById(id);
  const esc = (v="") => String(v).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
  const toast = (msg,ok=true) => window.mkkToast ? window.mkkToast(ok?"Miraculous.kk":"Erro",msg,ok?"success":"error") : alert(msg);

  function remoteToLocal(r){
    return {id:String(r.id),series:"Miraculous",title:r.title||"Episódio",season:r.season||"—",number:r.episode_number||"—",lang:r.language||"PT-PT",desc:r.description||"",imdbUrl:"",trailerUrl:"",videoUrl:r.video_url||"",videoStorage:r.video_url?{kind:"vercel-blob",url:r.video_url}:null,videoKind:r.video_url?"mp4":"",videoType:"video/mp4",videoSize:0,subtitlesUrl:r.subtitles_url||"",subtitles:{},thumbnail:r.thumbnail_url||"",published:r.published!==false,updatedAt:Date.parse(r.updated_at||r.created_at||"")||Date.now()};
  }
  function localToRemote(e){return {id:e.id,title:e.title||"Episódio",season:e.season||"—",episode_number:e.number||"—",language:e.lang||"PT-PT",thumbnail_url:e.thumbnail||"",video_url:e.videoUrl||"",description:e.desc||"",subtitles_url:e.subtitlesUrl||"",published:true,sort_order:Number(e.number)||0,updated_at:new Date().toISOString()};}

  async function refreshGlobalEpisodes(){
    const {data,error}=await sb.from("episodes").select("id,title,season,episode_number,language,thumbnail_url,video_url,description,subtitles_url,published,sort_order,created_at,updated_at").eq("published",true).order("sort_order",{ascending:true}).order("created_at",{ascending:false});
    if(error){console.warn("[V5] episodes pull:",error.message);return false;}
    if(typeof window.getAll!=="function"||typeof window.put!=="function")return false;
    const remote=(data||[]).map(remoteToLocal),ids=new Set(remote.map(e=>String(e.id)));
    try{for(const row of await window.getAll("episodes")){if(!ids.has(String(row.id)))await window.remove("episodes",row.id)}for(const row of remote)await window.put("episodes",row);if(typeof window.loadData==="function")await window.loadData();return true}catch(e){console.warn("[V5] episode cache:",e);return false;}
  }
  async function assertAdmin(){const {data:{user}}=await sb.auth.getUser();if(!user)throw new Error("Inicia sessão.");await sb.rpc("bootstrap_first_admin").catch(()=>{});const {data,error}=await sb.from("admin_users").select("user_id").eq("user_id",user.id).maybeSingle();if(error)throw error;if(!data)throw new Error("Esta conta não é administradora.");return user;}
  async function deleteEpisodeRemote(id){await assertAdmin();const {error}=await sb.from("episodes").delete().eq("id",id);if(error)throw error;}

  async function setCurrentUser(user){
    if(!user)return;
    const username=user.user_metadata?.username||user.user_metadata?.display_name||(user.email||"utilizador").split("@")[0];
    let admin=false;
    try{await sb.rpc("bootstrap_first_admin");const {data}=await sb.from("admin_users").select("user_id").eq("user_id",user.id).maybeSingle();admin=!!data}catch(_){ }
    const {data:profile}=await sb.from("profiles").select("*").eq("id",user.id).maybeSingle();
    const account={username,email:user.email||"",supabaseUserId:user.id,password:"",photo:profile?.avatar_url||"",admin,role:admin?"admin":"user",flag:profile?.flag||"🌍",phrase:profile?.phrase||"Claws out!",bio:profile?.bio||"",profileColor:profile?.profile_color||"#e62b45",watched:Array.isArray(profile?.watched)?profile.watched:[],favorites:Array.isArray(profile?.favorites)?profile.favorites:[],ratings:profile?.ratings||{},progress:profile?.progress||{},blocked:Array.isArray(profile?.blocked)?profile.blocked:[],xp:Number(profile?.xp||0),lastSeen:Date.now(),createdAt:Date.parse(user.created_at||"")||Date.now()};
    if(typeof window.persistAccount==="function")await window.persistAccount(account);
    window.currentUser=account;
    window.saveCurrentSession?.();window.updateProfileUI?.();window.render?.();window.renderFriends?.();window.renderSocial?.();window.renderAchievements?.();
  }

  function patchAuth(){
    const form=$("registerForm");
    if(form&&!$("registerEmail")){const i=document.createElement("input");i.id="registerEmail";i.type="email";i.placeholder="Email";i.autocomplete="email";form.insertBefore(i,form.querySelector("#registerPass")?.closest(".passwordWrap")||form.firstChild)}
    $("loginUser")?.setAttribute("placeholder","Email");$("loginUser")?.setAttribute("type","email");
    $("loginBtn")?.addEventListener("click",async ev=>{ev.preventDefault();ev.stopImmediatePropagation();const email=$("loginUser")?.value.trim(),password=$("loginPass")?.value||"",msg=$("authMessage"),btn=$("loginBtn");if(!email||!password){if(msg)msg.innerHTML='<span class="error">❌ Preenche o email e a palavra-passe.</span>';return}btn.disabled=true;btn.textContent="A entrar…";try{const {data,error}=await sb.auth.signInWithPassword({email,password});if(error)throw error;await setCurrentUser(data.user);$("authModal")?.classList.add("hide");toast("Sessão iniciada.")}catch(e){if(msg)msg.innerHTML=`<span class="error">❌ ${esc(e.message||"Não foi possível iniciar sessão.")}</span>`}finally{btn.disabled=false;btn.textContent="Entrar"}},true);
    $("registerBtn")?.addEventListener("click",async ev=>{ev.preventDefault();ev.stopImmediatePropagation();const username=$("registerUser")?.value.trim(),email=$("registerEmail")?.value.trim(),password=$("registerPass")?.value||"",password2=$("registerPass2")?.value||"",msg=$("authMessage"),btn=$("registerBtn");if(!username||username.length<3||!email||!email.includes("@")||password.length<6||password!==password2){if(msg)msg.innerHTML='<span class="error">❌ Preenche o nome, um email válido e uma palavra-passe com pelo menos 6 caracteres (iguais).</span>';return}btn.disabled=true;btn.textContent="A criar…";try{const {data,error}=await sb.auth.signUp({email,password,options:{data:{username,display_name:username}}});if(error)throw error;if(data.user)await sb.from("profiles").upsert({id:data.user.id,username,display_name:username,phrase:"Claws out!",updated_at:new Date().toISOString()},{onConflict:"id"});if(data.session){await setCurrentUser(data.user);$("authModal")?.classList.add("hide");toast("Conta criada.")}else if(msg)msg.innerHTML='<span class="success">✅ Conta criada. Confirma o email e depois inicia sessão.</span>'}catch(e){if(msg)msg.innerHTML=`<span class="error">❌ ${esc(e.message||"Não foi possível criar a conta.")}</span>`}finally{btn.disabled=false;btn.textContent="Criar conta"}},true);
    $("logoutButton")?.addEventListener("click",async ev=>{ev.preventDefault();ev.stopImmediatePropagation();await sb.auth.signOut();window.currentUser=null;window.saveCurrentSession?.();window.updateProfileUI?.();window.render?.()},true);
  }

  let editingId=null;
  function patchEdit(){const original=window.editEpisode;if(typeof original!=="function"||original.__v5Wrapped)return;const wrapped=function(id){editingId=id;window.__mkkV5EditingId=id;return original(id)};wrapped.__v5Wrapped=true;window.editEpisode=wrapped;$("cancelEdit")?.addEventListener("click",()=>{editingId=null;window.__mkkV5EditingId=null});}

  async function patchAdminSave(){
    const add=$("add");if(!add||add.dataset.v5Bound==="1")return;add.dataset.v5Bound="1";
    add.addEventListener("click",async ev=>{ev.preventDefault();ev.stopImmediatePropagation();try{await assertAdmin();const title=$("title")?.value.trim();if(!title)throw new Error("Escreve um título.");const id=window.__mkkV5EditingId||crypto.randomUUID();const old=(typeof window.getAll==="function"?await window.getAll("episodes"):[]).find(e=>String(e.id)===String(id));let videoUrl=$("videoUrl")?.value.trim()||old?.videoUrl||"",thumbnail=old?.thumbnail||"",subtitlesUrl=old?.subtitlesUrl||"";const videoFile=$("videoFile")?.files?.[0];if(videoFile){if(!/\.mp4$/i.test(videoFile.name)&&!String(videoFile.type).startsWith("video/"))throw new Error("Seleciona um MP4 válido.");$("status").innerHTML='<div class="notice">☁️ A enviar o MP4… <b id="v5VideoProgress">0%</b></div>';const meta=await window.uploadVideoToVercelBlob(videoFile,id,p=>{const x=$("v5VideoProgress");if(x)x.textContent=p+"%"});videoUrl=meta.url}
      const thumbFile=$("thumb")?.files?.[0];if(thumbFile)thumbnail=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result||""));r.onerror=()=>rej(r.error);r.readAsDataURL(thumbFile)});
      const subFile=$("subtitleFile")?.files?.[0];if(subFile){const txt=await subFile.text();subtitlesUrl="data:text/vtt;charset=utf-8,"+encodeURIComponent("WEBVTT\n\n"+txt.replace(/\r/g,"").replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g,"$1.$2"))}
      const row={id,title,season:$("season")?.value.trim()||"—",episode_number:$("number")?.value.trim()||"—",language:$("lang")?.value.trim()||"PT-PT",thumbnail_url:thumbnail,video_url:videoUrl,description:$("desc")?.value.trim()||"",subtitles_url:subtitlesUrl,published:true,sort_order:Number($("number")?.value||0),updated_at:new Date().toISOString()};$("status").innerHTML='<div class="notice">🌍 A publicar na database global…</div>';const {data,error}=await sb.from("episodes").upsert(row,{onConflict:"id"}).select().single();if(error)throw error;await window.put("episodes",remoteToLocal(data));window.__mkkV5EditingId=null;editingId=null;window.resetForm?.();await window.loadData?.();$("status").innerHTML='<div class="notice success">✅ Episódio publicado globalmente para toda a gente.</div>';toast("Episódio publicado para todos.")}catch(e){console.error("[V5] publish episode",e);$("status").innerHTML=`<div class="notice error">❌ ${esc(e.message||"Não foi possível publicar o episódio.")}</div>`}},true);
  }

  function patchDelete(){const original=window.deleteEpisode;if(typeof original!=="function"||original.__v5)return;const fn=async id=>{try{await deleteEpisodeRemote(id);await window.remove?.("episodes",id);await refreshGlobalEpisodes();toast("Episódio apagado.")}catch(e){alert("Não foi possível apagar: "+(e.message||e))}};fn.__v5=true;window.deleteEpisode=fn;}

  async function start(){
    patchAuth();patchEdit();await refreshGlobalEpisodes();
    sb.channel("miraculous-v5").on("postgres_changes",{event:"*",schema:"public",table:"episodes"},()=>refreshGlobalEpisodes()).subscribe();
    sb.auth.onAuthStateChange((_event,session)=>{if(session?.user)setCurrentUser(session.user).catch(console.error);else window.updateProfileUI?.()});
    const {data:{session}}=await sb.auth.getSession();if(session?.user)await setCurrentUser(session.user);
    await patchAdminSave();patchDelete();
    console.log("[V5] database global + auth + realtime + MP4 ready");
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();
