import { supabase } from './supabase.js';

export async function getProfile(userId){ return supabase.from('profiles').select('*').eq('id',userId).maybeSingle(); }
export async function saveProfile(profile){ const {data:{user}}=await supabase.auth.getUser(); if(!user) throw new Error('É necessário iniciar sessão.'); return supabase.from('profiles').upsert({id:user.id,...profile,updated_at:new Date().toISOString()}).select().single(); }
export async function searchProfiles(query){ return supabase.from('profiles').select('id,username,display_name,avatar_url,bio').ilike('username',`%${query}%`).limit(20); }
export async function sendFriendRequest(receiverId){ const {data:{user}}=await supabase.auth.getUser(); if(!user) throw new Error('É necessário iniciar sessão.'); if(user.id===receiverId) throw new Error('Não podes adicionar-te a ti próprio.'); return supabase.from('friend_requests').upsert({sender_id:user.id,receiver_id:receiverId,status:'pending'},{onConflict:'sender_id,receiver_id'}); }
export async function getFriendRequests(){ const {data:{user}}=await supabase.auth.getUser(); if(!user) return {data:[],error:null}; return supabase.from('friend_requests').select('*').or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`).order('created_at',{ascending:false}); }
export async function respondFriendRequest(id,status){ if(!['accepted','rejected'].includes(status)) throw new Error('Estado inválido.'); return supabase.from('friend_requests').update({status}).eq('id',id); }
export async function getFriends(){ const {data:{user}}=await supabase.auth.getUser(); if(!user) return {data:[],error:null}; const {data,error}=await supabase.from('friend_requests').select('*').or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`).eq('status','accepted'); if(error) return {data:null,error}; const ids=(data||[]).map(x=>x.sender_id===user.id?x.receiver_id:x.sender_id); if(!ids.length) return {data:[],error:null}; return supabase.from('profiles').select('id,username,display_name,avatar_url,bio').in('id',ids); }
export async function getPolls(){ return supabase.from('polls').select('*').eq('published',true).order('created_at',{ascending:false}); }
export async function vote(pollId,option){ const {data:{user}}=await supabase.auth.getUser(); if(!user) throw new Error('É necessário iniciar sessão.'); return supabase.from('votes').upsert({user_id:user.id,poll_id:pollId,option},{onConflict:'user_id,poll_id'}); }
export async function getPollResults(pollId){ return supabase.from('votes').select('option').eq('poll_id',pollId); }
export async function createPoll(question,options){ return supabase.from('polls').insert({question,options,published:true}).select().single(); }
export async function deletePoll(id){ return supabase.from('polls').delete().eq('id',id); }
window.MiraculousSocial={getProfile,saveProfile,searchProfiles,sendFriendRequest,getFriendRequests,respondFriendRequest,getFriends,getPolls,vote,getPollResults,createPoll,deletePoll};
