(() => {
  'use strict';
  const URL = 'https://gfnpyzmhhwkpzvjwkckg.supabase.co';
  const KEY = 'sb_publishable_CGhjWdOcexqk0ac_WyYfOg_3jif0Bwz';
  let sb = null;
  const $ = (id) => document.getElementById(id);
  const esc = (s='') => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));

  async function client() {
    if (sb) return sb;
    if (window.miraculousSupabase) { sb = window.miraculousSupabase; return sb; }
    const mod = await import('https://esm.sh/@supabase/supabase-js@2');
    sb = mod.createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    return sb;
  }

  async function userId() { const c = await client(); const { data } = await c.auth.getUser(); return data?.user?.id || null; }

  function profilePayload() {
    const u = window.currentUser || (typeof currentUser !== 'undefined' ? currentUser : null);
    if (!u) return null;
    return {
      username: u.username,
      display_name: u.username,
      avatar_url: u.photo || null,
      bio: u.bio || '',
      flag: u.flag || '🌍',
      phrase: u.phrase || 'Claws out!',
      profile_color: u.profileColor || '#e62b45',
      xp: Number(u.xp || 0),
      watched: Array.isArray(u.watched) ? u.watched : [],
      favorites: Array.isArray(u.favorites) ? u.favorites : [],
      ratings: u.ratings || {},
      progress: u.progress || {},
      blocked: Array.isArray(u.blocked) ? u.blocked : [],
      message_count: Number(u.messageCount || 0),
      poll_votes_count: Number(u.pollVotes || 0),
      last_seen: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  async function pushCurrentProfile() {
    const id = await userId();
    const payload = profilePayload();
    if (!id || !payload) return;
    const c = await client();
    const { error } = await c.from('profiles').update(payload).eq('id', id);
    if (error) console.warn('[SupabaseActions] profile push', error.message);
  }

  async function saveProfileRemote() {
    const id = await userId(); if (!id) return;
    const c = await client();
    const username = $('epName')?.value.trim();
    const bio = $('epBio')?.value.trim() || '';
    const profileColor = $('epColor')?.value || '#e62b45';
    const file = $('epAvatar')?.files?.[0];
    let avatar_url = window.currentUser?.photo || null;
    if (file) {
      const dataUrl = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(r.error); r.readAsDataURL(file); });
      avatar_url = String(dataUrl);
    }
    const { error } = await c.from('profiles').update({ username, display_name: username, bio, profile_color: profileColor, avatar_url, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { if ($('epStatus')) $('epStatus').innerHTML = `<span class="error">❌ ${esc(error.message)}</span>`; return; }
    try { currentUser.username = username; currentUser.bio = bio; currentUser.profileColor = profileColor; currentUser.photo = avatar_url || ''; localStorage.setItem('miraculous_current_user', username); await put('accounts', currentUser); accounts = await getAll('accounts'); updateProfileUI(); } catch (_) {}
    $('editProfileModal')?.classList.add('hide');
    if (typeof window.miraculousSupabaseLive?.syncProfiles === 'function') await window.miraculousSupabaseLive.syncProfiles();
  }

  async function savePhraseRemote() {
    const id = await userId(); if (!id || !window.currentUser) return;
    let phrase = $('myPhraseSelect')?.value || 'Claws out!';
    if (phrase === 'Own phrase') phrase = $('customPhrase')?.value.trim() || '';
    if (!phrase) return;
    const c = await client();
    const { error } = await c.from('profiles').update({ phrase: phrase.slice(0, 80), updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { if ($('phraseStatus')) $('phraseStatus').innerHTML = `<div class="notice error">❌ ${esc(error.message)}</div>`; return; }
    currentUser.phrase = phrase.slice(0, 80);
    try { await put('accounts', currentUser); } catch (_) {}
    if ($('phraseStatus')) $('phraseStatus').innerHTML = '<div class="notice success">✅ Frase atualizada globalmente.</div>';
  }

  async function changePasswordRemote() {
    const pw = $('newPasswordMega')?.value || '';
    if (pw.length < 6) return alert('Usa pelo menos 6 caracteres.');
    const c = await client();
    const { error } = await c.auth.updateUser({ password: pw });
    if (error) return alert(error.message);
    $('newPasswordMega').value = '';
    alert('🔒 Palavra-passe atualizada na Supabase.');
  }

  async function createPollRemote() {
    const admin = window.currentUser || (typeof currentUser !== 'undefined' ? currentUser : null);
    if (!admin?.admin) return;
    const question = $('pollQuestion')?.value.trim();
    const unique = [...new Set(($('pollOptions')?.value || '').split('\n').map(x => x.trim()).filter(Boolean))];
    if (!question || unique.length < 2) { if ($('pollStatus')) $('pollStatus').innerHTML = '<div class="notice error">❌ Pergunta + 2 opções são obrigatórias.</div>'; return; }
    const startVal = $('pollStart')?.value || '';
    const endVal = $('pollEnd')?.value || '';
    const c = await client();
    const { data: poll, error } = await c.from('polls').insert({ title: question, description: '', published: true, closes_at: endVal ? new Date(endVal).toISOString() : null, options: unique }).select().single();
    if (error) { if ($('pollStatus')) $('pollStatus').innerHTML = `<div class="notice error">❌ ${esc(error.message)}</div>`; return; }
    const optionRows = unique.map((text, i) => ({ poll_id: poll.id, option_text: text, sort_order: i }));
    const { error: optError } = await c.from('poll_options').insert(optionRows);
    if (optError) { if ($('pollStatus')) $('pollStatus').innerHTML = `<div class="notice error">❌ ${esc(optError.message)}</div>`; return; }
    if ($('pollQuestion')) $('pollQuestion').value = '';
    if ($('pollOptions')) $('pollOptions').value = '';
    if ($('pollStart')) $('pollStart').value = '';
    if ($('pollEnd')) $('pollEnd').value = '';
    if ($('pollStatus')) $('pollStatus').innerHTML = '<div class="notice success">✅ Votação guardada na Supabase.</div>';
    if (typeof renderPolls === 'function') renderPolls();
    if (typeof window.miraculousSupabaseLive?.syncPolls === 'function') await window.miraculousSupabaseLive.syncPolls();
  }

  async function boot() {
    let tries = 0;
    while (tries++ < 100 && !document.getElementById('loginBtn')) await new Promise(r => setTimeout(r, 100));
    try {
      const profileSave = $('saveProfileMega'); if (profileSave) profileSave.onclick = () => saveProfileRemote().catch(e => console.error(e));
      const phrase = $('savePhrase'); if (phrase) phrase.onclick = () => savePhraseRemote().catch(e => console.error(e));
      const password = $('savePasswordMega'); if (password) password.onclick = () => changePasswordRemote().catch(e => console.error(e));
      const addPoll = $('addPoll'); if (addPoll) addPoll.onclick = () => createPollRemote().catch(e => console.error(e));
      setInterval(() => pushCurrentProfile().catch(() => {}), 10000);
      console.log('[SupabaseActions] perfis e ações administrativas globais ligadas.');
    } catch (e) { console.error('[SupabaseActions] boot', e); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
