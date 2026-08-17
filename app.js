import { supabase } from './supabase.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

let episodes = [];

async function loadEpisodes(){
  const { data, error } = await supabase.from('episodes').select('*').eq('published', true).order('sort_order').order('created_at', {ascending:false});
  if(error){ console.error(error); episodes=[]; }
  else episodes=data || [];
  renderEpisodes($('search')?.value || '');
}

function renderEpisodes(f=''){
  const q=f.toLowerCase();
  const list=episodes.filter(e=>`${e.title} ${e.season} ${e.episode_number} ${e.language}`.toLowerCase().includes(q));
  if($('episodes')) $('episodes').innerHTML=list.map(e=>`<article class="card"><div class="thumb"${e.thumbnail_url?` style="background-image:url('${esc(e.thumbnail_url)}')"`:''}>${e.thumbnail_url?'':'🐞'}</div><div class="card-body"><div class="card-title">${esc(e.title)}</div><div class="card-meta">${esc(e.season)} · ${esc(e.episode_number)} · ${esc(e.language)}</div></div></article>`).join('') || '<p class="muted">Nenhum resultado.</p>';
  if($('count')) $('count').textContent=episodes.length;
  renderAdminList();
}

function renderAdminList(){
  if(!$('adminList')) return;
  $('adminList').innerHTML=episodes.map(e=>`<div class="admin-item"><div><b>${esc(e.title)}</b><br><span class="muted">${esc(e.season)} · ${esc(e.episode_number)}</span></div><button class="delete" data-id="${e.id}">Apagar</button></div>`).join('');
  document.querySelectorAll('.delete').forEach(btn=>btn.onclick=async()=>{
    if(!confirm('Apagar este episódio?')) return;
    const {error}=await supabase.from('episodes').delete().eq('id',btn.dataset.id);
    if(error) return alert('Não foi possível apagar: '+error.message);
    await loadEpisodes();
  });
}

if($('search')) $('search').oninput=e=>renderEpisodes(e.target.value);
if($('openLogin')) $('openLogin').onclick=()=> $('loginModal')?.classList.remove('hidden');
if($('closeLogin')) $('closeLogin').onclick=()=> $('loginModal')?.classList.add('hidden');
if($('closeAdmin')) $('closeAdmin').onclick=()=> $('adminPanel')?.classList.add('hidden');

if($('loginBtn')) $('loginBtn').onclick=async()=>{
  const email=$('username')?.value.trim();
  const password=$('password')?.value;
  const {error}=await supabase.auth.signInWithPassword({email,password});
  if(error){ $('loginError').textContent='Credenciais inválidas.'; return; }
  const {data:{user}}=await supabase.auth.getUser();
  const {data:admin}=await supabase.from('admin_users').select('user_id').eq('user_id',user.id).maybeSingle();
  if(!admin){ await supabase.auth.signOut(); $('loginError').textContent='Esta conta não é administradora.'; return; }
  $('loginModal')?.classList.add('hidden'); $('adminPanel')?.classList.remove('hidden'); renderAdminList();
};

if($('logout')) $('logout').onclick=async()=>{await supabase.auth.signOut();$('adminPanel')?.classList.add('hidden');};

if($('addEpisode')) $('addEpisode').onclick=async()=>{
  const title=$('epTitle')?.value.trim();
  if(!title) return alert('Escreve um título.');
  const payload={
    title,
    season:$('epSeason')?.value||'—',
    episode_number:$('epNumber')?.value||'—',
    thumbnail_url:$('epThumb')?.value||'',
    video_url:$('epVideo')?.value||'',
    language:$('epLang')?.value||'PT-PT',
    description:$('epDesc')?.value||'',
    published:true
  };
  const {error}=await supabase.from('episodes').insert(payload);
  if(error) return alert('Erro ao guardar: '+error.message);
  ['epTitle','epSeason','epNumber','epThumb','epVideo','epLang','epDesc'].forEach(id=>{if($(id)) $(id).value='';});
  await loadEpisodes();
  alert('Episódio publicado para todos!');
};

supabase.auth.onAuthStateChange((event,session)=>{ if(session && $('adminPanel')) renderAdminList(); });
loadEpisodes();
