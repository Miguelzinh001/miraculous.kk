(() => {
  'use strict';
  const URL = 'https://gfnpyzmhhwkpzvjwkckg.supabase.co';
  const KEY = 'sb_publishable_CGhjWdOcexqk0ac_WyYfOg_3jif0Bwz';
  let sb = null;
  let realtimeReady = false;

  async function client() {
    if (sb) return sb;
    if (window.miraculousSupabase) { sb = window.miraculousSupabase; return sb; }
    const mod = await import('https://esm.sh/@supabase/supabase-js@2');
    sb = mod.createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    return sb;
  }
  const $ = (id) => document.getElementById(id);
  const uid = async () => { const c = await client(); const { data } = await c.auth.getUser(); return data?.user?.id || null; };

  function profileToAccount(p) {
    return {
      id: p.id,
      username: p.username,
      password: '',
      photo: p.avatar_url || '',
      admin: p.role === 'admin', role: p.role || 'user',
      flag: p.flag || '🌍', phrase: p.phrase || 'Claws out!', bio: p.bio || '', profileColor: p.profile_color || '#e62b45',
      watched: Array.isArray(p.watched) ? p.watched : [], favorites: Array.isArray(p.favorites) ? p.favorites : [],
      ratings: p.ratings || {}, progress: p.progress || {}, blocked: Array.isArray(p.blocked) ? p.blocked : [],
      xp: Number(p.xp || 0), messageCount: Number(p.message_count || 0), pollVotes: Number(p.poll_votes_count || 0),
      lastSeen: p.last_seen ? Date.parse(p.last_seen) : 0, createdAt: p.created_at ? Date.parse(p.created_at) : Date.now(), supabaseUserId: p.id
    };
  }

  async function syncProfiles() {
    const c = await client();
    const { data, error } = await c.from('profiles').select('*').order('username');
    if (error) throw error;
    const list = data || [];
    window.__supabaseProfiles = list;
    if (typeof accounts !== 'undefined' && typeof put === 'function') {
      const local = await getAll('accounts');
      const byId = new Map((local || []).map(x => [String(x.supabaseUserId || x.id || x.username).toLowerCase(), x]));
      for (const p of list) {
        const a = profileToAccount(p);
        const old = byId.get(String(p.id).toLowerCase());
        if (old?.password) a.password = old.password;
        await put('accounts', a);
      }
      accounts = await getAll('accounts');
    }
    if (typeof renderAdminUsers === 'function') renderAdminUsers();
    if (typeof renderFriends === 'function') renderFriends();
  }

  async function syncAnnouncements() {
    const c = await client();
    const { data, error } = await c.from('global_announcements').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    const rows = (data || []).filter(x => !x.expires_at || new Date(x.expires_at).getTime() > Date.now()).map(x => ({
      id: String(x.id), label: x.label || 'NOVIDADE', title: x.title || '', text: x.body || '', color: x.color || '#e62b45',
      createdAt: Date.parse(x.created_at || '') || Date.now(), expiresAt: x.expires_at ? Date.parse(x.expires_at) : 0
    }));
    announcements = rows;
    if (typeof renderAnnouncements === 'function') renderAnnouncements();
  }

  async function syncFriends() {
    const me = await uid();
    if (!me) return;
    const c = await client();
    const { data, error } = await c.from('friend_requests').select('id,sender_id,receiver_id,status,created_at');
    if (error) throw error;
    const profiles = window.__supabaseProfiles || [];
    const name = new Map(profiles.map(p => [p.id, p.username]));
    const rows = (data || []).map(f => ({ id: String(f.id), from: name.get(f.sender_id) || '', to: name.get(f.receiver_id) || '', senderId: f.sender_id, receiverId: f.receiver_id, status: f.status, createdAt: Date.parse(f.created_at || '') || Date.now() }));
    friendships = rows;
    if (typeof put === 'function') for (const r of rows) await put('friendships', r);
    if (typeof renderFriends === 'function') renderFriends();
  }

  async function syncPolls() {
    const c = await client();
    const { data: pollRows, error } = await c.from('polls').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    const { data: options, error: optErr } = await c.from('poll_options').select('*').order('sort_order');
    if (optErr) throw optErr;
    const { data: votes, error: voteErr } = await c.from('votes').select('user_id,poll_id,option,created_at');
    if (voteErr) throw voteErr;
    const names = new Map((window.__supabaseProfiles || []).map(p => [p.id, p.username]));
    polls = (pollRows || []).map(p => {
      const opts = (options || []).filter(o => o.poll_id === p.id).sort((a,b) => a.sort_order-b.sort_order).map(o => o.option_text);
      const voteMap = {};
      (votes || []).filter(v => v.poll_id === p.id).forEach(v => { voteMap[names.get(v.user_id) || v.user_id] = v.option; });
      return { id: p.id, question: p.title, description: p.description || '', options: opts.length ? opts : Array.isArray(p.options) ? p.options : [], votes: voteMap, closed: !(p.published !== false), startAt: null, endAt: p.closes_at ? Date.parse(p.closes_at) : null, createdAt: Date.parse(p.created_at || '') || Date.now() };
    });
    if (typeof renderPolls === 'function') renderPolls();
    if (typeof renderAdminPolls === 'function') renderAdminPolls();
    if (typeof renderMegaPolls === 'function') renderMegaPolls();
  }

  async function publishAnnouncement() {
    const c = await client();
    const me = await uid();
    if (!me || !window.currentUser?.admin) return;
    const label = $('announcementLabel')?.value.trim() || 'NOVIDADE';
    const title = $('announcementTitle')?.value.trim() || '';
    const body = $('announcementText')?.value.trim() || '';
    const color = $('announcementColor')?.value || '#e62b45';
    const duration = Number($('announcementDuration')?.value || 0);
    if (!title || !body) return;
    const { error } = await c.from('global_announcements').insert({ id: crypto.randomUUID(), label, title, body, color, expires_at: duration > 0 ? new Date(Date.now() + duration).toISOString() : null });
    if (error) throw error;
    $('announcementTitle').value = ''; $('announcementText').value = '';
    if ($('announcementStatus')) $('announcementStatus').innerHTML = '<div class="notice success">✅ Anúncio publicado globalmente.</div>';
    await syncAnnouncements();
  }

  window.sendFriendRequest = async (username) => {
    const me = await uid(); if (!me) return;
    const p = (window.__supabaseProfiles || []).find(x => String(x.username).toLowerCase() === String(username).toLowerCase());
    if (!p || p.id === me) return;
    const c = await client();
    const { error } = await c.from('friend_requests').insert({ sender_id: me, receiver_id: p.id, status: 'pending' });
    if (error) { alert(error.message); return; }
    await syncFriends();
    if (typeof searchUsers === 'function') searchUsers();
  };

  window.acceptFriend = async (id) => {
    const me = await uid(); if (!me) return;
    const c = await client();
    const { error } = await c.from('friend_requests').update({ status: 'accepted' }).eq('id', id).eq('receiver_id', me);
    if (error) { alert(error.message); return; }
    await syncFriends();
  };

  window.deleteFriend = async (id) => {
    const c = await client();
    const { error } = await c.from('friend_requests').delete().eq('id', id);
    if (error) { alert(error.message); return; }
    await syncFriends();
  };

  window.votePoll = async (pollId) => {
    const me = await uid(); if (!me) return;
    const selected = document.querySelector(`input[name="poll_${CSS.escape(pollId)}"]:checked`);
    if (!selected) { alert('Escolhe uma opção.'); return; }
    const c = await client();
    const { error } = await c.from('votes').insert({ user_id: me, poll_id: pollId, option: selected.value });
    if (error) { alert(error.message); return; }
    await syncPolls();
  };

  async function realtime() {
    if (realtimeReady) return;
    realtimeReady = true;
    const c = await client();
    c.channel('miraculous-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => syncProfiles().catch(console.error))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests' }, () => syncFriends().catch(console.error))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'global_announcements' }, () => syncAnnouncements().catch(console.error))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'polls' }, () => syncPolls().catch(console.error))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_options' }, () => syncPolls().catch(console.error))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, () => syncPolls().catch(console.error))
      .subscribe((status) => console.log('[SupabaseLive] Realtime', status));
  }

  async function boot() {
    try {
      await syncProfiles();
      await syncAnnouncements();
      await syncFriends();
      await syncPolls();
      const add = $('addAnnouncement');
      if (add) add.onclick = () => publishAnnouncement().catch(e => { console.error(e); if ($('announcementStatus')) $('announcementStatus').innerHTML = `<div class="notice error">❌ ${e.message || 'Erro ao publicar.'}</div>`; });
      await realtime();
      setInterval(() => {
        syncProfiles().catch(() => {}); syncAnnouncements().catch(() => {}); syncFriends().catch(() => {}); syncPolls().catch(() => {});
      }, 15000);
      console.log('[SupabaseLive] Base global ligada ao site principal.');
    } catch (e) { console.error('[SupabaseLive] boot', e); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
