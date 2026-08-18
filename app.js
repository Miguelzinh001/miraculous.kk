import { supabase } from './supabase.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
let episodes = [], announcements = [];

async function loadEpisodes(){
  const { data, error } = await supabase.from('episodes').select('*').eq('published', true).order('sort_order').order('created_at', {ascending:false});
  if(error) console.error('episodes:', error); else episodes=data || [];
  renderEpisodes($('search')?.value || '');
}
async function loadAnnouncements(){
  const { data, error } = await supabase.from('global_announcements').select('*').order('created_at',{ascending:false});
  if(error){ console.error('global_announcements:', error); return; }
  announcements=data || []; renderAnnouncements();
}
function renderAnnouncements(){
  const html=announcements.map(a=>`<div class="announcement" data-id="${esc(a.id)}"><span class="announcement-label"${a.color?` style="color:${esc(a.color)}"`:''}>${esc(a.label || 'NOVIDADE')}</span><span>${esc(a.title || '')}</span>${a.body?`<div>${esc(a.body)}</div>`:''}</div>`).join('');
  ['announcements','announcementList','newsList'].forEach(id=>{if($(id)) $(id).innerHTML=html || '<p class="muted">Sem novidades.</p>';});
  renderAdminAnnouncements();
}
function renderEpisodes(f=''){
  const q=f.toLowerCase(); const list=episodes.filter(e=>`${e.title} ${e.season} ${e.episode_number} ${e.language}`.toLowerCase().includes(q));
  if($('episodes')) $('episodes').innerHTML=list.map(e=>`<article class="card episode-card" data-id="${esc(e.id)}"><div class="thumb"${e.thumbnail_url?` style="background-image:url('${esc(e.thumbnail_url)}')`:''}>${e.thumbnail_url?'':'🐞'}<button class="episode-play" aria-label="Reproduzir">▶</button></div><div class="card-body"><div class="card-title">${esc(e.title)}</div><div class="card-meta">${esc(e.season)} · ${esc(e.episode_number)} · ${esc(e.language)}</div></div></article>`).join('') || '<p class="muted">Nenhum resultado.</p>';
  if($('count')) $('count').textContent=episodes.length; renderAdminList();
  document.querySelectorAll('.episode-card').forEach(card=>card.onclick=()=>openPlayer(card.dataset.id));
}
function renderAdminList(){
  if(!$('adminList')) return; $('adminList').innerHTML=episodes.map(e=>`<div class="admin-item"><div><b>${esc(e.title)}</b><br><span class="muted">${esc(e.season)} · ${esc(e.episode_number)}</span></div><button class="delete" data-id="${esc(e.id)}">Apagar</button></div>`).join('');
  document.querySelectorAll('.delete').forEach(btn=>btn.onclick=async()=>{if(!confirm('Apagar este episódio?'))return;const {error}=await supabase.from('episodes').delete().eq('id',btn.dataset.id);if(error)return alert('Não foi possível apagar: '+error.message);await loadEpisodes();});
}
function renderAdminAnnouncements(){
  if(!$('adminAnnouncements')) return; $('adminAnnouncements').innerHTML=announcements.map(a=>`<div class="admin-item"><div><b>${esc(a.title)}</b><br><span class="muted">${esc(a.label || 'NOVIDADE')}</span></div><button class="delete-announcement" data-id="${esc(a.id)}">Apagar</button></div>`).join('');
  document.querySelectorAll('.delete-announcement').forEach(btn=>btn.onclick=async()=>{if(!confirm('Apagar este anúncio?'))return;const {error}=await supabase.from('global_announcements').delete().eq('id',btn.dataset.id);if(error)return alert('Não foi possível apagar: '+error.message);await loadAnnouncements();});
}
if($('search')) $('search').oninput=e=>renderEpisodes(e.target.value);
if($('openLogin')) $('openLogin').onclick=()=> $('loginModal')?.classList.remove('hidden');
if($('closeLogin')) $('closeLogin').onclick=()=> $('loginModal')?.classList.add('hidden');
if($('closeAdmin')) $('closeAdmin').onclick=()=> $('adminPanel')?.classList.add('hidden');

if($('loginBtn')) $('loginBtn').onclick=async()=>{
  const email=$('username')?.value.trim(), password=$('password')?.value;
  const {error}=await supabase.auth.signInWithPassword({email,password});
  if(error){if($('loginError'))$('loginError').textContent='Credenciais inválidas.';return;}
  const {data:{user}}=await supabase.auth.getUser();
  await supabase.rpc('bootstrap_first_admin');
  const {data:admin,error:adminError}=await supabase.from('admin_users').select('user_id').eq('user_id',user.id).maybeSingle();
  if(adminError||!admin){await supabase.auth.signOut();if($('loginError'))$('loginError').textContent='Esta conta não é administradora.';return;}
  $('loginModal')?.classList.add('hidden');$('adminPanel')?.classList.remove('hidden');renderAdminList();renderAdminAnnouncements();
};
if($('logout')) $('logout').onclick=async()=>{await supabase.auth.signOut();$('adminPanel')?.classList.add('hidden');};
if($('addEpisode')) $('addEpisode').onclick=async()=>{
  const title=$('epTitle')?.value.trim();if(!title)return alert('Escreve um título.');
  const payload={title,season:$('epSeason')?.value||'—',episode_number:$('epNumber')?.value||'—',thumbnail_url:$('epThumb')?.value||'',video_url:$('epVideo')?.value||'',language:$('epLang')?.value||'PT-PT',description:$('epDesc')?.value||'',published:true};
  const {error}=await supabase.from('episodes').insert(payload);if(error)return alert('Erro ao guardar: '+error.message);
  ['epTitle','epSeason','epNumber','epThumb','epVideo','epLang','epDesc'].forEach(id=>{if($(id))$(id).value='';});await loadEpisodes();alert('Episódio publicado para todos!');
};
async function addAnnouncementFromForm(){
  const titleEl=$('announcementTitle')||$('annTitle')||$('newsTitle'),bodyEl=$('announcementText')||$('annText')||$('newsText'),labelEl=$('announcementLabel')||$('annLabel')||$('newsLabel'),colorEl=$('announcementColor')||$('annColor')||$('newsColor');
  const title=titleEl?.value.trim()||bodyEl?.value.trim(),body=bodyEl?.value.trim()||title,label=labelEl?.value.trim()||'NOVIDADE',color=colorEl?.value||'#e62b45';
  if(!title)return false; const {data:{user}}=await supabase.auth.getUser(); if(!user)return alert('Inicia sessão como administrador primeiro.');
  const {error}=await supabase.from('global_announcements').insert({id:crypto.randomUUID(),title,body,label,color});
  if(error){console.error('global announcement insert:',error);alert('Erro ao guardar anúncio: '+error.message);return true;}
  ["announcementTitle","annTitle","newsTitle","announcementText","annText","newsText"].forEach(id=>{if($(id))$(id).value='';});await loadAnnouncements();alert('Anúncio publicado para todos!');return true;
}
['addAnnouncement','publishAnnouncement','saveAnnouncement','addNews','publishNews'].forEach(id=>{if($(id))$(id).onclick=addAnnouncementFromForm;});
supabase.channel('global-announcements-live').on('postgres_changes',{event:'*',schema:'public',table:'global_announcements'},()=>loadAnnouncements()).subscribe();

/* PLAYER PERSONALIZADO — HTML5, inspirado no layout da imagem */
let playerRoot=null, playerVideo=null, currentEpisode=null, subtitleTrack=null;
function ensurePlayer(){
  if(playerRoot) return;
  playerRoot=document.createElement('div'); playerRoot.className='mk-player-overlay hidden';
  playerRoot.innerHTML=`<div class="mk-player-wrap"><button class="mk-player-close" aria-label="Fechar">×</button><div class="mk-player"><video playsinline preload="metadata"></video><div class="mk-player-top"><button class="mk-icon" data-action="cast" title="Transmitir">⌁</button><div class="mk-spacer"></div><button class="mk-icon" data-action="download" title="Transferir">⇩</button><button class="mk-icon" data-action="settings" title="Definições">⚙</button></div><button class="mk-big-play" data-action="play" aria-label="Reproduzir">▶</button><div class="mk-player-bottom"><div class="mk-progress"><input type="range" min="0" max="1000" value="0" aria-label="Progresso"></div><div class="mk-controls"><button class="mk-icon" data-action="play">▶</button><span class="mk-time">0:00 / 0:00</span><button class="mk-icon" data-action="mute">🔊</button><input class="mk-volume" type="range" min="0" max="1" step="0.01" value="1"><div class="mk-spacer"></div><button class="mk-icon" data-action="fullscreen">⛶</button></div></div><div class="mk-settings hidden"><button data-menu="reproducao">◉ <b>Reprodução</b><span>›</span></button><button data-menu="acessibilidade">♿ <b>Acessibilidade</b><span>›</span></button><button data-menu="audio">♫ <b>Áudio</b><span>›</span></button></div><div class="mk-menu hidden"></div></div><div class="mk-player-title"></div></div>`;
  document.body.appendChild(playerRoot); playerVideo=playerRoot.querySelector('video');
  const close=()=>{playerVideo.pause();playerRoot.classList.add('hidden');document.body.classList.remove('mk-player-open');};
  playerRoot.querySelector('.mk-player-close').onclick=close; playerRoot.addEventListener('click',e=>{if(e.target===playerRoot)close();});
  playerRoot.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>playerAction(b.dataset.action));
  playerRoot.querySelector('.mk-progress input').oninput=e=>{if(playerVideo.duration)playerVideo.currentTime=(+e.target.value/1000)*playerVideo.duration;};
  playerRoot.querySelector('.mk-volume').oninput=e=>{playerVideo.volume=+e.target.value;playerVideo.muted=false;};
  playerVideo.addEventListener('timeupdate',updatePlayerUI); playerVideo.addEventListener('loadedmetadata',updatePlayerUI); playerVideo.addEventListener('play',updatePlayerUI); playerVideo.addEventListener('pause',updatePlayerUI);
  playerRoot.querySelectorAll('[data-menu]').forEach(b=>b.onclick=()=>showPlayerMenu(b.dataset.menu));
  document.addEventListener('keydown',e=>{if(playerRoot.classList.contains('hidden'))return;if(e.key==='Escape')close();if(e.key===' '){e.preventDefault();playerAction('play');}if(e.key==='ArrowRight')playerVideo.currentTime=Math.min((playerVideo.duration||Infinity),playerVideo.currentTime+5);if(e.key==='ArrowLeft')playerVideo.currentTime=Math.max(0,playerVideo.currentTime-5);});
}
function openPlayer(id){const ep=episodes.find(x=>String(x.id)===String(id));if(!ep||!ep.video_url){alert('Este episódio ainda não tem vídeo disponível.');return;}ensurePlayer();currentEpisode=ep;playerVideo.src=ep.video_url;playerVideo.poster=ep.thumbnail_url||'';playerRoot.querySelector('.mk-player-title').textContent=ep.title||'Miraculous';playerRoot.classList.remove('hidden');document.body.classList.add('mk-player-open');playerVideo.play().catch(()=>{});}
function playerAction(action){if(!playerVideo)return;if(action==='play')playerVideo.paused?playerVideo.play():playerVideo.pause();else if(action==='mute')playerVideo.muted=!playerVideo.muted;else if(action==='fullscreen'){const p=playerRoot.querySelector('.mk-player');if(document.fullscreenElement)document.exitFullscreen();else p.requestFullscreen?.();}else if(action==='download'){if(currentEpisode?.video_url){const a=document.createElement('a');a.href=currentEpisode.video_url;a.download=(currentEpisode.title||'episodio')+'.mp4';a.target='_blank';a.rel='noopener';a.click();}}else if(action==='cast'){if(playerVideo.remote?.prompt)playerVideo.remote.prompt().catch(()=>{});else alert('O Cast depende do suporte do dispositivo/navegador.');}else if(action==='settings')playerRoot.querySelector('.mk-settings').classList.toggle('hidden');}
function updatePlayerUI(){if(!playerVideo||!playerRoot)return;const t=playerVideo.currentTime||0,d=playerVideo.duration||0;playerRoot.querySelector('.mk-time').textContent=`${fmt(t)} / ${fmt(d)}`;playerRoot.querySelector('.mk-progress input').value=d?(t/d)*1000:0;playerRoot.querySelectorAll('[data-action="play"]').forEach(b=>b.textContent=playerVideo.paused?'▶':'Ⅱ');playerRoot.querySelector('[data-action="mute"]').textContent=playerVideo.muted?'🔇':'🔊';}
function fmt(s){if(!Number.isFinite(s))return '0:00';const m=Math.floor(s/60),sec=Math.floor(s%60);return `${m}:${String(sec).padStart(2,'0')}`;}
function showPlayerMenu(type){const box=playerRoot.querySelector('.mk-menu');playerRoot.querySelector('.mk-settings').classList.add('hidden');box.classList.remove('hidden');let html='';if(type==='reproducao')html='<button data-speed="0.75">Velocidade 0,75×</button><button data-speed="1">Velocidade 1×</button><button data-speed="1.25">Velocidade 1,25×</button><button data-speed="1.5">Velocidade 1,5×</button><button data-speed="2">Velocidade 2×</button>';if(type==='acessibilidade')html='<button>Legendas: Desligadas</button><button data-sub="import">Importar .SRT</button>';if(type==='audio')html='<button>Áudio original</button>';box.innerHTML=html;box.querySelectorAll('[data-speed]').forEach(b=>b.onclick=()=>{playerVideo.playbackRate=+b.dataset.speed;box.classList.add('hidden');});box.querySelector('[data-sub="import"]')?.addEventListener('click',importSRT);}
function importSRT(){const input=document.createElement('input');input.type='file';input.accept='.srt,.vtt,text/vtt';input.onchange=async()=>{const file=input.files?.[0];if(!file)return;const text=await file.text();const vtt='WEBVTT\n\n'+text.replace(/\r/g,'').replace(/(\d{2}:\d{2}),(\d{3})/g,'$1.$2');const blob=new Blob([vtt],{type:'text/vtt'});if(subtitleTrack)subtitleTrack.remove();subtitleTrack=document.createElement('track');subtitleTrack.kind='subtitles';subtitleTrack.label='Legendas';subtitleTrack.srclang='pt';subtitleTrack.src=URL.createObjectURL(blob);playerVideo.appendChild(subtitleTrack);subtitleTrack.track.mode='showing';};input.click();}

supabase.auth.onAuthStateChange(()=>{loadEpisodes();loadAnnouncements();});
loadEpisodes();loadAnnouncements();
