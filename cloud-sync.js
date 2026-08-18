(() => {
  "use strict";
  const SUPABASE_URL = "https://gfnpyzmhhwkpzvjwkckg.supabase.co";
  const SUPABASE_KEY = "sb_publishable_CGhjWdOcexqk0ac_WyYfOg_3jif0Bwz";
  const STORES = ["announcements","friendships","polls","communityMessages","achievements","notifications","forumPosts","forumComments","reports","news","wiki","calendar","quiz","achievementDefinitions"];
  let clientPromise, running = false;
  const client = () => clientPromise ||= import("https://esm.sh/@supabase/supabase-js@2").then(m => m.createClient(SUPABASE_URL, SUPABASE_KEY));
  const id = r => String(r?.id ?? "");
  const stamp = r => Number(r?.updatedAt || r?.createdAt || r?.unlockedAt || 0);
  const clean = r => { const x = {...r}; delete x.__cloudUpdatedAt; return x; };

  async function pull(store) {
    if (typeof window.getAll !== "function" || typeof window.put !== "function") return;
    const sb = await client();
    const {data, error} = await sb.from("cloud_records").select("record_id,payload,updated_at").eq("store", store);
    if (error) throw error;
    const local = await window.getAll(store);
    const map = new Map((local || []).map(r => [id(r), r]));
    for (const r of data || []) {
      const remote = {...(r.payload || {}), id:r.record_id, __cloudUpdatedAt:Date.parse(r.updated_at || "") || 0};
      const current = map.get(id(remote));
      if (!current || remote.__cloudUpdatedAt > stamp(current)) await window.put(store, clean(remote));
    }
  }

  async function push(store) {
    if (typeof window.getAll !== "function") return;
    const sb = await client();
    const local = await window.getAll(store);
    if (!local?.length) return;
    const {data:remote,error} = await sb.from("cloud_records").select("record_id,updated_at").eq("store",store);
    if (error) throw error;
    const map = new Map((remote || []).map(r => [String(r.record_id), Date.parse(r.updated_at || "") || 0]));
    for (const row of local) {
      if (!id(row)) continue;
      const lt = stamp(row), rt = map.get(id(row)) || 0;
      if (!map.has(id(row)) || lt > rt) {
        const {error:e} = await sb.from("cloud_records").upsert({store,record_id:id(row),payload:clean(row),updated_at:new Date(lt || Date.now()).toISOString()},{onConflict:"store,record_id"});
        if (e) throw e;
      }
    }
  }

  async function syncStore(store) { await pull(store); await push(store); }
  async function syncAll() {
    if (running) return; running = true;
    try { for (const s of STORES) { try { await syncStore(s); } catch(e) { console.warn("[CloudSync]",s,e?.message||e); } } }
    finally { running = false; }
  }

  async function start() {
    let tries=0;
    while ((typeof window.getAll !== "function" || typeof window.put !== "function") && tries++ < 100) await new Promise(r=>setTimeout(r,100));
    if (typeof window.getAll !== "function" || typeof window.put !== "function") return;
    await syncAll();
    try {
      const sb=await client();
      sb.channel("miraculous-v4-cloud").on("postgres_changes",{event:"*",schema:"public",table:"cloud_records"},p=>{
        const store=p?.new?.store||p?.old?.store;
        if(STORES.includes(store)) syncStore(store).catch(()=>{});
      }).subscribe();
    } catch(_) {}
    setInterval(()=>syncAll().catch(()=>{}),10000);
    window.miraculousCloud={syncAll,syncStore};
    console.log("[CloudSync] V4 global database connected");
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",start,{once:true}); else start();
})();
