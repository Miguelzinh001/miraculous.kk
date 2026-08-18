(() => {
  "use strict";

  const SUPABASE_URL = "https://gfnpyzmhhwkpzvjwkckg.supabase.co";
  const SUPABASE_KEY = "sb_publishable_CGhjWdOcexqk0ac_WyYfOg_3jif0Bwz";
  const SYNC_STORES = [
    "announcements",
    "friendships",
    "polls",
    "communityMessages",
    "achievements",
    "notifications",
    "forumPosts",
    "forumComments",
    "reports",
    "news",
    "wiki",
    "calendar",
    "quiz",
    "achievementDefinitions"
  ];

  let sbPromise = null;
  let installed = false;
  let syncing = false;

  const log = (...a) => { try { console.log("[CloudSync]", ...a); } catch (_) {} };

  async function sb() {
    if (sbPromise) return sbPromise;
    sbPromise = import("https://esm.sh/@supabase/supabase-js@2")
      .then(mod => mod.createClient(SUPABASE_URL, SUPABASE_KEY));
    return sbPromise;
  }

  function isSyncStore(store) {
    return SYNC_STORES.includes(store);
  }

  function idOf(row) {
    return String(row?.id ?? "");
  }

  function stamp(row) {
    return Number(row?.updatedAt || row?.createdAt || row?.unlockedAt || 0);
  }

  async function remoteRows(store) {
    const client = await sb();
    const { data, error } = await client
      .from("cloud_records")
      .select("record_id,payload,updated_at")
      .eq("store", store);
    if (error) throw error;
    return (data || []).map(r => ({
      ...(r.payload || {}),
      id: r.record_id,
      __cloudUpdatedAt: Date.parse(r.updated_at || "") || 0
    }));
  }

  async function pushRow(store, row) {
    if (!row || idOf(row) === "") return;
    const client = await sb();
    const payload = { ...row };
    delete payload.__cloudUpdatedAt;
    const ts = new Date(stamp(row) || Date.now()).toISOString();
    const { error } = await client.from("cloud_records").upsert({
      store,
      record_id: idOf(row),
      payload,
      updated_at: ts
    }, { onConflict: "store,record_id" });
    if (error) throw error;
  }

  async function removeRow(store, id) {
    if (!id) return;
    const client = await sb();
    const { error } = await client
      .from("cloud_records")
      .delete()
      .eq("store", store)
      .eq("record_id", String(id));
    if (error) throw error;
  }

  async function syncStore(store) {
    if (!isSyncStore(store) || typeof window.getAll !== "function" || typeof window.put !== "function") return;
    const local = await window.getAll.__cloudOriginal(store);
    const remote = await remoteRows(store);
    const byId = new Map();
    for (const row of local || []) byId.set(idOf(row), row);
    for (const row of remote || []) {
      const localRow = byId.get(idOf(row));
      if (!localRow || (row.__cloudUpdatedAt || 0) > stamp(localRow)) {
        const clean = { ...row };
        delete clean.__cloudUpdatedAt;
        await window.put.__cloudOriginal(store, clean);
        byId.set(idOf(clean), clean);
      }
    }
    for (const row of byId.values()) {
      const remoteRow = (remote || []).find(x => idOf(x) === idOf(row));
      if (!remoteRow || stamp(row) > (remoteRow.__cloudUpdatedAt || 0)) {
        await pushRow(store, row);
      }
    }
  }

  async function syncAll() {
    if (syncing) return;
    syncing = true;
    try {
      for (const store of SYNC_STORES) {
        try { await syncStore(store); }
        catch (e) { log("sync falhou", store, e?.message || e); }
      }
      if (typeof window.loadData === "function") {
        try { await window.loadData(); } catch (e) { log("refresh da app falhou", e?.message || e); }
      }
    } finally {
      syncing = false;
    }
  }

  function install() {
    if (installed || typeof window.getAll !== "function" || typeof window.put !== "function" || typeof window.remove !== "function") return false;
    installed = true;

    const originalGetAll = window.getAll;
    const originalPut = window.put;
    const originalRemove = window.remove;

    const wrappedGetAll = async function(store) {
      if (!isSyncStore(store)) return originalGetAll(store);
      const local = await originalGetAll(store);
      try {
        const remote = await remoteRows(store);
        const byId = new Map();
        for (const row of local || []) byId.set(idOf(row), row);
        for (const row of remote || []) {
          const localRow = byId.get(idOf(row));
          if (!localRow || (row.__cloudUpdatedAt || 0) > stamp(localRow)) {
            const clean = { ...row };
            delete clean.__cloudUpdatedAt;
            await originalPut(store, clean);
            byId.set(idOf(clean), clean);
          }
        }
        return [...byId.values()];
      } catch (e) {
        log("leitura cloud falhou", store, e?.message || e);
        return local;
      }
    };
    wrappedGetAll.__cloudOriginal = originalGetAll;

    const wrappedPut = async function(store, data) {
      const result = await originalPut(store, data);
      if (isSyncStore(store)) {
        try { await pushRow(store, data); }
        catch (e) { log("escrita cloud falhou", store, e?.message || e); }
      }
      return result;
    };
    wrappedPut.__cloudOriginal = originalPut;

    const wrappedRemove = async function(store, id) {
      const result = await originalRemove(store, id);
      if (isSyncStore(store)) {
        try { await removeRow(store, id); }
        catch (e) { log("remoção cloud falhou", store, e?.message || e); }
      }
      return result;
    };
    wrappedRemove.__cloudOriginal = originalRemove;

    window.getAll = wrappedGetAll;
    window.put = wrappedPut;
    window.remove = wrappedRemove;

    (async () => {
      await syncAll();
      try {
        const client = await sb();
        client.channel("miraculous-global-sync")
          .on("postgres_changes", { event: "*", schema: "public", table: "cloud_records" }, payload => {
            const store = payload?.new?.store || payload?.old?.store;
            if (isSyncStore(store)) syncStore(store).then(() => {
              if (typeof window.loadData === "function") return window.loadData();
            }).catch(e => log("realtime falhou", e?.message || e));
          })
          .subscribe(status => log("Realtime", status));
      } catch (e) {
        log("Realtime não iniciou", e?.message || e);
      }
      setInterval(() => syncAll().catch(() => {}), 15000);
    })();

    log("camada global instalada");
    return true;
  }

  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    if (install() || tries > 100) clearInterval(timer);
  }, 100);
})();
