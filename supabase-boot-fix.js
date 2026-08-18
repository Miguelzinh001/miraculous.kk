(() => {
  'use strict';
  const URL = 'https://gfnpyzmhhwkpzvjwkckg.supabase.co';
  const KEY = 'sb_publishable_CGhjWdOcexqk0ac_WyYfOg_3jif0Bwz';
  let c = null;
  let rt = false;
  const $ = id => document.getElementById(id);
  async function client(){ if(c)return c; if(window.miraculousSupabase){c=window.miraculousSupabase;return c;} const mod=await import('https://esm.sh/@supabase/supabase-js@2'); c=mod.createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}); return c; }
  async function authUser(){ const x=await (await client()).auth.getUser(); return x.data?.user||null; }
  async function syncPublic(){
    const s=await client();
    const a=await s.from('global_announcements').select('*').order('created_at',{ascending:false});
    if(!a.error){ announcements=(a.data||[]).filter(x=>!x.expires_at||new Date(x.expires_at).getTime()>Date.now()).map(x=>({id:String(x.id),label:x.label||'NOVIDADE',title:x.title||'',text:x.body||'',color:x.color||'#e62b45',createdAt:Date.parse(x.created_at||'')||Date.now(),expiresAt:x.expires_at?Date.parse(x.expires_at):0})); if(typeof renderAnnouncements==='function')renderAnnouncements(); }
    const p=await s.from('profiles').select('*').order('username');
    if(!p.error) window.__supabaseProfiles=p.data||[];
  }
  async function syncAuthed(){
    const s=await client(); const me=await authUser(); if(!me)return;
    const fr=await s.from('friend_requests').select('id,sender_id,receiver_id,status,created_at');
    if(!fr.error){
      const map=new Map((window.__supabaseProfiles||[]).map(x=>[x.id,x.username]));
      friendships=(fr.data||[]).map(x=>({id:String(x.id),from:map.get(x.sender_id)||'',to:map.get(x.receiver_id)||'',senderId:x.sender_id,receiverId:x.receiver_id,status:x.status,createdAt:Date.parse(x.created_at||'')||Date.now()}));
      if(typeof renderFriends==='function')renderFriends();
    }
    const ps=await s.from('polls').select('*').order('created_at',{ascending:false});
    const os=await s.from('poll_options').select('*').order('sort_order');
    const vs=await s.from('votes').select('user_id,poll_id,option');
    if(!ps.error&&!os.error&&!vs.error){
      const names=new Map((window.__supabaseProfiles||[]).map(x=>[x.id,x.username]));
      polls=(ps.data||[]).map(p=>{const opts=(os.data||[]).filter(o=>o.poll_id===p.id).sort((x,y)=>x.sort_order-y.sort_order).map(o=>o.option_text);const votes={};(vs.data||[]).filter(v=>v.poll_id===p.id).forEach(v=>votes[names.get(v.user_id)||v.user_id]=v.option);return {id:p.id,question:p.title,description:p.description||'',options:opts.length?opts:(Array.isArray(p.options)?p.options:[]),votes,closed:false,startAt:null,endAt:p.closes_at?Date.parse(p.closes_at):0,createdAt:Date.parse(p.created_at||'')||Date.now()};});
      if(typeof renderPolls==='function')renderPolls(); if(typeof renderAdminPolls==='function')renderAdminPolls(); if(typeof renderMegaPolls==='function')renderMegaPolls();
    }
  }
  async function realtime(){
    if(rt)return; rt=true; const s=await client();
    s.channel('miraculous-v4-live').on('postgres_changes',{event:'*',schema:'public',table:'profiles'},()=>syncPublic().then(syncAuthed).catch(()=>{})).on('postgres_changes',{event:'*',schema:'public',table:'friend_requests'},()=>syncAuthed().catch(()=>{})).on('postgres_changes',{event:'*',schema:'public',table:'global_announcements'},()=>syncPublic().catch(()=>{})).on('postgres_changes',{event:'*',schema:'public',table:'polls'},()=>syncAuthed().catch(()=>{})).on('postgres_changes',{event:'*',schema:'public',table:'poll_options'},()=>syncAuthed().catch(()=>{})).on('postgres_changes',{event:'*',schema:'public',table:'votes'},()=>syncAuthed().catch(()=>{})).subscribe();
  }
  async function boot(){ try{ await syncPublic(); await syncAuthed(); await realtime(); }catch(e){ console.warn('[SupabaseBootFix]',e); } setInterval(()=>{syncPublic().then(syncAuthed).catch(()=>{});},15000); }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
