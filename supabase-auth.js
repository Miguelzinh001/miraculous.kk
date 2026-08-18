(() => {
  'use strict';
  const URL = 'https://gfnpyzmhhwkpzvjwkckg.supabase.co';
  const KEY = 'sb_publishable_CGhjWdOcexqk0ac_WyYfOg_3jif0Bwz';
  let client = null;
  let booted = false;

  async function getClient() {
    if (client) return client;
    const mod = await import('https://esm.sh/@supabase/supabase-js@2');
    client = mod.createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    window.miraculousSupabase = client;
    return client;
  }

  const $ = (id) => document.getElementById(id);
  const message = (text, good = false) => { const el = $('authMessage'); if (el) el.innerHTML = `<span class="${good ? 'success' : 'error'}">${String(text)}</span>`; };

  function localAccount(profile, user, admin) {
    return {
      username: profile?.username || user?.user_metadata?.username || 'utilizador',
      password: '',
      photo: profile?.avatar_url || '',
      admin: !!admin,
      role: profile?.role || (admin ? 'admin' : 'user'),
      flag: profile?.flag || '🌍',
      phrase: profile?.phrase || 'Claws out!',
      bio: profile?.bio || 'Membro do miraculous.kk 🐞',
      profileColor: profile?.profile_color || '#e62b45',
      watched: Array.isArray(profile?.watched) ? profile.watched : [],
      favorites: Array.isArray(profile?.favorites) ? profile.favorites : [],
      ratings: profile?.ratings && typeof profile.ratings === 'object' ? profile.ratings : {},
      progress: profile?.progress && typeof profile.progress === 'object' ? profile.progress : {},
      blocked: Array.isArray(profile?.blocked) ? profile.blocked : [],
      xp: Number(profile?.xp || 0),
      messageCount: Number(profile?.message_count || 0),
      pollVotes: Number(profile?.poll_votes_count || 0),
      lastSeen: Date.now(),
      createdAt: profile?.created_at ? Date.parse(profile.created_at) : Date.now(),
      supabaseUserId: user?.id || null
    };
  }

  async function saveLocalAccount(account) {
    try {
      if (typeof put === 'function') await put('accounts', account);
      if (typeof saveCurrentSession === 'function') saveCurrentSession();
    } catch (_) {}
  }

  async function applySession(payload) {
    const sb = await getClient();
    if (payload?.session?.access_token && payload?.session?.refresh_token) {
      const result = await sb.auth.setSession({ access_token: payload.session.access_token, refresh_token: payload.session.refresh_token });
      if (result.error) throw result.error;
    }
    const account = localAccount(payload.profile, payload.user, payload.admin);
    await saveLocalAccount(account);
    try {
      currentUser = account;
      if (typeof accounts !== 'undefined') {
        accounts = await getAll('accounts');
      }
      if (typeof updateProfileUI === 'function') updateProfileUI();
      if (typeof renderFriends === 'function') renderFriends();
      if (typeof renderSocial === 'function') renderSocial();
      if (typeof renderAchievements === 'function') renderAchievements();
      if (typeof render === 'function') render();
      if (typeof checkMaintenance === 'function') checkMaintenance();
    } catch (_) {}
  }

  async function invoke(action, extra = {}) {
    const sb = await getClient();
    const { data, error } = await sb.functions.invoke('auth-bridge', { body: { action, ...extra } });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  }

  async function bootstrapFromSession() {
    const sb = await getClient();
    const { data: { session } } = await sb.auth.getSession();
    if (!session?.access_token) return;
    try {
      const payload = await invoke('session');
      await applySession(payload);
    } catch (e) {
      console.warn('[SupabaseAuth] sessão inválida', e);
      await sb.auth.signOut();
    }
  }

  function installHandlers() {
    const login = $('loginBtn');
    const register = $('registerBtn');
    const logout = $('logoutButton');
    if (!login || !register || !logout) return false;
    login.onclick = async () => {
      const username = $('loginUser')?.value.trim();
      const password = $('loginPass')?.value || '';
      if (!username || !password) return message('❌ Preenche o utilizador e a palavra-passe.');
      login.disabled = true; login.textContent = 'A entrar…';
      try {
        const payload = await invoke('login', { username, password });
        await applySession(payload);
        $('authModal')?.classList.add('hide');
        $('loginUser').value = ''; $('loginPass').value = '';
        message('✅ Sessão iniciada.', true);
      } catch (e) {
        console.error('[SupabaseAuth] login', e);
        message(`❌ ${e?.message || 'Não foi possível iniciar sessão.'}`);
      } finally { login.disabled = false; login.textContent = 'Entrar'; }
    };
    register.onclick = async () => {
      const username = $('registerUser')?.value.trim();
      const password = $('registerPass')?.value || '';
      const password2 = $('registerPass2')?.value || '';
      if (!username || !password || !password2) return message('❌ Preenche todos os campos.');
      if (password !== password2) return message('❌ As palavras-passe não coincidem.');
      if (!/^[A-Za-z0-9._-]{3,32}$/.test(username)) return message('❌ Usa 3–32 caracteres: letras, números, . _ -');
      register.disabled = true; register.textContent = 'A criar…';
      try {
        const payload = await invoke('register', { username, password, flag: '🌍', phrase: 'Claws out!', bio: 'Novo membro do miraculous.kk 🐞', profileColor: '#e62b45' });
        await applySession(payload);
        $('authModal')?.classList.add('hide');
        $('registerUser').value = ''; $('registerPass').value = ''; $('registerPass2').value = '';
        message('✅ Conta criada e sincronizada com a Supabase.', true);
      } catch (e) {
        console.error('[SupabaseAuth] register', e);
        message(`❌ ${e?.message || 'Não foi possível criar a conta.'}`);
      } finally { register.disabled = false; register.textContent = 'Criar conta'; }
    };
    logout.onclick = async () => {
      try { const sb = await getClient(); await sb.auth.signOut(); } catch (_) {}
      try { currentUser = null; localStorage.removeItem('miraculous_current_user'); updateProfileUI(); renderFriends(); renderSocial(); renderAchievements(); render(); } catch (_) {}
      $('profileMenu')?.classList.add('hide');
    };
    return true;
  }

  async function boot() {
    if (booted) return;
    booted = true;
    try {
      const sb = await getClient();
      sb.auth.onAuthStateChange(async (_event, session) => {
        if (!session) return;
        try { await bootstrapFromSession(); } catch (e) { console.warn('[SupabaseAuth] auth state', e); }
      });
      installHandlers();
      await bootstrapFromSession();
      setInterval(() => bootstrapFromSession().catch(() => {}), 15000);
      console.log('[SupabaseAuth] V4 ligado ao Supabase Auth.');
    } catch (e) { console.error('[SupabaseAuth] falha ao iniciar', e); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
