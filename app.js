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
  const { data, error } = await supabase.from('global_announcements').select('*').order('created_at', {ascending:false});
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
  if($('episodes')) $('episodes').innerHTML=list.map(e=>`<article class="card"><div class="thumb"${e.thumbnail_url?` style="background-image:url('${esc(e.thumbnail_url)}')`:''}>${e.thumbnail_url?'':'🐞'}</div><div class="card-body"><div class="card-title">${esc(e.title)}</div><div class="card-meta">${esc(e.season)} · ${esc(e.episode_number)} · ${esc(e.language)}</div></div></article>`).join('') || '<p class="muted">Nenhum resultado.</p>';
  if($('count')) $('count').textContent=episodes.length; renderAdminList();
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
supabase.auth.onAuthStateChange(()=>{loadEpisodes();loadAnnouncements();});
loadEpisodes();loadAnnouncements();
