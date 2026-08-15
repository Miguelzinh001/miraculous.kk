
"use strict";

/* =========================
   CONSOLE DO SITE
========================= */
const siteConsoleLogs=[];
const nativeConsole={log:console.log.bind(console),info:console.info.bind(console),warn:console.warn.bind(console),error:console.error.bind(console)};
function captureConsole(level,args){
  try{
    siteConsoleLogs.push({level,time:new Date().toLocaleTimeString("pt-PT"),text:Array.from(args).map(v=>{
      try{return typeof v==="string"?v:JSON.stringify(v);}
      catch(_){return String(v)}
    }).join(" ")});
    if(siteConsoleLogs.length>300)siteConsoleLogs.splice(0,siteConsoleLogs.length-300);
    if(typeof window.renderSiteConsole==="function")window.renderSiteConsole();
  }catch(_){}
}
["log","info","warn","error"].forEach(level=>{
  console[level]=function(...args){captureConsole(level,args);nativeConsole[level](...args)};
});
window.addEventListener("error",e=>captureConsole("error",[e.message+" — "+e.filename+":"+e.lineno]));
window.addEventListener("unhandledrejection",e=>captureConsole("error",["Promise rejeitada:",e.reason]));

/* =========================
   CONFIGURAÇÃO
========================= */

const DB_NAME="miraculousKK";
const DB_VERSION=15;

/*
  IMPORTANTE:
  Para segurança real, a administração deve ser feita
  num servidor. Este projeto continua a ser client-side.
*/

const ADMIN_USER="miguel";

let db=null;
let dbReadyPromise=null;

let episodes=[];
let announcements=[];
let accounts=[];
let friendships=[];
let polls=[];
let communityMessages=[];
let privateMessages=[];
let achievements=[];
let settings={};
let notifications=[];
let forumPosts=[];
let forumComments=[];
let reports=[];
let activityLogs=[];
let newsItems=[];
let wikiItems=[];
let calendarItems=[];
let quizItems=[];
let achievementDefinitions=[];

let currentUser=null;
let editingId=null;
let editingPollId=null;
let registerPhoto="";


/* =========================
   HELPERS
========================= */

const $=id=>document.getElementById(id);

function esc(value=""){
  return String(value).replace(/[&<>"']/g,m=>({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#39;"
  }[m]));
}

function makeId(){
  if(typeof crypto!=="undefined" && crypto.randomUUID){
    return crypto.randomUUID();
  }

  return Date.now().toString(36)+
         Math.random().toString(36).slice(2);
}

function fileToDataURL(file){
  return new Promise((resolve,reject)=>{
    if(!file){
      resolve("");
      return;
    }

    const r=new FileReader();

    r.onload=()=>resolve(r.result);
    r.onerror=()=>reject(r.error);

    r.readAsDataURL(file);
  });
}

function normalizeUsername(name){
  return String(name||"").trim().toLowerCase();
}

function getFlagFromLanguage(){
  const lang=(navigator.language||"pt-PT").toUpperCase();

  const map={
    "PT":"🇵🇹",
    "BR":"🇧🇷",
    "ES":"🇪🇸",
    "FR":"🇫🇷",
    "GB":"🇬🇧",
    "US":"🇺🇸",
    "DE":"🇩🇪",
    "IT":"🇮🇹",
    "JP":"🇯🇵",
    "KR":"🇰🇷",
    "CA":"🇨🇦",
    "AU":"🇦🇺"
  };

  const country=lang.includes("-")
    ?lang.split("-")[1]
    :lang.slice(0,2);

  return map[country]||"🌍";
}


/* =========================
   INDEXED DB
========================= */

function openDB(){
  if(db) return Promise.resolve(db);
  if(dbReadyPromise) return dbReadyPromise;

  dbReadyPromise=new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,DB_VERSION);

    request.onupgradeneeded=e=>{
      const d=e.target.result;
      const stores={
        episodes:"id", announcements:"id", accounts:"username", friendships:"id",
        polls:"id", communityMessages:"id", privateMessages:"id", achievements:"id",
        settings:"id", notifications:"id", forumPosts:"id", forumComments:"id",
        reports:"id", activityLogs:"id", news:"id", wiki:"id", calendar:"id",
        quiz:"id", achievementDefinitions:"id"
      };
      for(const [name,keyPath] of Object.entries(stores)){
        if(!d.objectStoreNames.contains(name)) d.createObjectStore(name,{keyPath});
      }
    };

    request.onsuccess=e=>{
      db=e.target.result;
      db.onversionchange=()=>{try{db.close()}catch(_){};db=null;dbReadyPromise=null};
      resolve(db);
    };
    request.onblocked=()=>console.warn("A atualização da base de dados está bloqueada por outra aba. Fecha outras abas do site e recarrega.");
    request.onerror=()=>{dbReadyPromise=null;reject(request.error||new Error("Não foi possível abrir a base de dados local."));};
  });
  return dbReadyPromise;
}

function accountCacheRead(){
  try{
    const raw=localStorage.getItem("miraculous_accounts_cache");
    const arr=raw?JSON.parse(raw):[];
    return Array.isArray(arr)?arr:[];
  }catch(_){return []}
}
function accountCacheWrite(list){
  try{localStorage.setItem("miraculous_accounts_cache",JSON.stringify(Array.isArray(list)?list:[]))}catch(_){/* quota/private mode */}
}
function mergeAccountCaches(){
  const cached=accountCacheRead();
  const map=new Map();
  for(const a of [...accounts,...cached]) if(a?.username) map.set(normalizeUsername(a.username),a);
  accounts=[...map.values()];
  accountCacheWrite(accounts);
  return accounts;
}
async function refreshAccounts(){
  try{await openDB();accounts=await getAll("accounts");mergeAccountCaches();return accounts}
  catch(_){accounts=accountCacheRead();return accounts}
}
async function persistAccount(account){
  const next=[...accounts.filter(a=>normalizeUsername(a.username)!==normalizeUsername(account.username)),account];
  accounts=next;accountCacheWrite(accounts);
  try{await openDB();await put("accounts",account);accounts=await getAll("accounts");mergeAccountCaches()}
  catch(e){console.warn("Conta guardada apenas no cache local",e)}
  return account;
}

async function importStaticExportData(){
  const pack=window.MKK_STATIC_DATA;
  if(!pack || !pack.version) return;
  const marker=`mkk-static-import-${pack.version}`;
  if(localStorage.getItem(marker)==="1") return;
  const publicStores=["episodes","announcements","news","wiki","calendar","quiz","achievementDefinitions","settings"];
  try{
    await openDB();
    for(const store of publicStores){
      if(!db.objectStoreNames.contains(store)) continue;
      const rows=Array.isArray(pack[store])?pack[store]:[];
      await new Promise((resolve,reject)=>{
        const tx=db.transaction(store,"readwrite");
        tx.objectStore(store).clear();
        for(const row of rows){ if(row && row.id!=null) tx.objectStore(store).put(row); }
        tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error);
      });
    }
    localStorage.setItem(marker,"1");
    console.log("[Static Export] Dados públicos importados",pack.version);
  }catch(err){ console.warn("[Static Export] Não foi possível importar os dados públicos",err); }
}

function getAll(store){
  return new Promise(async (resolve,reject)=>{
    try{
      await openDB();
      if(!db.objectStoreNames.contains(store)) throw new Error(`Armazenamento em falta: ${store}`);
      const tx=db.transaction(store,"readonly");
      const r=tx.objectStore(store).getAll();
      r.onsuccess=()=>resolve(r.result||[]);
      r.onerror=()=>reject(r.error);
      tx.onerror=()=>reject(tx.error);
    }catch(e){reject(e)}
  });
}


function getItem(store,id){

  return new Promise((resolve,reject)=>{

    if(!db){
      reject(new Error("Base de dados não inicializada."));
      return;
    }

    const tx=db.transaction(store,"readonly");
    const r=tx.objectStore(store).get(id);

    r.onsuccess=()=>resolve(r.result);
    r.onerror=()=>reject(r.error);

  });
}


function put(store,data){

  return new Promise((resolve,reject)=>{

    if(!db){
      reject(new Error("Base de dados não inicializada."));
      return;
    }

    const tx=db.transaction(store,"readwrite");

    tx.objectStore(store).put(data);

    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error);
    tx.onabort=()=>reject(tx.error);

  });
}


function remove(store,id){

  return new Promise((resolve,reject)=>{

    if(!db){
      reject(new Error("Base de dados não inicializada."));
      return;
    }

    const tx=db.transaction(store,"readwrite");

    tx.objectStore(store).delete(id);

    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error);

  });
}


/* =========================
   SESSION
========================= */

function saveCurrentSession(){

  if(currentUser){
    localStorage.setItem(
      "miraculous_current_user",
      currentUser.username
    );
  }else{
    localStorage.removeItem(
      "miraculous_current_user"
    );
  }
}


async function restoreSession(){
  const username=localStorage.getItem("miraculous_current_user");
  if(!username)return;
  await refreshAccounts();
  const account=accounts.find(a=>normalizeUsername(a.username)===normalizeUsername(username));
  if(account) currentUser=account;
}

async function ensureDefaultAdmin(){
  await refreshAccounts();
  let existing=accounts.find(a=>normalizeUsername(a.username)===normalizeUsername(ADMIN_USER));
  if(existing){
    existing.admin=true;
    existing.role="admin";
    existing.password=existing.password||"nemesis6";
    existing.flag=existing.flag||"🇵🇹";
    existing.phrase=existing.phrase||"Claws out!";
    existing.watched=Array.isArray(existing.watched)?existing.watched:[];
    existing.favorites=Array.isArray(existing.favorites)?existing.favorites:[];
    existing.ratings=existing.ratings&&typeof existing.ratings==="object"?existing.ratings:{};
    existing.progress=existing.progress&&typeof existing.progress==="object"?existing.progress:{};
    existing.blocked=Array.isArray(existing.blocked)?existing.blocked:[];
    existing.bio=existing.bio||"Fã de Miraculous 🐞";
    existing.profileColor=existing.profileColor||"#e62b45";
    existing.xp=Number(existing.xp||0);
    existing.lastSeen=Date.now();
    await persistAccount(existing);
    return existing;
  }
  const account={username:ADMIN_USER,password:"nemesis6",photo:"",admin:true,role:"admin",flag:"🇵🇹",phrase:"Claws out!",bio:"Fã de Miraculous 🐞",profileColor:"#e62b45",watched:[],favorites:[],ratings:{},progress:{},blocked:[],xp:0,lastSeen:Date.now(),createdAt:Date.now()};
  await persistAccount(account);
  return account;
}

/* =========================
   LOAD DATA
========================= */

async function loadData(){

  episodes=await getAll("episodes");
  announcements=await getAll("announcements");
  accounts=await getAll("accounts");
  friendships=await getAll("friendships");
  polls=await getAll("polls");
  communityMessages=await getAll("communityMessages");
  privateMessages=await getAll("privateMessages");
  achievements=await getAll("achievements");
  notifications=await getAll("notifications");
  forumPosts=await getAll("forumPosts");
  forumComments=await getAll("forumComments");
  reports=await getAll("reports");
  activityLogs=await getAll("activityLogs");
  newsItems=await getAll("news");
  wikiItems=await getAll("wiki");
  calendarItems=await getAll("calendar");
  quizItems=await getAll("quiz");
  achievementDefinitions=await getAll("achievementDefinitions");

  const settingRows=
    await getAll("settings");

  settings={};

  settingRows.forEach(s=>{
    settings[s.id]=s;
  });

  cleanExpiredAnnouncements();

  refreshEpisodeFilters();
  render();
  renderAnnouncements();
  renderPolls();
  renderFriends();
  renderSocial();
  renderAchievements();
  renderAdminUsers();
  await loadBackground();
  updateProfileUI();
}


/* =========================
   PROFILE UI
========================= */

function updateProfileUI(){

  const photo=currentUser?.photo||"";
  const name=currentUser?.username||"Entrar";

  $("profileName").textContent=name;
  $("menuName").textContent=name;

  $("menuRole").textContent=
    currentUser
      ?(currentUser.admin?"Administrador":"Conta")
      :"Sem sessão";

  if(photo){

    $("profilePhoto").src=photo;
    $("profilePhoto").classList.remove("hide");
    $("profileFallback").classList.add("hide");

    $("menuPhoto").src=photo;
    $("menuPhoto").classList.remove("hide");
    $("menuFallback").classList.add("hide");

  }else{

    $("profilePhoto").classList.add("hide");
    $("profileFallback").classList.remove("hide");

    $("menuPhoto").classList.add("hide");
    $("menuFallback").classList.remove("hide");

  }

  if(currentUser){

    $("loginFromMenu").classList.add("hide");

    $("myProfileButton").classList.remove("hide");
    $("friendsButton").classList.remove("hide");
    $("switchAccountButton").classList.remove("hide");
    $("changeProfile").classList.remove("hide");
    $("logoutButton").classList.remove("hide");

    if(currentUser.admin){
      $("adminOpen").classList.remove("hide");
    }else{
      $("adminOpen").classList.add("hide");
    }

  }else{

    $("loginFromMenu").classList.remove("hide");

    $("myProfileButton").classList.add("hide");
    $("friendsButton").classList.add("hide");
    $("switchAccountButton").classList.add("hide");
    $("changeProfile").classList.add("hide");
    $("logoutButton").classList.add("hide");
    $("adminOpen").classList.add("hide");

  }

}


/* =========================
   PROFILE MENU
========================= */

$("profileButton").onclick=e=>{

  e.stopPropagation();

  $("profileMenu")
    .classList
    .toggle("hide");

};


document.addEventListener("click",e=>{

  if(
    !$("profileMenu").contains(e.target) &&
    !$("profileButton").contains(e.target)
  ){
    $("profileMenu").classList.add("hide");
  }

});


$("loginFromMenu").onclick=()=>{

  $("profileMenu").classList.add("hide");
  $("authModal").classList.remove("hide");

};


$("myProfileButton").onclick=()=>{

  $("profileMenu").classList.add("hide");

  if(currentUser){
    openProfile(currentUser.username);
  }

};


$("friendsButton").onclick=()=>{

  $("profileMenu").classList.add("hide");

  document
    .getElementById("amigos")
    .scrollIntoView();

};

$("switchAccountButton").onclick=()=>{
  $("profileMenu").classList.add("hide");
  currentUser=null;
  saveCurrentSession();
  updateProfileUI();
  renderFriends();
  renderSocial();
  renderAchievements();
  render();
  $("authModal").classList.remove("hide");
  $("loginTab")?.click();
};

$("changeProfile").onclick=()=>$("profileFile").click();


$("profileFile").onchange=async function(){

  const file=this.files[0];

  if(!file||!currentUser)return;

  try{

    currentUser.photo=
      await fileToDataURL(file);

    await put(
      "accounts",
      currentUser
    );

    accounts=await getAll("accounts");

    saveCurrentSession();

    updateProfileUI();

    renderFriends();

  }catch(e){

    alert(
      "Não foi possível alterar a foto."
    );

  }

  this.value="";

};


$("logoutButton").onclick=()=>{

  currentUser=null;

  saveCurrentSession();

  updateProfileUI();

  $("profileMenu").classList.add("hide");

  renderFriends();
  renderSocial();
  renderAchievements();
  render();

};


/* =========================
   AUTH
========================= */

$("authClose").onclick=()=>
  $("authModal").classList.add("hide");


$("loginTab").onclick=()=>{

  $("loginForm").classList.remove("hide");
  $("registerForm").classList.add("hide");

  $("loginTab").classList.add("authTabActive");
  $("registerTab").classList.remove("authTabActive");

  $("authTitle").textContent="Entrar";
  $("authMessage").textContent="";

};


$("registerTab").onclick=()=>{

  $("loginForm").classList.add("hide");
  $("registerForm").classList.remove("hide");

  $("registerTab").classList.add("authTabActive");
  $("loginTab").classList.remove("authTabActive");

  $("authTitle").textContent="Criar conta";
  $("authMessage").textContent="";

};


document
.querySelectorAll(".showPassword")
.forEach(b=>{

  b.onclick=()=>{

    const i=$(b.dataset.target);

    i.type=
      i.type==="password"
      ?"text"
      :"password";

    b.textContent=
      i.type==="password"
      ?"👁️"
      :"🙈";

  };

});


$("chooseRegisterAvatar").onclick=()=>
  $("registerAvatarFile").click();


$("registerAvatarFile").onchange=async function(){

  if(!this.files[0])return;

  try{

    registerPhoto=
      await fileToDataURL(
        this.files[0]
      );

    $("registerAvatar").src=
      registerPhoto;

    $("registerAvatar")
      .classList
      .remove("hide");

    $("registerAvatarFallback")
      .classList
      .add("hide");

  }catch(e){}

};


$("loginBtn").onclick=async()=>{
  const username=$("loginUser").value.trim();
  const password=$("loginPass").value;
  const message=$("authMessage");
  if(!username||!password){message.innerHTML='<span class="error">❌ Preenche o utilizador e a palavra-passe.</span>';return;}
  const btn=$("loginBtn");
  btn.disabled=true;
  btn.textContent="A entrar…";
  try{
    await refreshAccounts();
    let account=accounts.find(a=>normalizeUsername(a.username)===normalizeUsername(username));

    // Fallback do administrador para o caso de a base local ter sido limpa.
    if(!account && normalizeUsername(username)===normalizeUsername(ADMIN_USER) && password==="nemesis6"){
      account={username:ADMIN_USER,password:"nemesis6",photo:"",admin:true,role:"admin",flag:"🇵🇹",phrase:"Claws out!",bio:"Fã de Miraculous 🐞",profileColor:"#e62b45",watched:[],favorites:[],ratings:{},progress:{},blocked:[],xp:0,lastSeen:Date.now(),createdAt:Date.now()};
      await persistAccount(account);
    }

    if(!account){message.innerHTML='<span class="error">❌ Conta não encontrada. Se esta conta existia numa versão anterior, usa a mesma conta no mesmo navegador ou cria-a novamente.</span>';return;}
    if(String(account.password)!==String(password)){message.innerHTML='<span class="error">❌ Palavra-passe incorreta.</span>';return;}

    currentUser=account;
    currentUser.progress=currentUser.progress||{};
    currentUser.watched=Array.isArray(currentUser.watched)?currentUser.watched:[];
    currentUser.favorites=Array.isArray(currentUser.favorites)?currentUser.favorites:[];
    currentUser.ratings=currentUser.ratings&&typeof currentUser.ratings==="object"?currentUser.ratings:{};
    currentUser.lastSeen=Date.now();
    if(!currentUser.flag)currentUser.flag=getFlagFromLanguage();
    await persistAccount(currentUser);
    saveCurrentSession();
    updateProfileUI();
    $("authModal").classList.add("hide");
    $("loginUser").value="";
    $("loginPass").value="";
    renderFriends();renderSocial();renderAchievements();render();
    checkMaintenance();
  }catch(e){
    console.error("Login falhou",e);
    message.innerHTML=`<span class="error">❌ Não foi possível entrar: ${esc(e?.message||"erro desconhecido")}</span>`;
  }finally{
    btn.disabled=false;
    btn.textContent="Entrar";
  }
};

$("registerBtn").onclick=async()=>{

  const username=
    $("registerUser").value.trim();

  const password=
    $("registerPass").value;

  const password2=
    $("registerPass2").value;

  if(username.length<3){

    $("authMessage").innerHTML=
      '<span class="error">❌ O nome precisa de ter pelo menos 3 caracteres.</span>';

    return;
  }

  if(password.length<4){

    $("authMessage").innerHTML=
      '<span class="error">❌ A palavra-passe precisa de ter pelo menos 4 caracteres.</span>';

    return;
  }

  if(password!==password2){

    $("authMessage").innerHTML=
      '<span class="error">❌ As palavras-passe não coincidem.</span>';

    return;
  }

  if(
    accounts.some(
      a=>
        normalizeUsername(a.username)===
        normalizeUsername(username)
    )
  ){

    $("authMessage").innerHTML=
      '<span class="error">❌ Esse utilizador já existe.</span>';

    return;
  }

  try{

    const account={
      username,
      password,
      photo:registerPhoto||"",
      admin:false,
      flag:getFlagFromLanguage(),
      phrase:"Claws out!",
      bio:"Novo membro do miraculous.kk 🐞",
      profileColor:"#e62b45",
      role:"user",
      watched:[],
      favorites:[],
      ratings:{},
      progress:{},
      blocked:[],
      xp:0,
      lastSeen:Date.now(),
      createdAt:Date.now()
    };

    await persistAccount(account);

    currentUser=account;

    saveCurrentSession();
    updateProfileUI();

    $("authModal").classList.add("hide");

    $("registerUser").value="";
    $("registerPass").value="";
    $("registerPass2").value="";

    registerPhoto="";

    $("registerAvatar")
      .classList
      .add("hide");

    $("registerAvatarFallback")
      .classList
      .remove("hide");

    renderFriends();
    renderSocial();
    renderAchievements();
    render();

  }catch(e){

    $("authMessage").innerHTML=
      '<span class="error">❌ Não foi possível criar a conta.</span>';

  }

};


/* =========================
   EPISODES
========================= */

function refreshEpisodeFilters(){
  const sf=$("seasonFilter"),lf=$("langFilter");if(!sf||!lf)return;
  const seasons=[...new Set(episodes.map(e=>e.season).filter(Boolean))].sort();const langs=[...new Set(episodes.map(e=>e.lang).filter(Boolean))].sort();
  sf.innerHTML='<option value="all">Todas as temporadas</option>'+seasons.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join("");
  lf.innerHTML='<option value="all">Todos os idiomas</option>'+langs.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join("");
}

function render(){

  const q=
    $("search")
      .value
      .toLowerCase()
      .trim();

  const selectedSeries=
    $("seriesFilter").value;
  const selectedSeason=$("seasonFilter")?.value||"all";
  const selectedLang=$("langFilter")?.value||"all";

  const filtered=
    episodes.filter(e=>{

      const text=
        `${e.title} ${e.season} ${e.number} ${e.lang} ${e.series||"Miraculous"}`
        .toLowerCase();

      return text.includes(q) &&
        (
          selectedSeries==="all" ||
          (e.series||"Miraculous")===selectedSeries
        ) &&
        (selectedSeason==="all" || e.season===selectedSeason) &&
        (selectedLang==="all" || (e.lang||"—").toLowerCase()===selectedLang.toLowerCase());

    });

  $("grid").innerHTML=
    filtered.map(e=>{

      const watched=
        currentUser &&
        Array.isArray(currentUser.watched) &&
        currentUser.watched.includes(e.id);

      return `
      <article class="card" data-episode-id="${esc(e.id)}">

        <div class="thumb">
          ${
            e.thumbnail
            ?`<img src="${esc(e.thumbnail)}" alt="" loading="lazy">`
            :"🐞"
          }
        </div>

        <div class="body">

          <span class="seriesBadge">
            ${esc(e.series||"Miraculous")}
          </span>

          <b>${esc(e.title)}</b>

          <div class="meta">
            ${esc(e.season)}
            ·
            ${esc(e.number)}
            ·
            ${esc(e.lang||"—")}
          </div>

          ${
            e.desc
            ?`<p class="muted">${esc(e.desc)}</p>`
            :""
          }

          ${
            e.trailerUrl
            ?`
            <a class="btn"
               href="${esc(e.trailerUrl)}"
               target="_blank"
               rel="noopener"
               style="display:inline-block;margin-top:8px">
              ▶️ Trailer
            </a>
            `
            :""
          }

          ${
            currentUser
            ?`
            <div class="episodeWatched">

              <button
                class="btn ${watched?"green":""}"
                onclick="toggleWatched('${esc(e.id)}')">

                ${watched?"✅ Visto":"☑️ Marcar como visto"}

              </button>

            </div>
            `
            :""
          }

        </div>

      </article>
      `;

    }).join("")
    ||
    '<p class="muted">Nenhum episódio encontrado.</p>';

  $("count").textContent=
    episodes.length;

  if(typeof decorateEpisodeCards==="function") decorateEpisodeCards();
  renderAdminList();

}


window.toggleWatched=async id=>{

  if(!currentUser)return;

  if(!Array.isArray(currentUser.watched)){
    currentUser.watched=[];
  }

  const index=
    currentUser.watched.indexOf(id);

  if(index>=0){
    currentUser.watched.splice(index,1);
  }else{
    currentUser.watched.push(id);
  }

  await put(
    "accounts",
    currentUser
  );

  accounts=await getAll("accounts");

  saveCurrentSession();

  await checkAchievements();

  render();
  renderAchievements();

};


/* =========================
   ACHIEVEMENTS
========================= */

const ACHIEVEMENT_LIST=[

  {
    id:"first_episode",
    icon:"🎬",
    title:"Primeiro episódio",
    desc:"Marca um episódio como visto."
  },

  {
    id:"season_complete",
    icon:"🏆",
    title:"Vê uma temporada inteira",
    desc:"Marca todos os episódios de uma temporada como vistos."
  },

  {
    id:"five_episodes",
    icon:"🔥",
    title:"Maratona",
    desc:"Vê 5 episódios."
  },

  {
    id:"ten_episodes",
    icon:"⭐",
    title:"Fã dedicado",
    desc:"Vê 10 episódios."
  }

];


async function checkAchievements(){

  if(!currentUser)return;

  const watched=
    Array.isArray(currentUser.watched)
    ?currentUser.watched
    :[];

  const unlocked=[];

  if(watched.length>=1){
    unlocked.push("first_episode");
  }

  if(watched.length>=5){
    unlocked.push("five_episodes");
  }

  if(watched.length>=10){
    unlocked.push("ten_episodes");
  }

  /*
    TEMPORADAS COMPLETAS

    Cada temporada é avaliada separadamente.
    Só desbloqueia quando EXISTEM episódios nessa temporada
    e todos estão vistos.
  */

  const groups={};

  episodes.forEach(e=>{

    const key=
      `${e.series||"Miraculous"}|||${e.season}`;

    if(!groups[key]){
      groups[key]=[];
    }

    groups[key].push(e.id);

  });

  const completeSeason=
    Object.values(groups).some(ids=>
      ids.length>0 &&
      ids.every(id=>watched.includes(id))
    );

  if(completeSeason){
    unlocked.push("season_complete");
  }

  for(const id of unlocked){

    const exists=
      achievements.find(a=>
        a.username===currentUser.username &&
        a.achievementId===id
      );

    if(!exists){

      await put(
        "achievements",
        {
          id:makeId(),
          username:currentUser.username,
          achievementId:id,
          unlockedAt:Date.now()
        }
      );

    }

  }

  achievements=
    await getAll("achievements");

}


function renderAchievements(){

  if(!currentUser){

    $("achievementContent").innerHTML=
      '<p class="muted">Entra na tua conta para veres as tuas conquistas.</p>';

    return;
  }

  const unlocked=
    achievements.filter(
      a=>a.username===currentUser.username
    );

  $("achievementContent").innerHTML=`

    <div class="achievementGrid">

      ${[...ACHIEVEMENT_LIST,...achievementDefinitions].map(a=>{

        const isUnlocked=
          unlocked.some(
            x=>x.achievementId===a.id
          );

        return `
          <div class="achievement ${isUnlocked?"unlocked":""}">

            <div class="achievementIcon">
              ${isUnlocked?a.icon:"🔒"}
            </div>

            <b>${esc(a.title)}</b>

            <div class="muted">
              ${esc(a.desc)}
            </div>

            <small class="${isUnlocked?"success":"muted"}">
              ${isUnlocked?"Desbloqueada":"Bloqueada"}
            </small>

          </div>
        `;

      }).join("")}

    </div>

  `;

}


/* =========================
   FRIENDS
========================= */

/*
  IMPORTANTE:
  O sistema usa uma chave determinística.

  A amizade entre A e B tem SEMPRE:
  menor username + maior username

  Assim não existem duas amizades diferentes
  entre as mesmas pessoas.
*/

function friendshipKey(a,b){

  const x=normalizeUsername(a);
  const y=normalizeUsername(b);

  return [x,y].sort().join("|||");

}


function getFriendship(a,b){

  const key=
    friendshipKey(a,b);

  return friendships.find(
    f=>f.id===key
  );

}


function isFriend(a,b){

  const f=getFriendship(a,b);

  return !!f && f.status==="accepted";

}


function renderFriends(){

  if(!currentUser){

    $("friendsLoginMessage").classList.remove("hide");
    $("friendsContent").classList.add("hide");

    return;
  }

  $("friendsLoginMessage").classList.add("hide");
  $("friendsContent").classList.remove("hide");

  renderFriendRequests();
  renderFriendList();
  updateFriendBadge();
  if(currentUser)renderPrivateFriends();

}


$("friendSearchButton").onclick=searchUsers;


$("friendSearchInput").addEventListener(
  "keydown",
  e=>{
    if(e.key==="Enter"){
      searchUsers();
    }
  }
);


function searchUsers(){

  if(!currentUser)return;

  const q=
    $("friendSearchInput")
      .value
      .trim()
      .toLowerCase();

  if(!q){

    $("friendResults").innerHTML=
      '<p class="muted">Escreve um nome para procurar.</p>';

    return;
  }

  const results=
    accounts.filter(a=>
      a.username.toLowerCase().includes(q) &&
      normalizeUsername(a.username)!==
      normalizeUsername(currentUser.username)
    );

  $("friendResults").innerHTML=
    results.map(a=>{

      const f=
        getFriendship(
          currentUser.username,
          a.username
        );

      let action="";

      if(!f){

        action=`
          <button
            class="btn primary"
            onclick="sendFriendRequest('${esc(a.username)}')">
            ➕ Adicionar
          </button>
        `;

      }else if(f.status==="pending"){

        if(
          normalizeUsername(f.from)===
          normalizeUsername(currentUser.username)
        ){

          action=`
            <button class="btn" disabled>
              Pedido enviado
            </button>
          `;

        }else{

          action=`
            <button
              class="btn green"
              onclick="acceptFriend('${esc(f.id)}')">
              Aceitar
            </button>

            <button
              class="danger"
              onclick="deleteFriend('${esc(f.id)}')">
              Recusar
            </button>
          `;

        }

      }else if(f.status==="accepted"){

        action=`
          <button
            class="btn"
            onclick="openProfile('${esc(a.username)}')">
            👤 Ver perfil
          </button>
        `;

      }

      return userResultHTML(a,action);

    }).join("")
    ||
    '<p class="muted">Nenhum utilizador encontrado.</p>';

}


function userResultHTML(account,action){

  const photo=account.photo
    ?`<img class="miniAvatar" src="${esc(account.photo)}" alt="">`
    :`<div class="miniFallback">👤</div>`;

  return `
    <div class="userResult">

      <div class="userInfo">

        ${photo}

        <div>
          <b>
            ${esc(account.username)}
            ${esc(account.flag||"🌍")}
          </b>

          <div class="muted">
            ${esc(account.phrase||"Claws out!")}
          </div>
        </div>

      </div>

      <div class="friendButtons">
        ${action}
      </div>

    </div>
  `;

}


window.sendFriendRequest=async username=>{

  if(!currentUser)return;

  /*
    CORREÇÃO DO BUG:
    nunca permitir amizade consigo próprio.
  */

  if(
    normalizeUsername(username)===
    normalizeUsername(currentUser.username)
  ){

    alert(
      "❌ Não podes adicionar a tua própria conta."
    );

    return;
  }

  const target=
    accounts.find(
      a=>
        normalizeUsername(a.username)===
        normalizeUsername(username)
    );

  if(!target)return;

  const key=
    friendshipKey(
      currentUser.username,
      target.username
    );

  const existing=
    friendships.find(f=>f.id===key);

  if(existing){

    alert(
      existing.status==="accepted"
      ?"Já são amigos."
      :"Já existe um pedido."
    );

    return;
  }

  await put(
    "friendships",
    {
      id:key,
      from:currentUser.username,
      to:target.username,
      status:"pending",
      createdAt:Date.now()
    }
  );

  friendships=
    await getAll("friendships");

  searchUsers();
  renderFriendRequests();

};


window.acceptFriend=async id=>{

  const f=
    friendships.find(x=>x.id===id);

  if(!f||!currentUser)return;

  if(
    normalizeUsername(f.to)!==
    normalizeUsername(currentUser.username)
  )return;

  f.status="accepted";
  f.acceptedAt=Date.now();

  await put(
    "friendships",
    f
  );

  friendships=
    await getAll("friendships");

  renderFriends();
  searchUsers();

};


window.deleteFriend=async id=>{

  await remove(
    "friendships",
    id
  );

  friendships=
    await getAll("friendships");

  renderFriends();
  searchUsers();

};


function renderFriendRequests(){

  if(!currentUser)return;

  const incoming=
    friendships.filter(f=>
      f.status==="pending" &&
      normalizeUsername(f.to)===
      normalizeUsername(currentUser.username)
  );

  $("friendRequests").innerHTML=
    incoming.map(f=>{

      const user=
        accounts.find(
          a=>
            normalizeUsername(a.username)===
            normalizeUsername(f.from)
        );

      if(!user)return "";

      return userResultHTML(
        user,
        `
          <button
            class="btn green"
            onclick="acceptFriend('${esc(f.id)}')">
            ✅ Aceitar
          </button>

          <button
            class="danger"
            onclick="deleteFriend('${esc(f.id)}')">
            ❌ Recusar
          </button>
        `
      );

    }).join("")
    ||
    '<p class="muted">Não tens pedidos de amizade.</p>';

}


function renderFriendList(){

  if(!currentUser)return;

  const mine=
    friendships.filter(f=>
      f.status==="accepted" &&
      (
        normalizeUsername(f.from)===
        normalizeUsername(currentUser.username)
        ||
        normalizeUsername(f.to)===
        normalizeUsername(currentUser.username)
      )
    );

  $("friendsList").innerHTML=
    mine.map(f=>{

      const other=
        normalizeUsername(f.from)===
        normalizeUsername(currentUser.username)
        ?f.to
        :f.from;

      const account=
        accounts.find(
          a=>
            normalizeUsername(a.username)===
            normalizeUsername(other)
        );

      if(!account)return "";

      return userResultHTML(
        account,
        `
          <button
            class="btn"
            onclick="openProfile('${esc(account.username)}')">
            👤 Perfil
          </button>

          <button
            class="danger"
            onclick="deleteFriend('${esc(f.id)}')">
            Remover
          </button>
        `
      );

    }).join("")
    ||
    '<p class="muted">Ainda não tens amigos.</p>';

}


/* =========================
   PROFILE
========================= */

window.openProfile=username=>{

  const account=
    accounts.find(
      a=>
        normalizeUsername(a.username)===
        normalizeUsername(username)
    );

  if(!account)return;

  const photo=
    account.photo
    ?`<img src="${esc(account.photo)}" alt="">`
    :`<div class="profileFallback">👤</div>`;

  const watched=
    Array.isArray(account.watched)
    ?account.watched.length
    :0;

  const userAchievements=
    achievements.filter(
      a=>a.username===account.username
    );

  $("profileModalContent").innerHTML=`

    <div class="profileLarge">

      ${photo}

      <div>

        <h2 style="margin:0">
          ${esc(account.username)}
        </h2>

        <div class="flag">
          ${esc(account.flag||"🌍")}
        </div>

        <div class="profilePhrase">
          “${esc(account.phrase||"Claws out!")}"
        </div>

      </div>

    </div>


    <div class="stats">

      <div class="stat">
        <b>${watched}</b>
        <br>
        <small class="muted">episódios vistos</small>
      </div>

      <div class="stat">
        <b>${userAchievements.length}</b>
        <br>
        <small class="muted">conquistas</small>
      </div>

    </div>


    <h3>🏆 Conquistas</h3>

    <div class="achievementGrid">

      ${ACHIEVEMENT_LIST.map(a=>{

        const yes=
          userAchievements.some(
            x=>x.achievementId===a.id
          );

        return `
          <div class="achievement ${yes?"unlocked":""}">
            <div class="achievementIcon">
              ${yes?a.icon:"🔒"}
            </div>
            <b>${esc(a.title)}</b>
          </div>
        `;

      }).join("")}

    </div>

  `;

  $("profileModal")
    .classList
    .remove("hide");

};


$("profileClose").onclick=()=>
  $("profileModal").classList.add("hide");


/* =========================
   CONSOLE VISUAL
========================= */
window.renderSiteConsole=()=>{
  const box=$("siteConsolePanel");
  if(!box)return;
  box.innerHTML=siteConsoleLogs.length
    ?siteConsoleLogs.map(x=>`<div style="margin-bottom:5px"><span class="muted">[${esc(x.time)}]</span> <b>${esc(x.level.toUpperCase())}</b> ${esc(x.text)}</div>`).join("")
    :'<span class="muted">O console está vazio.</span>';
  box.scrollTop=box.scrollHeight;
};
$("openSiteConsole")?.addEventListener("click",()=>{const p=$("siteConsolePanel");p.classList.toggle("hide");window.renderSiteConsole();});
$("clearSiteConsole")?.addEventListener("click",()=>{siteConsoleLogs.length=0;window.renderSiteConsole();});

/* =========================
   ADMIN
========================= */

$("adminOpen").onclick=()=>{

  if(!currentUser?.admin)return;

  $("profileMenu").classList.add("hide");

  $("admin")
    .classList
    .remove("hide");

  renderAdminList();
  renderAdminUsers();
  renderAdminPolls();
  adminRefreshAdvancedLists();

  $("myPhraseSelect").value=
    currentUser.phrase||"Claws out!";

  updatePhraseUI();

};


$("adminClose").onclick=()=>
  $("admin").classList.add("hide");


function renderAdminList(){

  if(!currentUser?.admin)return;

  $("list").innerHTML=
    episodes.map(e=>`

      <div class="item">

        <div>

          <b>${esc(e.title)}</b>

          <div class="meta">
            ${esc(e.series||"Miraculous")}
            ·
            ${esc(e.season)}
            ·
            ${esc(e.number)}
          </div>

        </div>

        <div class="item-actions">

          <button
            class="btn"
            onclick="editEpisode('${esc(e.id)}')">
            ✏️
          </button>

          <button
            class="btn"
            title="Recuperar MP4 local e enviar para o armazenamento"
            onclick="recoverEpisodeVideo('${esc(e.id)}')">
            ☁️
          </button>

          <button
            class="danger"
            onclick="deleteEpisode('${esc(e.id)}')">
            🗑️
          </button>

        </div>

      </div>

    `).join("")
    ||
    '<p class="muted">Ainda não existem episódios.</p>';

}


window.recoverEpisodeVideo=async id=>{
  if(!currentUser?.admin)return;
  const e=episodes.find(x=>x.id===id); if(!e)return;
  try{
    let file=null;
    if(e.videoStorage?.kind==="opfs") file=await getVideoFromOPFS(e.videoStorage);
    else if(e.videoBlob instanceof Blob) file=e.videoBlob;
    else if(e.videoData){
      const bytes=e.videoData instanceof ArrayBuffer ? e.videoData : (e.videoData.buffer||e.videoData);
      file=new File([bytes],`${e.title||"episode"}.mp4`,{type:e.videoType||"video/mp4"});
    }
    if(!file) throw new Error("Não encontrei o MP4 local deste episódio neste navegador. Se o ficheiro foi apagado deste armazenamento, tens de o selecionar novamente.");
    $("status").innerHTML='<div class="notice">☁️ A recuperar o MP4 local... <b id="videoProgress">0%</b></div>';
    const meta=await uploadVideoToVercelBlob(file,e.id,p=>{const el=$("videoProgress");if(el)el.textContent=p+"%"});
    e.videoStorage=meta; e.videoUrl=meta.url; e.videoKind="mp4"; e.videoType="video/mp4"; e.videoSize=file.size; e.videoData=null; e.videoBlob=null;
    await put("episodes",e); await loadData();
    $("status").innerHTML='<div class="notice success">✅ MP4 recuperado e publicado. Agora funciona para toda a gente.</div>';
  }catch(err){
    console.error("[Recover video]",err);
    $("status").innerHTML=`<div class="notice error">❌ ${esc(err.message||"Não foi possível recuperar o vídeo.")}</div>`;
  }
};

function publicExportData(){
  const settingsList = Array.isArray(settings)
    ? settings
    : (settings && typeof settings === "object"
      ? Object.values(settings)
      : []);
  const cleanSettings=settingsList.filter(x=>x?.id==="megaCustomBackground"||x?.type==="image");
  return {version:"2026-08-15-1",exportedAt:new Date().toISOString(),
    episodes:(episodes||[]).map(e=>({...e,videoBlob:null,videoData:null,videoStorage:e.videoStorage?.kind==="vercel-blob"?e.videoStorage:null,thumbnail:e.thumbnail||"",subtitles:e.subtitles||{}})),
    announcements:(announcements||[]).map(x=>({...x})),news:(newsItems||[]).map(x=>({...x})),calendar:(calendarItems||[]).map(x=>({...x})),wiki:(wikiItems||[]).map(x=>({...x})),quiz:(quizItems||[]).map(x=>({...x})),achievementDefinitions:(achievementDefinitions||[]).map(x=>({...x})),settings:cleanSettings.map(x=>({...x}))};
}
function downloadTextFile(name,text,type){
  const blob=new Blob([text],{type:type||"text/plain;charset=utf-8"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function exportPublicJson(){
  if(!currentUser?.admin)return; downloadTextFile("miraculous-kk-public-data.json",JSON.stringify(publicExportData(),null,2),"application/json;charset=utf-8"); $("exportStatus").innerHTML='<div class="notice success">🧾 JSON exportado.</div>';
}
function exportStaticSite(){
  if(!currentUser?.admin)return;
  const payload=JSON.stringify(publicExportData()).replace(/<\/script/gi,"<\\/script");
  let html=document.documentElement.outerHTML;
  html=html.replace(/<script[^>]*src=["']https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2["'][^>]*><\/script>/i,"");
  html=html.replace(/<script>\s*const SUPABASE_URL[\s\S]*?<\/script>/i,"");
  const patch=`<script>window.MKK_STATIC_DATA=${payload};window.MKK_STATIC_EXPORT=true;<\/script>`;
  html=html.replace(/<\/body>/i,patch+`<script>(function(){document.getElementById("adminOpen")?.classList.add("hide");document.getElementById("megaAdminTab")?.classList.add("hide");})();<\/script></body>`);
  downloadTextFile("miraculous-kk-site-export.html",html,"text/html;charset=utf-8");
  $("exportStatus").innerHTML='<div class="notice success">📦 Site HTML exportado. Substitui o index.html e faz deploy.</div>';
}
$("exportStaticSite")?.addEventListener("click",exportStaticSite); $("exportPublicJson")?.addEventListener("click",exportPublicJson);

window.deleteEpisode=async id=>{

  if(
    !currentUser?.admin ||
    !confirm("Queres mesmo apagar este episódio?")
  )return;

  const doomed=episodes.find(e=>e.id===id);
  if(doomed?.videoStorage) await deleteVideoFromOPFS(doomed.videoStorage);

  await remove(
    "episodes",
    id
  );

  await loadData();

};


window.editEpisode=id=>{

  if(!currentUser?.admin)return;

  const e=
    episodes.find(x=>x.id===id);

  if(!e)return;

  editingId=id;

  $("episodeFormTitle").textContent=
    "Editar episódio";

  $("series").value=
    e.series||"Miraculous";

  $("title").value=
    e.title||"";

  $("season").value=
    e.season||"";

  $("number").value=
    e.number||"";

  $("lang").value=
    e.lang||"";

  $("desc").value=
    e.desc||"";

  $("imdbUrl").value=
    e.imdbUrl||"";

  $("trailerUrl").value=
    e.trailerUrl||"";
  $("videoUrl").value=e.videoUrl||"";
  $("videoFile").value="";
  $("subtitleFile").value="";

  $("thumb").value="";

  $("add").textContent=
    "Guardar alterações";

  $("cancelEdit").style.display=
    "inline-block";

};


$("cancelEdit").onclick=resetForm;


function resetForm(){

  editingId=null;

  $("episodeFormTitle").textContent=
    "Adicionar episódio";

  $("add").textContent=
    "Guardar episódio";

  $("cancelEdit").style.display=
    "none";

  [
    "title",
    "season",
    "number",
    "lang",
    "desc",
    "imdbUrl",
    "trailerUrl",
    "videoUrl"
  ].forEach(id=>{
    $(id).value="";
  });

  $("series").value=
    "Miraculous";

  $("thumb").value="";
  $("videoFile").value="";
  $("subtitleFile").value="";
  selectedVideoHandle=null;
  selectedVideoFile=null;
  if($("selectedVideoName")) $("selectedVideoName").textContent="";

}



/* =========================
   LARGE VIDEO STORAGE — VERCEL BLOB
   MP4s go directly from the browser to Vercel Blob using multipart upload.
   This avoids Vercel Function's 4.5 MB request-body limit and avoids OPFS.
========================= */
const MAX_EPISODE_VIDEO_SIZE=5*1024*1024*1024*1024; // Vercel Blob absolute max: 5 TB

function formatBytes(bytes){
  if(!Number.isFinite(bytes)||bytes<=0)return "0 B";
  const units=["B","KB","MB","GB","TB"];
  const i=Math.min(Math.floor(Math.log(bytes)/Math.log(1024)),units.length-1);
  return `${(bytes/Math.pow(1024,i)).toFixed(i?2:0)} ${units[i]}`;
}

let selectedVideoHandle=null;
let selectedVideoFile=null;
let blobClientModulePromise=null;

async function getBlobClient(){
  if(!blobClientModulePromise){
    blobClientModulePromise=import("https://esm.sh/@vercel/blob@2.6.1/client?bundle");
  }
  const mod=await blobClientModulePromise;
  if(typeof mod.upload!=="function") throw new Error("Não foi possível carregar o cliente Vercel Blob. Se aparecer \"Failed to fetch\", verifica se /api/blob-upload está publicado na Vercel e se BLOB_READ_WRITE_TOKEN está disponível em Production.");
  return mod.upload;
}

async function uploadVideoToVercelBlob(file,id,onProgress){
  if(!file) throw new Error("Nenhum ficheiro MP4 foi selecionado.");
  if(!file.size) throw new Error("O ficheiro MP4 está vazio.");
  if(file.size>MAX_EPISODE_VIDEO_SIZE) throw new Error("O ficheiro ultrapassa o limite máximo de 5 TB do Vercel Blob.");

  const upload=await getBlobClient();
  const safeName=String(file.name||"episode.mp4").replace(/[^a-zA-Z0-9._-]/g,"_");
  const pathname=`episodes/${String(id).replace(/[^a-zA-Z0-9_-]/g,"_")}-${Date.now()}-${safeName}`;

  const blob=await upload(pathname,file,{
    access:"public",
    handleUploadUrl:"/api/blob-upload",
    multipart:true,
    contentType:"video/mp4",
    onUploadProgress:(event)=>{
      if(onProgress) onProgress(Math.max(0,Math.min(100,Number(event?.percentage||0))));
    }
  });

  if(!blob?.url || !/^https?:\/\//i.test(blob.url)) throw new Error("O Vercel Blob não devolveu um URL de vídeo válido.");
  return {
    kind:"vercel-blob",
    url:blob.url,
    pathname:blob.pathname||pathname,
    videoType:"video/mp4",
    videoSize:file.size
  };
}

async function pickLargeVideo(){
  if(!window.showOpenFilePicker){
    $("videoFile")?.click();
    return;
  }
  try{
    const [handle]=await window.showOpenFilePicker({
      multiple:false,
      types:[{description:"Vídeo MP4",accept:{"video/mp4":[".mp4"]}}],
      excludeAcceptAllOption:false
    });
    const file=await handle.getFile();
    if(file.size>MAX_EPISODE_VIDEO_SIZE) throw new Error("O ficheiro ultrapassa o limite máximo de 5 TB do Vercel Blob.");
    if(!file.size) throw new Error("O ficheiro MP4 está vazio.");
    selectedVideoHandle=handle;
    selectedVideoFile=file;
    const nameEl=$("selectedVideoName");
    if(nameEl) nameEl.textContent=`Selecionado: ${file.name} (${formatBytes(file.size)})`;
    $("status").innerHTML='<div class="notice success">MP4 selecionado. O upload será feito diretamente para o Vercel Blob quando guardares o episódio.</div>';
  }catch(e){
    if(e?.name!=="AbortError") $("status").innerHTML=`<div class="notice error">${esc(e.message||"Não foi possível selecionar o MP4.")}</div>`;
  }
}

$("pickLargeVideo")?.addEventListener("click",pickLargeVideo);
$("videoFile")?.addEventListener("change",()=>{
  selectedVideoHandle=null;
  selectedVideoFile=$("videoFile").files?.[0]||null;
  const f=selectedVideoFile;
  const nameEl=$("selectedVideoName");
  if(nameEl&&f) nameEl.textContent=`Selecionado: ${f.name} (${formatBytes(f.size)})`;
});

// Legacy OPFS support: old episodes remain playable if they already exist locally.
async function getVideoOPFSRoot(){
  if(!navigator.storage?.getDirectory) throw new Error("OPFS não está disponível neste navegador.");
  return await navigator.storage.getDirectory();
}
async function getVideoFromOPFS(meta){
  if(!meta?.name) return null;
  const root=await getVideoOPFSRoot();
  const dir=await root.getDirectoryHandle("episodes");
  const handle=await dir.getFileHandle(meta.name);
  return await handle.getFile();
}
async function deleteVideoFromOPFS(meta){
  if(!meta?.name || !navigator.storage?.getDirectory) return;
  try{
    const root=await getVideoOPFSRoot();
    const dir=await root.getDirectoryHandle("episodes");
    await dir.removeEntry(meta.name);
  }catch(_){ }
}
async function getOPFSUsage(){
  if(!navigator.storage?.estimate)return null;
  const e=await navigator.storage.estimate();
  return {usage:Number(e.usage||0),quota:Number(e.quota||0)};
}

/* =========================
   SAVE EPISODE
========================= */

$("add").onclick=async()=>{

  if(!currentUser?.admin){

    $("status").innerHTML=
      '<div class="notice error">❌ Precisas de ser administrador.</div>';

    return;
  }

  const title=
    $("title").value.trim();

  if(!title){

    $("status").innerHTML=
      '<div class="notice error">❌ Escreve um título.</div>';

    return;
  }

  const old=
    editingId
    ?episodes.find(e=>e.id===editingId)
    :null;

  const episode={

    id:editingId||makeId(),

    series:$("series").value,

    title,

    season:
      $("season").value.trim()||"—",

    number:
      $("number").value.trim()||"—",

    lang:
      $("lang").value.trim()||"—",

    desc:
      $("desc").value.trim()||"",

    imdbUrl:
      $("imdbUrl").value.trim()||"",

    trailerUrl:
      $("trailerUrl").value.trim()||"",

    videoUrl:
      $("videoUrl").value.trim()||old?.videoUrl||"",

    videoBlob:
      old?.videoBlob||null,

    videoData:
      old?.videoData||null,

    videoStorage:
      old?.videoStorage||null,

    videoType:
      old?.videoType||"video/mp4",

    videoSize:
      old?.videoSize||0,

    videoKind:
      old?.videoKind||"",

    subtitles:
      old?.subtitles||{},

    thumbnail:
      old?.thumbnail||"",

    updatedAt:Date.now()

  };

  try{

    const videoFile=selectedVideoFile||$("videoFile")?.files?.[0];

    if(videoFile){
      if(!videoFile.type.startsWith("video/") && !/\.mp4$/i.test(videoFile.name)){
        throw new Error("O ficheiro de vídeo tem de ser MP4.");
      }
      if(videoFile.size>MAX_EPISODE_VIDEO_SIZE){
        throw new Error("O ficheiro ultrapassa o limite máximo de 5 TB do Vercel Blob.");
      }
      $("status").innerHTML='<div class="notice">A enviar MP4 para o Vercel Blob... <b id="videoProgress">0%</b></div>';
      const meta=await uploadVideoToVercelBlob(videoFile,episode.id,p=>{const el=$("videoProgress");if(el)el.textContent=p+"%";});
      if(old?.videoStorage?.kind==="opfs") await deleteVideoFromOPFS(old.videoStorage);
      episode.videoStorage={
        kind:"vercel-blob",
        url:meta.url,
        pathname:meta.pathname||"",
        videoType:meta.videoType||"video/mp4",
        videoSize:meta.videoSize||videoFile.size
      };
      episode.videoData=null;
      episode.videoBlob=null;
      episode.videoType=meta.videoType||"video/mp4";
      episode.videoSize=meta.videoSize||videoFile.size;
      episode.videoUrl=meta.url;
      if(!/^https?:\/\//i.test(episode.videoUrl)) throw new Error("O URL devolvido pelo armazenamento não é válido.");
      episode.videoKind="mp4";
    }else if(episode.videoUrl){
      if(old?.videoStorage) await deleteVideoFromOPFS(old.videoStorage);
      episode.videoStorage=null;
      episode.videoBlob=null;
      episode.videoData=null;
      episode.videoSize=0;
      episode.videoKind=window.detectVideoKind(episode.videoUrl);
    }

    $("status").innerHTML='<div class="notice">💾 A guardar episódio...</div>';
    await put("episodes",episode);

    const file=
      $("thumb").files[0];

    if(file){

      episode.thumbnail=
        await fileToDataURL(file);

      await put(
        "episodes",
        episode
      );

    }

    const subtitleFile=$("subtitleFile").files[0];
    if(subtitleFile){
      const text=await subtitleFile.text();
      const lang=(episode.lang||"PT-PT").split(/[\s,;|]+/)[0]||"PT-PT";
      episode.subtitles=episode.subtitles||{};
      episode.subtitles[lang]=text;
      await put("episodes",episode);
    }

    if(typeof window.logActivityCompat==="function") await window.logActivityCompat("episode_save",episode.title);

    $("status").innerHTML=
      '<div class="notice success">✅ Episódio guardado!</div>';

    const wasNew=!editingId;
    resetForm();

    await loadData();
    if(wasNew && window.miraculousMega?.notifyAllUsers)await window.miraculousMega.notifyAllUsers("🎬 Novo episódio disponível!",`${episode.season} — ${episode.title}`);

  }catch(e){

    $("status").innerHTML=
      `<div class="notice error">
        ❌ Erro ao guardar episódio.
        <br>
        <small>${esc(e.message||"Erro desconhecido")}</small><br><small class="muted">Se o erro for "Failed to fetch", abre o Console do site e verifica a rota /api/blob-upload.</small>
      </div>`;

  }

};


/* =========================
   ADMIN: CONQUISTAS / NOTÍCIAS / CALENDÁRIO
========================= */

let editingAchievementDefinitionId=null;
let editingAdminNewsId=null;
let editingAdminCalendarId=null;

function adminOnly(){
  return !!currentUser?.admin;
}

function adminRefreshAdvancedLists(){
  if(!adminOnly())return;

  const userSelect=$("adminAchUser");
  if(userSelect){
    const old=userSelect.value;
    userSelect.innerHTML='<option value="">Não atribuir</option>'+accounts.map(a=>`<option value="${esc(a.username)}">${esc(a.username)}</option>`).join("");
    if([...userSelect.options].some(o=>o.value===old))userSelect.value=old;
  }

  const achBox=$("adminAchievementsList");
  if(achBox){
    achBox.innerHTML=achievementDefinitions.map(a=>{
      const unlocked=achievements.filter(x=>x.achievementId===a.id).length;
      return `<div class="item"><div><b>${esc(a.icon||"🏆")} ${esc(a.title)}</b><div class="meta">${esc(a.desc||"")} · ⭐ ${Number(a.xp||0)} XP · 📊 ${unlocked} desbloqueios</div></div><div class="item-actions"><button class="btn" onclick="window.editAchievementDefinition('${esc(a.id)}')">✏️</button><button class="danger" onclick="window.deleteAchievementDefinition('${esc(a.id)}')">🗑️</button></div></div>`;
    }).join("")||'<p class="muted">Ainda não existem conquistas personalizadas.</p>';
  }

  const newsBox=$("adminNewsList");
  if(newsBox){
    newsBox.innerHTML=newsItems.slice().sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0)||((b.createdAt||0)-(a.createdAt||0))).map(n=>`<div class="item"><div><b>${n.pinned?"📌 ":""}${esc(n.title)}</b><div class="meta">${n.scheduledAt?`📅 ${new Date(n.scheduledAt).toLocaleString("pt-PT")}`:"Publicado"}</div></div><div class="item-actions"><button class="btn" onclick="window.editAdminNews('${esc(n.id)}')">✏️</button><button class="danger" onclick="window.deleteAdminNews('${esc(n.id)}')">🗑️</button></div></div>`).join("")||'<p class="muted">Ainda não existem notícias.</p>';
  }

  const calBox=$("adminCalendarList");
  if(calBox){
    calBox.innerHTML=calendarItems.slice().sort((a,b)=>((a.startAt||0)-(b.startAt||0))).map(c=>`<div class="item"><div><b>${c.kind==="trailer"?"🎞️":c.kind==="noticia"?"📰":"🎬"} ${esc(c.title)}</b><div class="meta">📅 ${c.startAt?new Date(c.startAt).toLocaleString("pt-PT"):esc(c.date||"—")} ${c.notify?"· 🔔":""}</div></div><div class="item-actions"><button class="btn" onclick="window.editAdminCalendar('${esc(c.id)}')">✏️</button><button class="danger" onclick="window.deleteAdminCalendar('${esc(c.id)}')">🗑️</button></div></div>`).join("")||'<p class="muted">Ainda não existem estreias.</p>';
  }

  const logsBox=$("adminActivityLogs");
  if(logsBox){
    logsBox.innerHTML=activityLogs.slice().sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).slice(0,100).map(l=>`<div class="item"><div><b>${esc(l.username||"—")}</b><div class="meta">${new Date(l.createdAt||Date.now()).toLocaleString("pt-PT")} · ${esc(l.action||"atividade")}</div><div class="muted">${esc(l.detail||"")}</div></div></div>`).join("")||'<p class="muted">Ainda não existem logs.</p>';
  }
}

function resetAdminAchievementForm(){
  editingAchievementDefinitionId=null;
  $("adminAchIcon").value="🏆";
  $("adminAchTitle").value="";
  $("adminAchDesc").value="";
  $("adminAchXP").value="50";
  $("adminAchUser").value="";
  $("adminAchSave").textContent="➕ Criar conquista";
}

window.editAchievementDefinition=async id=>{
  if(!adminOnly())return;
  const a=achievementDefinitions.find(x=>x.id===id);if(!a)return;
  editingAchievementDefinitionId=id;
  $("adminAchIcon").value=a.icon||"🏆";
  $("adminAchTitle").value=a.title||"";
  $("adminAchDesc").value=a.desc||"";
  $("adminAchXP").value=Number(a.xp||0);
  $("adminAchUser").value="";
  $("adminAchSave").textContent="💾 Guardar conquista";
};

window.deleteAchievementDefinition=async id=>{
  if(!adminOnly()||!confirm("Apagar esta conquista?"))return;
  await remove("achievementDefinitions",id);
  for(const a of achievements.filter(x=>x.achievementId===id))await remove("achievements",a.id);
  achievementDefinitions=await getAll("achievementDefinitions");
  achievements=await getAll("achievements");
  adminRefreshAdvancedLists();
  renderAchievements();
};

$("adminAchSave")?.addEventListener("click",async()=>{
  if(!adminOnly())return;
  const title=$("adminAchTitle").value.trim();
  if(!title){$("adminAchStatus").innerHTML='<div class="notice error">❌ Escreve um título.</div>';return;}
  const def={id:editingAchievementDefinitionId||makeId(),icon:$("adminAchIcon").value.trim()||"🏆",title,desc:$("adminAchDesc").value.trim(),xp:Math.max(0,Number($("adminAchXP").value||0)),createdAt:Date.now()};
  await put("achievementDefinitions",def);
  const target=$("adminAchUser").value;
  if(target){
    const already=achievements.find(a=>a.username===target&&a.achievementId===def.id);
    if(!already)await put("achievements",{id:makeId(),username:target,achievementId:def.id,unlockedAt:Date.now()});
  }
  achievementDefinitions=await getAll("achievementDefinitions");
  achievements=await getAll("achievements");
  $("adminAchStatus").innerHTML='<div class="notice success">✅ Conquista guardada!</div>';
  resetAdminAchievementForm();adminRefreshAdvancedLists();renderAchievements();
});
$("adminAchCancel")?.addEventListener("click",resetAdminAchievementForm);

function resetAdminNewsForm(){editingAdminNewsId=null;$("adminNewsTitle").value="";$("adminNewsText").value="";$("adminNewsSchedule").value="";$("adminNewsPinned").checked=false;$("adminNewsCover").value="";$("adminNewsSave").textContent="➕ Criar notícia";}
window.editAdminNews=async id=>{if(!adminOnly())return;const n=newsItems.find(x=>x.id===id);if(!n)return;editingAdminNewsId=id;$("adminNewsTitle").value=n.title||"";$("adminNewsText").value=n.text||"";$("adminNewsSchedule").value=n.scheduledAt?new Date(n.scheduledAt).toISOString().slice(0,16):"";$("adminNewsPinned").checked=!!n.pinned;$("adminNewsSave").textContent="💾 Guardar notícia";};
window.deleteAdminNews=async id=>{if(!adminOnly()||!confirm("Apagar esta notícia?"))return;await remove("news",id);newsItems=await getAll("news");adminRefreshAdvancedLists();renderNews();};
$("adminNewsSave")?.addEventListener("click",async()=>{if(!adminOnly())return;const title=$("adminNewsTitle").value.trim(),text=$("adminNewsText").value.trim();if(!title||!text){$("adminNewsStatus").innerHTML='<div class="notice error">❌ Preenche o título e o texto.</div>';return;}const old=editingAdminNewsId?newsItems.find(x=>x.id===editingAdminNewsId):null;let cover=old?.cover||"";const file=$("adminNewsCover").files[0];if(file)cover=await fileToDataURL(file);const schedule=$("adminNewsSchedule").value;const row={id:editingAdminNewsId||makeId(),title,text,cover,pinned:$("adminNewsPinned").checked,scheduledAt:schedule?new Date(schedule).getTime():0,createdAt:old?.createdAt||Date.now()};await put("news",row);newsItems=await getAll("news");$("adminNewsStatus").innerHTML='<div class="notice success">✅ Notícia guardada!</div>';resetAdminNewsForm();adminRefreshAdvancedLists();renderNews();if(window.miraculousMega?.notifyAllUsers && (!row.scheduledAt||row.scheduledAt<=Date.now()))await window.miraculousMega.notifyAllUsers("📰 Nova notícia!",row.title);});
$("adminNewsCancel")?.addEventListener("click",resetAdminNewsForm);

function resetAdminCalendarForm(){editingAdminCalendarId=null;$("adminCalKind").value="estreia";$("adminCalTitle").value="";$("adminCalDate").value="";$("adminCalNotify").checked=true;$("adminCalSave").textContent="➕ Adicionar estreia";}
window.editAdminCalendar=async id=>{if(!adminOnly())return;const c=calendarItems.find(x=>x.id===id);if(!c)return;editingAdminCalendarId=id;$("adminCalKind").value=c.kind||"estreia";$("adminCalTitle").value=c.title||"";$("adminCalDate").value=c.startAt?new Date(c.startAt).toISOString().slice(0,16):"";$("adminCalNotify").checked=!!c.notify;$("adminCalSave").textContent="💾 Guardar estreia";};
window.deleteAdminCalendar=async id=>{if(!adminOnly()||!confirm("Apagar esta estreia?"))return;await remove("calendar",id);calendarItems=await getAll("calendar");adminRefreshAdvancedLists();renderCalendar();};
$("adminCalSave")?.addEventListener("click",async()=>{if(!adminOnly())return;const title=$("adminCalTitle").value.trim(),dt=$("adminCalDate").value;if(!title||!dt){$("adminCalStatus").innerHTML='<div class="notice error">❌ Preenche o título e a data/hora.</div>';return;}const old=editingAdminCalendarId?calendarItems.find(x=>x.id===editingAdminCalendarId):null;const row={id:editingAdminCalendarId||makeId(),kind:$("adminCalKind").value,title,startAt:new Date(dt).getTime(),notify:$("adminCalNotify").checked,startNotified:old?.startNotified||false,date:new Date(dt).toLocaleString("pt-PT"),createdAt:old?.createdAt||Date.now()};await put("calendar",row);calendarItems=await getAll("calendar");$("adminCalStatus").innerHTML='<div class="notice success">✅ Estreia guardada!</div>';resetAdminCalendarForm();adminRefreshAdvancedLists();renderCalendar();if(row.notify&&row.startAt<=Date.now()&&!row.startNotified&&window.miraculousMega?.notifyAllUsers){await window.miraculousMega.notifyAllUsers("📅 Nova estreia!",row.title);row.startNotified=true;await put("calendar",row);calendarItems=await getAll("calendar");}});
$("adminCalCancel")?.addEventListener("click",resetAdminCalendarForm);

/* =========================
   PROFILE PHRASE
========================= */

function updatePhraseUI(){

  const value=
    $("myPhraseSelect").value;

  if(value==="Own phrase"){
    $("customPhrase")
      .classList
      .remove("hide");
  }else{
    $("customPhrase")
      .classList
      .add("hide");
  }

}


$("myPhraseSelect").onchange=
  updatePhraseUI;


$("savePhrase").onclick=async()=>{

  if(!currentUser)return;

  let phrase=
    $("myPhraseSelect").value;

  if(phrase==="Own phrase"){

    phrase=
      $("customPhrase")
        .value
        .trim();

    if(!phrase){

      $("phraseStatus").innerHTML=
        '<div class="notice error">❌ Escreve uma frase.</div>';

      return;
    }

  }

  phrase=phrase.slice(0,80);

  currentUser.phrase=phrase;

  await put(
    "accounts",
    currentUser
  );

  accounts=
    await getAll("accounts");

  saveCurrentSession();

  updateProfileUI();

  $("phraseStatus").innerHTML=
    '<div class="notice success">✅ Frase atualizada!</div>';

};


/* =========================
   ANNOUNCEMENTS
========================= */

function cleanExpiredAnnouncements(){

  const now=Date.now();

  announcements=
    announcements.filter(a=>
      !a.expiresAt ||
      a.expiresAt>now
    );

  /*
    A limpeza física é feita sem bloquear a página.
  */

  getAll("announcements")
    .then(all=>{

      all
      .filter(a=>
        a.expiresAt &&
        a.expiresAt<=now
      )
      .forEach(a=>
        remove(
          "announcements",
          a.id
        )
      );

    })
    .catch(()=>{});

}


function renderAnnouncements(){

  const now=Date.now();

  const sorted=
    [...announcements]
    .filter(a=>
      !a.expiresAt ||
      a.expiresAt>now
    )
    .sort(
      (a,b)=>
        (b.createdAt||0)-
        (a.createdAt||0)
    );

  $("announcementCount").textContent=
    sorted.length;

  $("announcements").innerHTML=
    sorted.map(a=>`

      <div class="announcement">

        <span
          class="announcement-label"
          style="background:${esc(a.color||"#e62b45")}">

          ${esc(a.label||"NOVIDADE")}

        </span>

        <div class="announcement-title">
          ${esc(a.title)}
        </div>

        <div class="muted">
          ${esc(a.text)}
        </div>

      </div>

    `).join("")
    ||
    '<p class="muted">Ainda não existem anúncios.</p>';

}


$("announcementColor").oninput=function(){

  $("colorPreview").style.background=
    this.value;

};


$("announcementLabel").oninput=function(){

  $("colorPreview").textContent=
    this.value||"NOVIDADE";

};


$("addAnnouncement").onclick=async()=>{

  if(!currentUser?.admin){

    $("announcementStatus").innerHTML=
      '<div class="notice error">❌ Apenas administradores podem publicar anúncios.</div>';

    return;
  }

  const label=
    $("announcementLabel").value.trim()||
    "NOVIDADE";

  const title=
    $("announcementTitle").value.trim();

  const text=
    $("announcementText").value.trim();

  const duration=
    Number(
      $("announcementDuration").value
    );

  if(!title||!text){

    $("announcementStatus").innerHTML=
      '<div class="notice error">❌ Preenche o título e o texto.</div>';

    return;
  }

  const announcement={

    id:makeId(),

    label,

    title,

    text,

    color:
      $("announcementColor").value,

    createdAt:Date.now(),

    expiresAt:
      duration>0
      ?Date.now()+duration
      :0

  };

  await put(
    "announcements",
    announcement
  );

  announcements=
    await getAll("announcements");

  renderAnnouncements();

  $("announcementTitle").value="";
  $("announcementText").value="";

  $("announcementStatus").innerHTML=
    '<div class="notice success">✅ Anúncio publicado!</div>';

};


/* =========================
   POLLS
========================= */

function getPollVotes(poll){

  if(!poll.votes){
    poll.votes={};
  }

  return poll.votes;
}


function hasVoted(poll){

  if(!currentUser)return false;

  const votes=
    getPollVotes(poll);

  return Object.prototype.hasOwnProperty.call(
    votes,
    currentUser.username
  );

}


function renderPolls(){

  if(!polls.length){

    $("polls").innerHTML=
      '<p class="muted">Ainda não existem votações.</p>';

    return;
  }

  $("polls").innerHTML=
    polls
    .filter(p=>!p.closed && (!p.startAt || Date.now()>=p.startAt) && (!p.endAt || Date.now()<p.endAt))
    .sort(
      (a,b)=>
        (b.createdAt||0)-
        (a.createdAt||0)
    )
    .map(p=>{

      const votes=
        getPollVotes(p);

      const total=
        Object.keys(votes).length;

      const voted=
        hasVoted(p);

      const counts=
        {};

      p.options.forEach(o=>{
        counts[o]=0;
      });

      Object.values(votes).forEach(option=>{

        if(
          Object.prototype.hasOwnProperty.call(
            counts,
            option
          )
        ){
          counts[option]++;
        }

      });

      return `

        <div class="poll">

          <h3>
            ${esc(p.question)}
          </h3>

          <small class="muted">
            ${total} voto${total===1?"":"s"}
          </small>

          ${
            !currentUser
            ?`
              <div class="notice">
                Entra na tua conta para votar.
              </div>
            `
            :""
          }

          ${
            currentUser && !voted
            ?
            p.options.map((o,i)=>`

              <label class="pollOption">

                <input
                  type="radio"
                  name="poll_${esc(p.id)}"
                  value="${esc(o)}">

                <span>${esc(o)}</span>

              </label>

            `).join("")
            :""
          }

          ${
            currentUser && !voted
            ?
            `
              <button
                class="btn primary"
                onclick="votePoll('${esc(p.id)}')">
                🗳️ Votar
              </button>
            `
            :""
          }

          ${
            voted
            ?
            `
              <div class="notice success">
                ✅ Já votaste nesta votação.
              </div>
            `
            :""
          }

          ${
            voted
            ?
            p.options.map(o=>{

              const count=
                counts[o]||0;

              const percent=
                total
                ?Math.round(
                  count/total*100
                )
                :0;

              return `

                <div style="margin-top:10px">

                  <div style="display:flex;justify-content:space-between">
                    <span>${esc(o)}</span>
                    <span>${percent}%</span>
                  </div>

                  <div class="pollBar">
                    <div style="width:${percent}%"></div>
                  </div>

                </div>

              `;

            }).join("")
            :""
          }

        </div>

      `;

    }).join("");

}


window.votePoll=async pollId=>{

  if(!currentUser){

    alert(
      "Tens de entrar para votar."
    );

    return;
  }

  const poll=
    polls.find(
      p=>p.id===pollId
    );

  if(!poll)return;

  if(hasVoted(poll)){

    alert(
      "Já votaste nesta votação."
    );

    return;
  }

  const selected=
    document.querySelector(
      `input[name="poll_${pollId}"]:checked`
    );

  if(!selected){

    alert(
      "Escolhe uma opção."
    );

    return;
  }

  if(!poll.votes){
    poll.votes={};
  }

  /*
    A chave é o username.
    Portanto a mesma conta não consegue votar
    duas vezes na mesma votação.
  */

  poll.votes[
    currentUser.username
  ]=selected.value;

  await put(
    "polls",
    poll
  );

  polls=
    await getAll("polls");
  currentUser.pollVotes=Number(currentUser.pollVotes||0)+1;
  await put("accounts",currentUser);
  if(window.miraculousMega?.xp){}
  renderPolls();

};


$("addPoll").onclick=async()=>{
  if(!currentUser?.admin){$("pollStatus").innerHTML='<div class="notice error">❌ Apenas administradores podem criar votações.</div>';return;}
  const question=$("pollQuestion").value.trim();
  const unique=[...new Set($("pollOptions").value.split("\n").map(x=>x.trim()).filter(Boolean))];
  if(!question||unique.length<2){$("pollStatus").innerHTML='<div class="notice error">❌ Precisas de uma pergunta e pelo menos 2 opções diferentes.</div>';return;}
  const startVal=$("pollStart")?.value||""; const endVal=$("pollEnd")?.value||"";
  const poll=editingPollId?polls.find(x=>x.id===editingPollId):{id:makeId(),votes:{},createdAt:Date.now(),closed:false};
  if(!poll)return;
  poll.question=question;poll.options=unique;poll.startAt=startVal?new Date(startVal).getTime():null;poll.endAt=endVal?new Date(endVal).getTime():null;poll.startNotified=!!poll.startNotified;poll.updatedAt=Date.now();
  await put("polls",poll);polls=await getAll("polls");
  $("pollQuestion").value="";$("pollOptions").value="";if($("pollStart"))$("pollStart").value="";if($("pollEnd"))$("pollEnd").value="";editingPollId=null;$("addPoll").textContent="Criar votação";
  $("pollStatus").innerHTML='<div class="notice success">✅ Votação guardada!</div>';renderPolls();renderAdminPolls();renderMegaPolls();
};

window.editPoll=async id=>{if(!currentUser?.admin)return;const p=polls.find(x=>x.id===id);if(!p)return;editingPollId=id;$("pollQuestion").value=p.question;$("pollOptions").value=p.options.join("\n");$("pollStart").value=p.startAt?new Date(p.startAt).toISOString().slice(0,16):"";$("pollEnd").value=p.endAt?new Date(p.endAt).toISOString().slice(0,16):"";$("addPoll").textContent="Guardar votação";};

/* =========================
   ADMIN USERS
========================= */

function renderAdminUsers(){

  if(!currentUser?.admin)return;

  $("userCount").textContent=
    accounts.length;

  $("adminUsers").innerHTML=
    accounts.map(a=>{

      const isSelf=
        normalizeUsername(a.username)===
        normalizeUsername(currentUser.username);

      return `

        <div class="item">

          <div>

            <b>
              ${esc(a.flag||"🌍")}
              ${esc(a.username)}
            </b>

            <div class="meta">
              ${a.admin?"Administrador":"Utilizador"}
              ·
              ${esc(a.phrase||"Claws out!")}
            </div>

          </div>

          <div class="item-actions">

            <button
              class="btn"
              onclick="openProfile('${esc(a.username)}')">
              👤
            </button>

            ${
              !isSelf
              ?
              `
                <button
                  class="btn"
                  onclick="toggleAdmin('${esc(a.username)}')">

                  ${a.admin
                    ?"⬇️ Remover admin"
                    :"⬆️ Promover admin"}

                </button>
              `
              :""
            }

          </div>

        </div>

      `;

    }).join("");

}


window.toggleAdmin=async username=>{

  if(!currentUser?.admin)return;

  const account=
    accounts.find(
      a=>
        normalizeUsername(a.username)===
        normalizeUsername(username)
    );

  if(!account)return;

  /*
    Um admin não pode remover o próprio admin
    através desta função.
  */

  if(
    normalizeUsername(account.username)===
    normalizeUsername(currentUser.username)
  ){
    return;
  }

  account.admin=!account.admin;

  await put(
    "accounts",
    account
  );

  accounts=
    await getAll("accounts");

  renderAdminUsers();

};


function renderAdminPolls(){
  const box=$("adminPolls");
  if(!box||!currentUser?.admin)return;
  box.innerHTML=polls.map(p=>{const total=Object.keys(p.votes||{}).length;const now=Date.now();const scheduled=p.startAt&&now<p.startAt;const ended=p.endAt&&now>=p.endAt;return `<div class="item"><div><b>🗳️ ${esc(p.question)}</b><div class="meta">${total} votos · ${scheduled?"Agendada":ended?"Terminada":p.closed?"Fechada":"Aberta"}${p.startAt?` · começa ${new Date(p.startAt).toLocaleString("pt-PT")}`:""}${p.endAt?` · termina ${new Date(p.endAt).toLocaleString("pt-PT")}`:""}</div></div><div class="item-actions"><button class="btn" onclick="editPoll('${esc(p.id)}')">✏️</button><button class="btn" onclick="togglePollClosed('${esc(p.id)}')">${p.closed?"🔓 Abrir":"🔒 Fechar"}</button><button class="danger" onclick="deletePoll('${esc(p.id)}')">🗑️</button></div></div>`}).join("")||'<p class="muted">Ainda não existem votações.</p>';
}
window.togglePollClosed=async id=>{if(!currentUser?.admin)return;const p=polls.find(x=>x.id===id);if(!p)return;p.closed=!p.closed;await put("polls",p);polls=await getAll("polls");renderPolls();renderAdminPolls();renderMegaPolls();};
window.deletePoll=async id=>{if(!currentUser?.admin||!confirm("Apagar esta votação?"))return;await remove("polls",id);polls=await getAll("polls");renderPolls();renderAdminPolls();renderMegaPolls();};

/* =========================
   SOCIAL CHAT
========================= */

let selectedFriendUsername=null;

function friendAccounts(){
  if(!currentUser)return [];
  return friendships.filter(f=>
    f.status==="accepted" &&
    (normalizeUsername(f.from)===normalizeUsername(currentUser.username) ||
     normalizeUsername(f.to)===normalizeUsername(currentUser.username))
  ).map(f=>{
    const other=normalizeUsername(f.from)===normalizeUsername(currentUser.username)?f.to:f.from;
    return accounts.find(a=>normalizeUsername(a.username)===normalizeUsername(other));
  }).filter(Boolean);
}

function updateFriendBadge(){
  const badge=$("friendBadge");
  if(!badge)return;
  const pending=currentUser ? friendships.filter(f=>f.status==="pending" && normalizeUsername(f.to)===normalizeUsername(currentUser.username)).length : 0;
  badge.textContent=pending;
  badge.classList.toggle("hide",pending===0);
}

function renderCommunityChat(){
  const login=$("communityLoginMessage"), content=$("communityChatContent");
  if(!login||!content)return;
  login.classList.toggle("hide",!!currentUser);
  content.classList.toggle("hide",!currentUser);
  if(!currentUser)return;
  const box=$("communityMessages");
  const rows=[...communityMessages].sort((a,b)=>(a.createdAt||0)-(b.createdAt||0)).slice(-150);
  box.innerHTML=rows.map(m=>`<div class="message ${normalizeUsername(m.username)===normalizeUsername(currentUser.username)?"mine":""}"><div class="messageMeta">${esc(m.flag||"🌍")} <b>${esc(m.username)}</b> · ${new Date(m.createdAt).toLocaleTimeString("pt-PT",{hour:"2-digit",minute:"2-digit"})}</div><div class="messageText">${esc(m.text)}</div></div>`).join("")||'<div class="chatEmpty">Ainda não existem mensagens. Sê o primeiro a falar! 🐾</div>';
  box.scrollTop=box.scrollHeight;
}

async function sendCommunityMessage(){
  if(!currentUser)return;
  if(currentUser.banned){alert("🚫 A tua conta está banida.");return;}
  if(currentUser.mutedUntil&&currentUser.mutedUntil>Date.now()){alert("🔇 Estás silenciado.");return;}
  const input=$("communityMessageInput"), text=input.value.trim();
  if(!text)return;
  await put("communityMessages",{id:makeId(),username:currentUser.username,flag:currentUser.flag||"🌍",text,createdAt:Date.now()});
  currentUser.messageCount=Number(currentUser.messageCount||0)+1;currentUser.lastSeen=Date.now();await put("accounts",currentUser);
  communityMessages=await getAll("communityMessages");
  if(window.miraculousMega?.notifyAllUsers && text.startsWith("@")){const target=text.split(/\s+/)[0].slice(1);await window.miraculousMega.notifyAllUsers("💬 Nova mensagem",`${currentUser.username} mencionou-te na comunidade.`)}
  input.value="";
  renderCommunityChat();
}

function renderPrivateFriends(){
  const picker=$("privateFriendPicker");
  if(!picker||!currentUser)return;
  const friends=friendAccounts();
  if(selectedFriendUsername && !friends.some(a=>normalizeUsername(a.username)===normalizeUsername(selectedFriendUsername)))selectedFriendUsername=null;
  picker.innerHTML=friends.map(a=>`<button class="privateFriend ${selectedFriendUsername&&normalizeUsername(selectedFriendUsername)===normalizeUsername(a.username)?"active":""}" onclick="selectPrivateFriend('${esc(a.username)}')"><span>${a.photo?`<img class="miniAvatar" src="${esc(a.photo)}" alt="">`:`<span class="miniFallback">👤</span>`}</span><span>${esc(a.username)}</span></button>`).join("")||'<div class="muted" style="padding:10px">Ainda não tens amigos.</div>';
  renderPrivateChat();
}

window.selectPrivateFriend=function(username){
  selectedFriendUsername=username;
  renderPrivateFriends();
};

function privateKey(a,b){return [normalizeUsername(a),normalizeUsername(b)].sort().join("|||");}

function renderPrivateChat(){
  const messagesBox=$("privateMessages"), header=$("privateChatHeader"), input=$("privateMessageInput"), send=$("privateSend");
  if(!messagesBox||!header)return;
  if(!currentUser || !selectedFriendUsername){
    header.textContent="Seleciona um amigo";
    messagesBox.innerHTML='<div class="chatEmpty">Escolhe um amigo para começar uma conversa privada. 💬</div>';
    input.disabled=true;send.disabled=true;return;
  }
  header.textContent="💬 "+selectedFriendUsername;
  input.disabled=false;send.disabled=false;
  const key=privateKey(currentUser.username,selectedFriendUsername);
  const rows=privateMessages.filter(m=>m.chatKey===key).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0)).slice(-200);
  messagesBox.innerHTML=rows.map(m=>`<div class="message ${normalizeUsername(m.from)===normalizeUsername(currentUser.username)?"mine":""}"><div class="messageMeta"><b>${esc(m.from)}</b> · ${new Date(m.createdAt).toLocaleTimeString("pt-PT",{hour:"2-digit",minute:"2-digit"})}</div><div class="messageText">${esc(m.text)}</div></div>`).join("")||'<div class="chatEmpty">Ainda não há mensagens nesta conversa.</div>';
  messagesBox.scrollTop=messagesBox.scrollHeight;
}

async function sendPrivateMessage(){
  if(!currentUser||!selectedFriendUsername)return;
  if(currentUser.banned){alert("🚫 A tua conta está banida.");return;}
  if(currentUser.mutedUntil&&currentUser.mutedUntil>Date.now()){alert("🔇 Estás silenciado.");return;}
  const input=$("privateMessageInput"), text=input.value.trim();
  if(!text)return;
  await put("privateMessages",{id:makeId(),chatKey:privateKey(currentUser.username,selectedFriendUsername),from:currentUser.username,to:selectedFriendUsername,text,createdAt:Date.now()});
  currentUser.messageCount=Number(currentUser.messageCount||0)+1;currentUser.lastSeen=Date.now();await put("accounts",currentUser);
  if(window.miraculousMega?.notify)await window.miraculousMega.notify(selectedFriendUsername,"💬 Nova mensagem!",`${currentUser.username} enviou-te uma mensagem.`);
  privateMessages=await getAll("privateMessages");
  input.value="";
  renderPrivateChat();
}

function openSocialSection(id){
  const el=$(id); if(el)el.scrollIntoView({behavior:"smooth",block:"start"});
}

$("communityChatButton").onclick=()=>openSocialSection("chat");
$("communityChatTop").onclick=()=>openSocialSection("chat");
$("friendsQuickButton").onclick=()=>openSocialSection("amigos");
$("pollsQuickButton").onclick=()=>openSocialSection("votacoes");
$("communitySend").onclick=sendCommunityMessage;
$("privateSend").onclick=sendPrivateMessage;
$("communityMessageInput").addEventListener("keydown",e=>{if(e.key==="Enter")sendCommunityMessage();});
$("privateMessageInput").addEventListener("keydown",e=>{if(e.key==="Enter")sendPrivateMessage();});

function renderSocial(){
  updateFriendBadge();
  renderCommunityChat();
  const login=$("privateLoginMessage"),content=$("privateChatContent");
  if(login&&content){login.classList.toggle("hide",!!currentUser);content.classList.toggle("hide",!currentUser);}
  if(currentUser)renderPrivateFriends();
}

/* =========================
   MAINTENANCE
========================= */

async function checkMaintenance(){

  const maintenance=
    await getItem(
      "settings",
      "maintenance"
    );

  const active=
    maintenance?.active===true;

  /*
    Admins conseguem continuar a utilizar o site.
  */

  if(
    active &&
    !currentUser?.admin
  ){

    $("maintenanceScreen")
      .classList
      .add("active");

  }else{

    $("maintenanceScreen")
      .classList
      .remove("active");

  }

}


$("toggleMaintenance").onclick=async()=>{

  if(!currentUser?.admin)return;

  const old=
    await getItem(
      "settings",
      "maintenance"
    );

  const active=
    !(old?.active===true);

  await put(
    "settings",
    {
      id:"maintenance",
      active
    }
  );

  settings.maintenance={
    id:"maintenance",
    active
  };

  $("maintenanceStatus").innerHTML=
    `<div class="notice ${active?"error":"success"}">
      ${active
        ?"🔴 Modo de manutenção ativado."
        :"🟢 Modo de manutenção desativado."}
    </div>`;

  checkMaintenance();

};


/* =========================
   BACKGROUND
========================= */

async function loadBackground(){

  try{

    const s=
      await getItem(
        "settings",
        "background"
      );

    $("backgroundImage").style.display=
      "none";

    $("backgroundVideo").style.display=
      "none";

    if(!s)return;

    if(s.type==="image"){

      $("backgroundImage").src=
        s.data;

      $("backgroundImage").style.display=
        "block";

    }

    if(s.type==="video"){

      $("backgroundVideo").src=
        s.data;

      $("backgroundVideo").style.display=
        "block";

      $("backgroundVideo")
        .play()
        .catch(()=>{});

    }

  }catch(e){

    console.warn(e);

  }

}


$("saveBackground").onclick=async()=>{

  if(!currentUser?.admin)return;

  const image=
    $("backgroundImageFile").files[0];

  const video=
    $("backgroundVideoFile").files[0];

  if(!image&&!video){

    $("backgroundStatus").innerHTML=
      '<div class="notice error">❌ Seleciona uma imagem ou vídeo.</div>';

    return;
  }

  try{

    const file=
      video||image;

    const data=
      await fileToDataURL(file);

    await put(
      "settings",
      {
        id:"background",
        type:video?"video":"image",
        data
      }
    );

    await loadBackground();

    $("backgroundImageFile").value="";
    $("backgroundVideoFile").value="";

    $("backgroundStatus").innerHTML=
      '<div class="notice success">✅ Fundo atualizado!</div>';

  }catch(e){

    $("backgroundStatus").innerHTML=
      '<div class="notice error">❌ Não foi possível guardar o fundo.</div>';

  }

};


$("removeBackground").onclick=async()=>{

  if(!currentUser?.admin)return;

  try{

    await remove(
      "settings",
      "background"
    );

    $("backgroundImage")
      .removeAttribute("src");

    $("backgroundVideo").pause();

    $("backgroundVideo")
      .removeAttribute("src");

    $("backgroundImage").style.display=
      "none";

    $("backgroundVideo").style.display=
      "none";

    $("backgroundStatus").innerHTML=
      '<div class="notice success">✅ Fundo removido.</div>';

  }catch(e){}

};


/* =========================
   SEARCH / FILTER
========================= */

$("search").oninput=render;

$("seriesFilter").onchange=render;
$("seasonFilter").onchange=render;
$("langFilter").onchange=render;


/* =========================
   START
========================= */

(async()=>{

  try{

    await openDB();
    await importStaticExportData();
    await ensureDefaultAdmin();
    await restoreSession();
    try{ await loadData(); }catch(loadError){
      console.error("Falha ao carregar dados da aplicação",loadError);
      await refreshAccounts();
      updateProfileUI();
      render();
    }

    await checkAchievements();

    renderAchievements();

    renderFriends();

    renderPolls();

    updateProfileUI();

    await checkMaintenance();

  }catch(e){

    console.error(e);

    $("grid").innerHTML=
      `<p class="muted">
        ❌ Erro ao iniciar o catálogo.
        <br>
        <small>${esc(e.message||"Erro desconhecido")}</small>
      </p>`;

  }

})();



/* =========================
   MIRACULOUS.KK MEGA FEATURES
========================= */
(function(){
  const F={
    rooms:["Geral","Teorias","Episódios","Memes","Spoilers"],
    wiki:[
      ["Marinette Dupain-Cheng","🐞 Ladybug · Portadora do Miraculous da Joaninha"],
      ["Adrien Agreste","🐈 Cat Noir · Portador do Miraculous do Gato Preto"],
      ["Tikki","🐞 Kwami da criação"],
      ["Plagg","🐈 Kwami da destruição"],
      ["Miraculous","✨ Joias mágicas e os seus poderes"]
    ],
    quiz:[
      {q:"Quem é o kwami da criação?",o:["Plagg","Tikki","Wayzz","Sass"],a:1},
      {q:"Qual é o nome do herói do Miraculous do Gato Preto?",o:["Cat Noir","Carapace","Viperion","Pegasus"],a:0},
      {q:"Qual é o poder de Ladybug?",o:["Cataclismo","Talismã","Miraculous Ladybug","Second Chance"],a:2}
    ]
  };
  let quizIndex=0;
  let quizScore=0;

  function ready(){return typeof db!=="undefined" && db;}
  function u(){return currentUser;}
  function uname(){return normalizeUsername(u()?.username||"");}
  function online(a){return !!a && (Date.now()-(a.lastSeen||0)<5*60*1000);}
  function levelInfo(xp=0){let level=Math.max(1,Math.floor(xp/250)+1);return {level,xp,xpNext:level*250,percent:Math.min(100,Math.round((xp%250)/250*100))};}
  async function log(action,detail=""){if(!u()||!ready())return;const row={id:makeId(),username:u().username,action,detail,createdAt:Date.now()};await put("activityLogs",row);activityLogs.push(row);}
  async function notify(username,title,text,type="info"){if(!ready())return;const row={id:makeId(),to:normalizeUsername(username),title,text,type,read:false,createdAt:Date.now()};await put("notifications",row);notifications.push(row);renderNotifs();updateNotifBadges();}
  async function xp(amount,reason){if(!u())return;u().xp=Number(u().xp||0)+amount;await put("accounts",u());accounts=await getAll("accounts");saveCurrentSession();await log("xp",`${amount} XP · ${reason}`);renderProfile();renderRanking();}
  function blocked(target){return !!u()?.blocked?.includes(normalizeUsername(target));}

  async function seedAdvanced(){
    if(!ready())return;
    if(!(await getAll("calendar")).length){
      const rows=[
        {id:makeId(),date:"15 Agosto",title:"T6 E6 — Próxima estreia",kind:"estreia"},
        {id:makeId(),date:"22 Agosto",title:"T6 E7 — Próxima estreia",kind:"estreia"}
      ]; for(const r of rows)await put("calendar",r);
    }
    if(!(await getAll("news")).length){
      await put("news",{id:makeId(),title:"Bem-vindo ao novo miraculous.kk",text:"A comunidade ganhou perfis, amigos, níveis, fórum, quiz, wiki e muito mais!",createdAt:Date.now()});
    }
    if(!(await getAll("wiki")).length){for(const [title,text] of F.wiki)await put("wiki",{id:makeId(),title,text,createdAt:Date.now()});}
    if(!(await getAll("quiz")).length){for(const q of F.quiz)await put("quiz",{id:makeId(),...q});}
    calendarItems=await getAll("calendar");newsItems=await getAll("news");wikiItems=await getAll("wiki");quizItems=await getAll("quiz");
  }

  function openHub(tab="profile"){
    $("megaModal").classList.remove("hide");
    showTab(tab);
    renderMegaAll();
    if(!u() && ["profile","friends","notifications","custom","achievements"].includes(tab)){
      setTimeout(()=>$("authModal")?.classList.remove("hide"),80);
    }
  }
  function showTab(tab){
    document.querySelectorAll(".featurePanel").forEach(x=>x.classList.remove("active"));
    const p=$("panel-"+tab);if(p)p.classList.add("active");
    document.querySelectorAll("#featureTabs [data-tab]").forEach(b=>b.classList.toggle("primary",b.dataset.tab===tab));
  }
  function avatar(a,cls="avatarLg"){return a?.photo?`<img class="${cls}" src="${esc(a.photo)}" alt="">`:`<div class="${cls}">👤</div>`;}

  function renderProfile(){
    const box=$("megaProfile");if(!box)return;
    if(!u()){box.innerHTML=`<div class="notice">🔐 Entra na tua conta para personalizares o teu perfil.</div><button class="btn primary" id="megaLoginBtn">Entrar / Criar conta</button>`;$("megaLoginBtn")?.addEventListener("click",()=>{$("authModal").classList.remove("hide")});return;}
    const info=levelInfo(u().xp||0);const watched=(u().watched||[]).length;const fav=(u().favorites||[]).length;const ratings=Object.keys(u().ratings||{}).length;
    const isOnline=Date.now()-(u().lastSeen||0)<5*60*1000;
    box.innerHTML=`<div class="megaCard"><div class="profileHero" style="--profile-color:${esc(u().profileColor||"#e62b45")}">${avatar(u())}<div class="profileHeroInfo"><h2 style="margin:0">${esc(u().username)} ${u().role&&u().role!=="user"?`<small>👑 ${esc(u().role)}</small>`:""}</h2><p class="muted"><span class="onlineDot ${isOnline?"on":""}"></span> ${isOnline?"Online":"Offline"} · ${esc(u().flag||"🌍")}</p><p>${esc(u().bio||"Sem descrição.")}</p><div><b>Nível ${info.level} — Fã de Miraculous</b><div class="xpBar"><div style="width:${info.percent}%"></div></div><small class="muted">${u().xp||0} XP · ${Math.max(0,info.xpNext-(u().xp||0))} XP para o próximo nível</small></div></div><button class="btn" id="editProfileMega">✏️ Editar perfil</button></div></div><div class="megaGrid" style="margin-top:12px"><div class="megaCard"><b>📺 Episódios vistos</b><h2>${watched}</h2><button class="btn" id="profileWatchedBtn">Ver histórico</button></div><div class="megaCard"><b>❤️ Favoritos</b><h2>${fav}</h2><button class="btn" id="profileFavBtn">Ver favoritos</button></div><div class="megaCard"><b>⭐ Avaliações</b><h2>${ratings}</h2><button class="btn" id="profileRatingsBtn">Ver avaliações</button></div></div><div class="megaToolbar"><button class="btn" id="accountSettingsBtn">🔒 Definições de conta</button><button class="btn" id="profileNotificationsBtn">🔔 Notificações</button></div>`;
    $("editProfileMega")?.addEventListener("click",openEditProfile);
    $("accountSettingsBtn")?.addEventListener("click",()=>showTab("custom"));
    $("profileNotificationsBtn")?.addEventListener("click",()=>showTab("notifications"));
    $("profileWatchedBtn")?.addEventListener("click",()=>showTab("episodes"));
    $("profileFavBtn")?.addEventListener("click",()=>showTab("episodes"));
    $("profileRatingsBtn")?.addEventListener("click",()=>showTab("episodes"));
  }

  function openEditProfile(){if(!u())return;$("epName").value=u().username;$("epBio").value=u().bio||"";$("epColor").value=u().profileColor||"#e62b45";$("editProfileModal").classList.remove("hide");}
  async function saveProfile(){if(!u())return;const newName=$("epName").value.trim();if(!newName)return;const norm=normalizeUsername(newName);const conflict=accounts.find(a=>normalizeUsername(a.username)===norm&&normalizeUsername(a.username)!==uname());if(conflict){$("epStatus").innerHTML='<span class="error">❌ Esse nome já está a ser usado.</span>';return;}const old=u().username;u().username=newName;u().bio=$("epBio").value.trim();u().profileColor=$("epColor").value;const file=$("epAvatar").files[0];if(file)u().photo=await fileToDataURL(file);u().lastSeen=Date.now();await put("accounts",u());accounts=await getAll("accounts");saveCurrentSession();$("editProfileModal").classList.add("hide");updateProfileUI();renderProfile();await log("profile_edit",old);}

  function renderNotifs(){const box=$("megaNotifications");if(!box)return;if(!u()){box.innerHTML='<div class="notice">Entra na tua conta para veres as notificações.</div>';return;}const rows=notifications.filter(n=>n.to===uname()).sort((a,b)=>b.createdAt-a.createdAt);box.innerHTML=`<div class="megaToolbar"><button class="btn" id="markAllRead">✓ Marcar todas como lidas</button></div>`+(rows.map(n=>`<div class="notifItem ${n.read?"":"unread"}"><b>${esc(n.title)}</b><p>${esc(n.text)}</p><small class="muted">${new Date(n.createdAt).toLocaleString("pt-PT")}</small></div>`).join("")||'<p class="muted">Não tens notificações.</p>');$("markAllRead")?.addEventListener("click",async()=>{for(const n of rows)if(!n.read){n.read=true;await put("notifications",n)}notifications=await getAll("notifications");renderNotifs();updateNotifBadges();});}
  function updateNotifBadges(){const n=u()?notifications.filter(x=>x.to===uname()&&!x.read).length:0;["notificationBadge","megaNotifBadge"].forEach(id=>{const b=$(id);if(!b)return;b.textContent=n;b.classList.toggle("hide",!n)});}

  function renderMegaFriends(){const box=$("megaFriends");if(!box)return;if(!u()){box.innerHTML='<div class="notice">🔐 Entra para gerir amigos.</div>';return;}const friends=friendAccounts();const pending=friendships.filter(f=>f.status==="pending"&&normalizeUsername(f.to)===uname());box.innerHTML=`<div class="megaToolbar"><input id="megaFriendSearch" placeholder="➕ Procurar utilizador..."><button class="btn primary" id="megaFriendSearchBtn">Procurar</button></div><div id="megaFriendResults"></div><h3>🤝 Pedidos (${pending.length})</h3><div>${pending.map(f=>`<div class="megaCard"><b>${esc(f.from)}</b><button class="btn green" onclick="window.acceptFriend('${esc(f.id)}')">Aceitar</button> <button class="btn danger" onclick="window.rejectFriend('${esc(f.id)}')">Recusar</button></div>`).join("")||'<p class="muted">Sem pedidos.</p>'}</div><h3>👀 Amigos online</h3><div class="megaGrid">${friends.map(a=>`<div class="megaCard"><div class="profileHero">${avatar(a,"avatarLg")}<div><b>${esc(a.username)}</b><p><span class="onlineDot ${online(a)?"on":""}"></span>${online(a)?"Online":"Offline"}</p><button class="btn" onclick="window.openFriendProfile('${esc(a.username)}')">👤 Perfil</button> <button class="btn" onclick="window.openFriendChat('${esc(a.username)}')">💬 Chat</button></div></div></div>`).join("")||'<p class="muted">Ainda não tens amigos.</p>'}</div>`;
    $("megaFriendSearchBtn")?.addEventListener("click",megaFriendSearch);$("megaFriendSearch")?.addEventListener("keydown",e=>{if(e.key==="Enter")megaFriendSearch()});
  }
  async function megaFriendSearch(){const q=normalizeUsername($("megaFriendSearch")?.value);if(!q)return;const found=accounts.filter(a=>normalizeUsername(a.username).includes(q)&&normalizeUsername(a.username)!==uname()&&!blocked(a.username)).slice(0,20);$("megaFriendResults").innerHTML=found.map(a=>`<div class="megaCard"><b>${esc(a.username)}</b> <span class="muted">${online(a)?"🟢":"⚫"}</span><button class="btn primary" onclick="window.sendFriendMega('${esc(a.username)}')">➕ Adicionar</button></div>`).join("")||'<p class="muted">Nenhum utilizador encontrado.</p>';}
  window.sendFriendMega=async target=>{const exists=friendships.find(f=>[normalizeUsername(f.from),normalizeUsername(f.to)].includes(uname())&&[normalizeUsername(f.from),normalizeUsername(f.to)].includes(normalizeUsername(target)));if(exists){alert("Já existe uma relação com esse utilizador.");return;}const row={id:makeId(),from:u().username,to:target,status:"pending",createdAt:Date.now()};await put("friendships",row);friendships.push(row);await notify(target,"👥 Novo pedido de amizade!",`${u().username} quer adicionar-te como amigo.`);await xp(10,"adicionar amigo");renderMegaFriends();renderFriends();};
  window.acceptFriend=async id=>{const f=friendships.find(x=>x.id===id);if(!f)return;f.status="accepted";await put("friendships",f);await notify(f.from,"🤝 Pedido aceite!",`${u().username} aceitou o teu pedido.`);await xp(15,"aceitar amizade");friendships=await getAll("friendships");renderMegaFriends();renderFriends();};
  window.rejectFriend=async id=>{await remove("friendships",id);friendships=await getAll("friendships");renderMegaFriends();renderFriends();};
  window.openFriendProfile=async name=>{const a=accounts.find(x=>normalizeUsername(x.username)===normalizeUsername(name));if(!a)return;showTab("profile");$("megaProfile").innerHTML=`<div class="megaCard"><div class="profileHero">${avatar(a)}<div><h2>${esc(a.username)}</h2><p><span class="onlineDot ${online(a)?"on":""}"></span>${online(a)?"Online":"Offline"}</p><p>${esc(a.bio||"Sem descrição.")}</p><p class="muted">🏆 Nível ${levelInfo(a.xp||0).level} · 📺 ${(a.watched||[]).length} vistos · ❤️ ${(a.favorites||[]).length} favoritos</p></div></div><div class="megaToolbar"><button class="btn" onclick="window.openFriendChat('${esc(a.username)}')">💬 Enviar mensagem</button><button class="btn danger" onclick="window.blockMega('${esc(a.username)}')">🚫 Bloquear</button></div></div>`;};
  window.openFriendChat=name=>{openSocialSection("chatAmigos");setTimeout(()=>{selectedFriendUsername=name;renderPrivateFriends()},50)};
  window.blockMega=async name=>{if(!u())return;if(!Array.isArray(u().blocked))u().blocked=[];if(!u().blocked.includes(normalizeUsername(name)))u().blocked.push(normalizeUsername(name));await put("accounts",u());await notify(name,"🚫 Utilizador bloqueado",`${u().username} bloqueou-te.`);renderMegaFriends();};

  function renderCommunityMega(){const rooms=$("megaRooms"),forum=$("megaForum");if(!rooms||!forum)return;rooms.innerHTML=F.rooms.map(r=>`<div class="roomCard"><b>💬 ${esc(r)}</b><p class="muted">Sala de conversa da comunidade.</p><button class="btn" onclick="window.openRoom('${esc(r)}')">Entrar</button></div>`).join("");const posts=forumPosts.slice().sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0)||b.createdAt-a.createdAt).slice(0,30);forum.innerHTML=posts.map(p=>`<article class="forumPost"><div class="postMeta">${p.pinned?"📌 ":""}${esc(p.author)} · ${new Date(p.createdAt).toLocaleString("pt-PT")}</div><h3>${esc(p.title)}</h3><p>${esc(p.text)}</p><div class="megaToolbar"><button class="btn likeBtn ${p.likes?.includes(uname())?"liked":""}" onclick="window.likePost('${esc(p.id)}')">❤️ ${p.likes?.length||0}</button><button class="btn" onclick="window.commentPost('${esc(p.id)}')">💬 ${forumComments.filter(c=>c.postId===p.id).length}</button>${normalizeUsername(p.author)===uname()?`<button class="btn danger" onclick="window.deletePost('${esc(p.id)}')">🗑️</button>`:`<button class="btn" onclick="window.reportPost('${esc(p.id)}')">🚨 Denunciar</button>`}</div></article>`).join("")||'<p class="muted">Ainda não há publicações. Cria a primeira!</p>';}
  window.openRoom=r=>{openSocialSection("chat");alert(`Sala: ${r}\nUsa o chat da comunidade para conversar.`)};
  $("newForumPost")?.addEventListener("click",async()=>{if(!u()){alert("Entra primeiro.");return}const title=prompt("Título da publicação:");if(!title)return;const text=prompt("Texto:");if(!text)return;const row={id:makeId(),author:u().username,title,text,likes:[],pinned:false,createdAt:Date.now()};await put("forumPosts",row);forumPosts.push(row);await xp(5,"criar publicação");renderCommunityMega();});
  window.likePost=async id=>{if(!u())return;const p=forumPosts.find(x=>x.id===id);if(!p)return;p.likes=p.likes||[];const i=p.likes.indexOf(u().username);if(i>=0)p.likes.splice(i,1);else{p.likes.push(u().username);await xp(1,"gostar de publicação")}await put("forumPosts",p);renderCommunityMega();};
  window.deletePost=async id=>{const p=forumPosts.find(x=>x.id===id);if(!p||normalizeUsername(p.author)!==uname()&&!u()?.admin)return;if(confirm("Apagar publicação?")){await remove("forumPosts",id);forumPosts=await getAll("forumPosts");renderCommunityMega();}};
  window.commentPost=async id=>{if(!u())return;const text=prompt("Comentário:");if(!text)return;await put("forumComments",{id:makeId(),postId:id,author:u().username,text,createdAt:Date.now()});forumComments=await getAll("forumComments");await xp(2,"comentar");renderCommunityMega();};
  window.reportPost=async id=>{if(!u())return;await put("reports",{id:makeId(),targetId:id,targetType:"forumPost",from:u().username,reason:"Denúncia da comunidade",createdAt:Date.now(),status:"open"});alert("🚨 Denúncia enviada aos moderadores.");};

  function decorateEpisodeCards(){document.querySelectorAll("[data-episode-id]").forEach(card=>{if(card.dataset.megaDone)return;card.dataset.megaDone="1";const id=card.dataset.episodeId;const e=episodes.find(x=>x.id===id);if(!e)return;const fav=(u()?.favorites||[]).includes(id);const rating=u()?.ratings?.[id]||0;const prog=u()?.progress?.[id]||0;const extra=document.createElement("div");extra.className="megaToolbar";extra.innerHTML=`<button class="btn ${fav?"green":""}" data-fav>❤️ ${fav?"Favorito":"Favoritar"}</button><button class="btn" data-view>▶️ Ver</button><button class="btn" data-full>⛶ Fullscreen</button><button class="btn" data-comments>💬 Comentários</button>${e.imdbUrl?`<a class="btn" href="${esc(e.imdbUrl)}" target="_blank" rel="noopener noreferrer">⭐ IMDb</a>`:""}<div style="flex:1;min-width:100%"><small class="muted">Progresso ${prog}%</small><div class="progressBar"><div style="width:${prog}%"></div></div></div><div class="muted">⭐ Média: ${episodeAverageRating(id)||"—"}</div><div class="ratingStars">${[1,2,3,4,5].map(n=>`<button data-rate="${n}" class="${n<=rating?"active":""}">★</button>`).join("")}</div>`;card.querySelector(".body")?.appendChild(extra);extra.querySelector("[data-fav]").onclick=()=>toggleFavoriteMega(id);extra.querySelector("[data-view]").onclick=()=>openEpisodePlayer(e,false);extra.querySelector("[data-full]").onclick=()=>openEpisodePlayer(e,true);extra.querySelector("[data-comments]").onclick=()=>commentEpisodeMega(id);extra.querySelectorAll("[data-rate]").forEach(b=>b.onclick=()=>rateEpisode(id,Number(b.dataset.rate)));});}
  async function toggleFavoriteMega(id){if(!u()){alert("Entra para usar favoritos.");return}if(!Array.isArray(u().favorites))u().favorites=[];const i=u().favorites.indexOf(id);if(i>=0)u().favorites.splice(i,1);else{u().favorites.push(id);await xp(3,"favoritar episódio")}await put("accounts",u());accounts=await getAll("accounts");saveCurrentSession();render();renderProfile();}
  async function rateEpisode(id,r){if(!u())return;if(!u().ratings)u().ratings={};u().ratings[id]=r;await put("accounts",u());await xp(2,"avaliar episódio");render();renderProfile();}
  window.detectVideoKind=window.detectVideoKind||function(url){
    try{
      const u=new URL(String(url||""),location.href), h=u.hostname.toLowerCase();
      if(h.includes("youtube.com")||h.includes("youtu.be"))return "youtube";
      if(h.includes("drive.google.com"))return "gdrive";
      if(/\.mp4(?:$|[?#])/i.test(u.pathname+u.search))return "mp4";
      return "url";
    }catch(_){return "url";}
  };

  let currentPlayingEpisodeId=null;
  function detectVideoKind(url){
    try{
      const u=new URL(String(url||""),location.href);
      const host=u.hostname.toLowerCase();
      if(host.includes("youtube.com") || host.includes("youtu.be")) return "youtube";
      if(host.includes("drive.google.com")) return "gdrive";
      if(/\.mp4(?:$|[?#])/i.test(u.pathname+u.search)) return "mp4";
      if(/^https?:$/i.test(u.protocol)) return "url";
    }catch(_){}
    return "url";
  }
  // Public alias: admin/save code can never fail with "detectVideoKind is not defined".
  window.detectVideoKind=detectVideoKind;

  function youtubeEmbedUrl(raw){
    try{
      const u=new URL(String(raw||""));
      let id="";
      if(u.hostname.includes("youtu.be")) id=u.pathname.slice(1).split("/")[0];
      else if(u.searchParams.get("v")) id=u.searchParams.get("v");
      else if(u.pathname.includes("/embed/")) id=u.pathname.split("/embed/")[1].split("/")[0];
      else if(u.pathname.includes("/shorts/")) id=u.pathname.split("/shorts/")[1].split("/")[0];
      if(!id)return null;
      return "https://www.youtube.com/embed/"+encodeURIComponent(id)+"?rel=0&modestbranding=1";
    }catch(_){ return null; }
  }

  function googleDriveEmbedUrl(raw){
    try{
      const u=new URL(String(raw||""));
      let id=u.searchParams.get("id")||"";
      const m=u.pathname.match(/\/file\/d\/([^/]+)/);
      if(!id && m) id=m[1];
      if(!id)return null;
      return "https://drive.google.com/file/d/"+encodeURIComponent(id)+"/preview";
    }catch(_){ return null; }
  }

  let activeVideoObjectUrl=null;


  function playerSetLanguage(lang){
    document.querySelectorAll("[data-player-lang]").forEach(btn=>{
      btn.classList.toggle("active", btn.dataset.playerLang===lang);
    });

    const video=$("megaVideo");
    if(!video || video.classList.contains("hide")) return;

    const wanted=String(lang||"").toLowerCase();
    const tracks=video.textTracks||[];
    let matched=false;

    for(let i=0;i<tracks.length;i++){
      const t=tracks[i];
      const srclang=String(t.language||"").toLowerCase();
      const label=String(t.label||"").toLowerCase();
      const isMatch =
        srclang===wanted ||
        srclang.startsWith(wanted.split("-")[0]) ||
        label.toLowerCase()===wanted;

      t.mode=isMatch ? "showing" : "disabled";
      if(isMatch) matched=true;
    }

    $("playerHint").textContent =
      matched
        ? "Legendas: "+(lang==="pt-PT"?"Português (Portugal)":lang==="pt-BR"?"Português (Brasil)":lang==="fr"?"Français":"English")
        : "Não existem legendas disponíveis neste idioma para este vídeo.";
  }

  document.querySelectorAll("[data-player-lang]").forEach(btn=>{
    btn.addEventListener("click",()=>playerSetLanguage(btn.dataset.playerLang));
  });

  async function openEpisodePlayer(e,fullscreen){
    currentPlayingEpisodeId=e.id;

    $("playerTitle").textContent=e.title||"Episódio";
    $("playerEpisodeTitle").textContent=e.title||"Episódio";
    $("playerHint").textContent="Escolhe o idioma das legendas acima.";
    const imdb=String(e.imdbUrl||"").trim();
    $("playerImdb").innerHTML=imdb ? `<a class="btn" href="${esc(imdb)}" target="_blank" rel="noopener noreferrer">Ver nota no IMDb</a>` : "";
    renderEpisodeComments(e.id);
    document.querySelectorAll("[data-player-lang]").forEach(btn=>{
      btn.classList.toggle("active",btn.dataset.playerLang==="pt-PT");
    });
    e.views=Number(e.views||0)+1;
    try{await put("episodes",e)}catch(_){}

    const video=$("megaVideo"),frame=$("megaFrame");
    if(activeVideoObjectUrl){URL.revokeObjectURL(activeVideoObjectUrl);activeVideoObjectUrl=null;}
    video.pause();
    video.removeAttribute("src");
    if(e.thumbnail) video.poster=e.thumbnail;
    else video.removeAttribute("poster");
    frame.src="about:blank";
    frame.classList.add("hide");
    video.classList.remove("hide");

    // Vercel Blob is the canonical source for newly uploaded MP4s.
    // Older records may have an invalid relative URL such as "/"; never send
    // the site HTML to <video>, because Chromium reports that as a demuxer error.
    const storedBlobUrl=String(e.videoStorage?.url||"").trim();
    const rawSource=storedBlobUrl||String(e.videoUrl||"").trim();
    let source=rawSource;
    let kind=e.videoKind||detectVideoKind(source);
    let opened=false;

    try{
      if(source){
        const u=new URL(source,location.href);
        const isSiteDocument=(u.origin===location.origin && (u.pathname==="/" || !/\.mp4(?:$|[?#])/i.test(u.pathname+u.search)));
        if(isSiteDocument){
          console.warn("[Player] URL de vídeo inválido — está a apontar para a página do site:",source);
          source="";
          kind="url";
        } else if(u.protocol==="http:" && location.protocol==="https:"){
          // Mixed-content MP4 cannot be loaded by an HTTPS page.
          console.warn("[Player] MP4 bloqueado por mixed content:",source);
          source="";
          kind="url";
        }
      }
    }catch(err){
      console.warn("[Player] URL de vídeo inválido:",source,err);
      source="";
      kind="url";
    }

    if(e.videoStorage?.kind==="vercel-blob" && source){
      video.src=source;
      video.load();
      opened=true;
    }else if(e.videoStorage?.kind==="opfs") {
      try{
        const file=await getVideoFromOPFS(e.videoStorage);
        activeVideoObjectUrl=URL.createObjectURL(file);
        video.src=activeVideoObjectUrl;
        video.load();
        opened=true;
      }catch(err){
        console.error("Não foi possível abrir o vídeo OPFS:",err);
      }
    }else if(e.videoData){
      const bytes=e.videoData instanceof ArrayBuffer ? e.videoData : (e.videoData.buffer || e.videoData);
      const blob=new Blob([bytes],{type:e.videoType||"video/mp4"});
      activeVideoObjectUrl=URL.createObjectURL(blob);
      video.src=activeVideoObjectUrl;
      video.load();
      opened=true;
    }else if(e.videoBlob){
      try{
        activeVideoObjectUrl=URL.createObjectURL(e.videoBlob);
        video.src=activeVideoObjectUrl;
        video.load();
        opened=true;
      }catch(err){
        console.warn("Vídeo antigo em Blob não pôde ser aberto:",err);
      }
    }else if(source && kind==="mp4"){
      video.src=source;
      video.load();
      opened=true;
    }else if(source && kind==="youtube"){
      const embed=youtubeEmbedUrl(source);
      if(embed){frame.src=embed;frame.classList.remove("hide");video.classList.add("hide");opened=true;}
    }else if(source && kind==="gdrive"){
      const embed=googleDriveEmbedUrl(source);
      if(embed){frame.src=embed;frame.classList.remove("hide");video.classList.add("hide");opened=true;}
    }else if(source){
      video.src=source;
      video.load();
      opened=true;
    }

    if(opened && !video.classList.contains("hide")){
      const oldTracks=video.querySelectorAll("track");
      oldTracks.forEach(t=>t.remove());
      Object.entries(e.subtitles||{}).forEach(([lang,text])=>{
        const raw=String(text||"");
        const vtt=/^\s*WEBVTT/i.test(raw)
          ? raw
          : "WEBVTT\n\n"+raw.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g,"$1.$2");
        const blob=new Blob([vtt],{type:"text/vtt;charset=utf-8"});
        const url=URL.createObjectURL(blob);
        const track=document.createElement("track");
        track.kind="subtitles";
        track.label=lang;
        track.srclang=lang.slice(0,2).toLowerCase();
        track.src=url;
        track.default=lang.toUpperCase().startsWith("PT");
        video.appendChild(track);
      });
    }

    if(!opened && e.trailerUrl){
      const embed=youtubeEmbedUrl(e.trailerUrl)||e.trailerUrl;
      frame.src=embed;
      frame.classList.remove("hide");
      video.classList.add("hide");
      opened=true;
    }

    if(!opened){
      const hint=document.getElementById("playerHint");
      if(hint) hint.textContent="Este episódio não tem um URL MP4 público válido. No painel Admin, seleciona novamente o MP4 e guarda o episódio.";
      console.error("[Player] Episódio sem vídeo público válido",{id:e.id,title:e.title,videoUrl:e.videoUrl,videoStorage:e.videoStorage});
      alert("Este episódio não tem um vídeo público válido. Volta ao painel Admin, seleciona novamente o MP4 e guarda o episódio.");
      return;
    }

    $("fullPlayer").classList.add("active"); $("fullPlayer").setAttribute("aria-hidden","false");
    if(fullscreen)document.documentElement.requestFullscreen?.().catch(()=>{});
  }

  $("fullPlayerClose")?.addEventListener("click",()=>{
    $("fullPlayer").classList.remove("active"); $("fullPlayer").setAttribute("aria-hidden","true");
    $("megaVideo").pause();
    $("megaVideo").removeAttribute("src");
    $("megaFrame").src="about:blank";
    if(activeVideoObjectUrl){URL.revokeObjectURL(activeVideoObjectUrl);activeVideoObjectUrl=null;}
    document.exitFullscreen?.().catch(()=>{});
  });

  $("fullPlayer")?.addEventListener("click",e=>{
    if(e.target===$("fullPlayer")) $("fullPlayerClose")?.click();
  });

  $("megaVideo")?.addEventListener("timeupdate",async()=>{if(!currentPlayingEpisodeId||!u()||!$("megaVideo").duration)return;const pct=Math.min(99,Math.round($("megaVideo").currentTime/$("megaVideo").duration*100));u().progress=u().progress||{};u().progress[currentPlayingEpisodeId]=pct;await put("accounts",u());});

  async function renderEpisodeComments(id){
    const list=$("episodeCommentsList");
    if(!list)return;
    const countEl=$("episodeCommentsCount");
    const rows=forumComments
      .filter(c=>c.type==="episode"&&c.episodeId===id)
      .sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));

    if(countEl) countEl.textContent=rows.length;

    const avatarFor=(c)=>{
      const account=accounts.find(a=>a.username===c.author);
      return account?.photo
        ? `<img src="${esc(account.photo)}" alt="">`
        : esc((c.author||"X").slice(0,1).toUpperCase());
    };
    const ago=(ts)=>{
      const sec=Math.max(0,Math.floor((Date.now()-(ts||Date.now()))/1000));
      if(sec<60)return "agora";
      const min=Math.floor(sec/60);
      if(min<60)return `há ${min} min`;
      const h=Math.floor(min/60);
      if(h<24)return `há ${h} h`;
      const d=Math.floor(h/24);
      if(d<30)return `há ${d} dias`;
      const mo=Math.floor(d/30);
      if(mo<12)return `há ${mo} meses`;
      return `há ${Math.floor(mo/12)} ano${Math.floor(mo/12)>1?"s":""}`;
    };

    list.innerHTML=rows.map(c=>{
      const likes=Number(c.likes||0);
      return `<article class="kkComment" data-comment-id="${esc(c.id)}">
        <div class="kkCommentAvatar">${avatarFor(c)}</div>
        <div class="kkCommentMain">
          <div class="kkCommentHeader">
            <span class="kkCommentAuthor">${esc(c.author||"Utilizador")}</span>
            <span class="kkCommentTime">${ago(c.createdAt)}</span>
          </div>
          <div class="kkCommentBody">${esc(c.text||"")}</div>
          <div class="kkCommentActions">
            <button class="kkAction kkReactBtn" type="button" data-comment-like="${esc(c.id)}">
              <svg viewBox="0 0 24 24"><path d="M20 8c0 5-8 11-8 11S4 13 4 8a4 4 0 0 1 7-2 4 4 0 0 1 7 2Z"/></svg>
              <span>Gostar</span><span>${likes}</span>
            </button>
            <button class="kkAction kkReplyBtn" type="button" data-comment-reply="${esc(c.id)}">
              <svg viewBox="0 0 24 24"><path d="M20 11.5a7 7 0 0 1-7 7H8l-4 3v-5.2a7 7 0 1 1 16-4.8Z"/></svg>
              Responder
            </button>
            <button class="kkAction" type="button" data-comment-share="${esc(c.id)}">
              <svg viewBox="0 0 24 24"><path d="m15 8 5-5m0 0v4m0-4h-4"/><path d="M20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/></svg>
              Partilhar
            </button>
          </div>
        </div>
      </article>`;
    }).join("") || '<div class="kkEmpty">Ainda não há comentários neste episódio.</div>';

    list.querySelectorAll("[data-comment-like]").forEach(btn=>{
      btn.onclick=async()=>{
        const c=forumComments.find(x=>x.id===btn.dataset.commentLike);
        if(!c)return;
        c.likes=Number(c.likes||0)+1;
        await put("forumComments",c);
        forumComments=await getAll("forumComments");
        renderEpisodeComments(id);
      };
    });
    list.querySelectorAll("[data-comment-reply]").forEach(btn=>{
      btn.onclick=()=>{
        const input=$("episodeCommentInput");
        if(input){
          input.value=`@${btn.closest(".kkComment")?.querySelector(".kkCommentAuthor")?.textContent||""} `;
          input.focus();
          input.setSelectionRange(input.value.length,input.value.length);
        }
      };
    });
    list.querySelectorAll("[data-comment-share]").forEach(btn=>{
      btn.onclick=async()=>{
        const c=forumComments.find(x=>x.id===btn.dataset.commentShare);
        if(!c)return;
        const shareText=`${c.author}: ${c.text}`;
        try{
          if(navigator.share) await navigator.share({title:"Comentário",text:shareText});
          else await navigator.clipboard?.writeText(shareText);
        }catch(_){}
      };
    });
  }

  async function commentEpisodeMega(id){
    if(!u()){alert("Entra para comentar.");return}
    const input=$("episodeCommentInput");
    const text=(input?.value||"").trim();
    if(!text){alert("Escreve um comentário.");return}
    await put("forumComments",{id:makeId(),type:"episode",episodeId:id,author:u().username,text:text.slice(0,500),likes:0,createdAt:Date.now()});
    forumComments=await getAll("forumComments");
    if(input)input.value="";
    await xp(2,"comentar episódio");
    await renderEpisodeComments(id);
  }
  $("episodeCommentSend")?.addEventListener("click",()=>{if(currentPlayingEpisodeId)commentEpisodeMega(currentPlayingEpisodeId)});
  const commentInput=$("episodeCommentInput");
  const commentCounter=$("episodeCommentCounter");
  function updateCommentCounter(){
    if(commentCounter&&commentInput)commentCounter.textContent=`${commentInput.value.length}/500`;
  }
  commentInput?.addEventListener("input",updateCommentCounter);
  updateCommentCounter();

  document.querySelectorAll("[data-comment-tool]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      if(!commentInput)return;
      const tool=btn.dataset.commentTool;
      const start=commentInput.selectionStart||0;
      const end=commentInput.selectionEnd||start;
      const selected=commentInput.value.slice(start,end);
      const wraps={
        bold:["**","**"], italic:["*","*"], underline:["__","__"],
        strike:["~~","~~"], code:["`","`"], spoiler:["||","||"]
      };
      if(wraps[tool]){
        const [a,b]=wraps[tool];
        commentInput.setRangeText(a+selected+b,start,end,"select");
      }else if(tool==="time"){
        const v=$("megaVideo");
        const t=Number(v?.currentTime||0);
        const stamp=`[${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,"0")}]`;
        commentInput.setRangeText(stamp,start,end,"end");
      }else if(tool==="gif"){
        commentInput.setRangeText("[GIF] ",start,end,"end");
      }
      updateCommentCounter();
      commentInput.focus();
    });
  });

  $("episodeCommentsCollapse")?.addEventListener("click",()=>{
    const body=$("episodeCommentsBody");
    const btn=$("episodeCommentsCollapse");
    if(!body||!btn)return;
    const hidden=body.classList.toggle("hide");
    btn.classList.toggle("open",!hidden);
  });

  $("episodeCommentInput")?.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();if(currentPlayingEpisodeId)commentEpisodeMega(currentPlayingEpisodeId)}});
  function episodeAverageRating(id){const vals=accounts.map(a=>Number(a.ratings?.[id]||0)).filter(Boolean);return vals.length?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length*10)/10:0;}

  function renderMegaEpisodes(){const box=$("megaEpisodes");if(!box)return;const favs=episodes.filter(e=>(u()?.favorites||[]).includes(e.id));const watched=episodes.filter(e=>(u()?.watched||[]).includes(e.id));const cont=episodes.filter(e=>(u()?.progress?.[e.id]||0)>0&&(u()?.progress?.[e.id]||0)<100);box.innerHTML=`<div class="megaGrid"><div class="megaCard"><b>❤️ Favoritos</b><h2>${favs.length}</h2></div><div class="megaCard"><b>✅ Vistos</b><h2>${watched.length}</h2></div><div class="megaCard"><b>▶️ A continuar</b><h2>${cont.length}</h2></div></div><h3>▶️ Continuar a ver</h3>${cont.map(e=>`<div class="megaCard"><b>${esc(e.title)}</b><div class="progressBar"><div style="width:${u().progress[e.id]}%"></div></div><button class="btn primary" onclick="window.playMegaEpisode('${esc(e.id)}')">Continuar</button></div>`).join("")||'<p class="muted">Não tens episódios em progresso.</p>'}`;}
  window.playMegaEpisode=id=>{const e=episodes.find(x=>x.id===id);if(e)openEpisodePlayer(e,true)};

  function renderMegaPolls(){const box=$("megaPolls");if(!box)return;box.innerHTML=`<div class="notice">🗳️ O sistema de votações existente continua activo. Aqui podes acompanhar resultados, vencedora e estado.</div>`+polls.map(p=>{const votes=p.votes||{};const total=Object.keys(votes).length;const counts={};p.options.forEach(o=>counts[o]=0);Object.values(votes).forEach(o=>{if(counts[o]!=null)counts[o]++});const winner=p.options.slice().sort((a,b)=>counts[b]-counts[a])[0];const active=!p.closed&&(!p.endAt||Date.now()<p.endAt);return `<div class="megaCard"><h3>${esc(p.question)}</h3><p class="muted">👥 ${total} votos · ${active?"🟢 Aberta":"🔒 Fechada"}</p>${p.options.map(o=>`<div><div style="display:flex;justify-content:space-between"><span>${esc(o)}</span><b>${counts[o]||0}</b></div><div class="miniBar"><div style="width:${total?Math.round(counts[o]/total*100):0}%"></div></div></div>`).join("")}<p>🏆 Vencedora atual: <b>${esc(winner||"—")}</b></p></div>`}).join("")||'<p class="muted">Nenhuma votação.</p>';}

  function renderMegaAchievements(){const box=$("megaAchievements");if(!box)return;const xpNow=u()?.xp||0;const list=[
    ["🐱 Novo fã",!!u(),"Criar uma conta"],["🎬 Maratonista",(u()?.watched||[]).length>=10,"Ver 10 episódios"],["💜 Fã de Marinette",(u()?.favorites||[]).length>=10,"Favoritar 10 episódios"],["🗳️ Cidadão activo",Number(u()?.pollVotes||0)>=10,"Votar 10 vezes"],["💬 Falador",Number(u()?.messageCount||0)>=100,"Enviar 100 mensagens"],["👥 Social",friendAccounts().length>=10,"Adicionar 10 amigos"],["👑 Veterano",u()&&Date.now()-(u().createdAt||Date.now())>=30*864e5,"Estar registado há 30 dias"]
  ];box.innerHTML=list.map(x=>`<div class="megaCard"><h3>${x[0]} ${x[1]?"✅":"🔒"}</h3><p class="muted">${x[2]}</p></div>`).join("");}

  function renderGlobalSearch(){const input=$("globalSearchInput"),out=$("globalSearchResults");if(!input||!out)return;const q=input.value.trim().toLowerCase();if(!q){out.innerHTML='<p class="muted">Começa a escrever para pesquisar em todo o site.</p>';return;}const results=[];episodes.filter(e=>`${e.title} ${e.season} ${e.number} ${e.lang}`.toLowerCase().includes(q)).slice(0,10).forEach(e=>results.push(["🎬 Episódio",e.title,()=>openEpisodePlayer(e,false)]));accounts.filter(a=>a.username.toLowerCase().includes(q)).slice(0,10).forEach(a=>results.push(["👤 Utilizador",a.username,()=>window.openFriendProfile(a.username)]));forumPosts.filter(p=>`${p.title} ${p.text}`.toLowerCase().includes(q)).slice(0,10).forEach(p=>results.push(["🧵 Publicação",p.title,()=>showTab("community")]));F.wiki.filter(x=>x.join(" ").toLowerCase().includes(q)).forEach(x=>results.push(["🧩 Personagem/Wiki",x[0],()=>showTab("wiki")]));out.innerHTML=results.map((r,i)=>`<div class="searchResult" data-search="${i}"><b>${r[0]}</b> · ${esc(r[1])}</div>`).join("")||'<p class="muted">Nada encontrado.</p>';out.querySelectorAll("[data-search]").forEach((el,i)=>el.onclick=results[i][2]);}

  function renderCustom(){const box=$("megaCustom");if(!box)return;box.innerHTML=`<div class="megaGrid"><div class="megaCard"><h3>🌙 Aparência</h3><button class="btn" id="darkBtn">🌙 Dark mode</button> <button class="btn" id="lightBtn">☀️ Light mode</button></div><div class="megaCard"><h3>🐞 Tema</h3><button class="btn" id="ladybugBtn">🐞 Ladybug</button> <button class="btn" id="catBtn">🐈 Cat Noir</button></div><div class="megaCard"><h3>🎨 Perfil</h3><input id="themeColor" type="color" value="${esc(u()?.profileColor||"#e62b45")}"><p class="muted">Escolhe a cor do teu perfil.</p></div><div class="megaCard"><h3>🔒 Palavra-passe</h3><input id="newPasswordMega" type="password" placeholder="Nova palavra-passe"><button class="btn" id="savePasswordMega">Guardar</button></div></div><div class="megaCard" style="margin-top:12px"><h3>🖼️ Fundo personalizado</h3><input id="megaBgFile" type="file" accept="image/*"><button class="btn" id="saveMegaBg">Guardar fundo</button><button class="btn danger" id="removeMegaBg">Remover</button></div><div class="megaCard" style="margin-top:12px"><h3>✨ Animações</h3><label><input type="checkbox" id="animToggle" checked> Ativar animações</label></div>`;
    $("darkBtn").onclick=()=>document.body.classList.remove("lightMode");$("lightBtn").onclick=()=>document.body.classList.add("lightMode");$("ladybugBtn").onclick=()=>{document.documentElement.classList.remove("themeCat");document.documentElement.classList.add("themeLadybug")};$("catBtn").onclick=()=>{document.documentElement.classList.remove("themeLadybug");document.documentElement.classList.add("themeCat")};$("themeColor").onchange=async()=>{if(!u())return;u().profileColor=$("themeColor").value;await put("accounts",u());updateProfileUI();renderProfile()};$("saveMegaBg").onclick=async()=>{const f=$("megaBgFile").files[0];if(!f)return;const data=await fileToDataURL(f);await put("settings",{id:"megaCustomBackground",type:"image",data});settings.megaCustomBackground={id:"megaCustomBackground",type:"image",data};$("backgroundImage").src=data;$("backgroundImage").style.display="block";$("backgroundVideo").style.display="none"};$("removeMegaBg").onclick=async()=>{await remove("settings","megaCustomBackground");$("backgroundImage").style.display="none"};$("animToggle").onchange=e=>document.documentElement.style.setProperty("--mega-transition",e.target.checked?".18s":"0s");$("savePasswordMega").onclick=async()=>{const pw=$("newPasswordMega").value;if(!u()||pw.length<4){alert("Usa pelo menos 4 caracteres.");return}u().password=pw;await put("accounts",u());alert("🔒 Palavra-passe alterada.");$("newPasswordMega").value="";};}

  function renderCalendar(){const box=$("megaCalendar");if(!box)return;const rows=calendarItems.slice().sort((a,b)=>(a.startAt||0)-(b.startAt||0));box.innerHTML=rows.map(x=>`<div class="calendarCard"><b>📅 ${esc(x.startAt?new Date(x.startAt).toLocaleString("pt-PT"):x.date||"—")}</b><h3>${x.kind==="trailer"?"🎞️":x.kind==="noticia"?"📰":"🎬"} ${esc(x.title)}</h3></div>`).join("")||'<p class="muted">Sem datas adicionadas.</p>';}
  function renderNews(){const box=$("megaNews");if(!box)return;const now=Date.now();const rows=newsItems.filter(x=>!x.scheduledAt||x.scheduledAt<=now).slice().sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0)||(b.createdAt-a.createdAt));box.innerHTML=rows.map(x=>`<article class="newsCard">${x.cover?`<img src="${esc(x.cover)}" alt="" style="width:100%;max-height:260px;object-fit:cover;border-radius:10px;margin-bottom:10px">`:""}<h3>${x.pinned?"📌 ":"📰 "}${esc(x.title)}</h3><p>${esc(x.text)}</p><small class="muted">${new Date(x.createdAt).toLocaleDateString("pt-PT")}</small></article>`).join("")||'<p class="muted">Sem notícias.</p>';}
  function renderWiki(){const box=$("megaWiki");if(!box)return;box.innerHTML=wikiItems.map(x=>`<article class="wikiCard"><h3>🧩 ${esc(x.title)}</h3><p>${esc(x.text)}</p></article>`).join("");}
  function renderQuiz(){const box=$("megaQuiz");if(!box)return;if(!quizItems.length){box.innerHTML='<p class="muted">Sem perguntas.</p>';return}const q=quizItems[quizIndex%quizItems.length];box.innerHTML=`<div class="quizCard"><p class="muted">Pergunta ${quizIndex%quizItems.length+1}/${quizItems.length} · Pontos ${quizScore}</p><h3>🎭 ${esc(q.q)}</h3>${q.o.map((o,i)=>`<button class="btn" style="display:block;width:100%;margin:7px 0" data-answer="${i}">${esc(o)}</button>`).join("")}<div id="quizFeedback"></div></div>`;box.querySelectorAll("[data-answer]").forEach(b=>b.onclick=async()=>{const ok=Number(b.dataset.answer)===q.a;$("quizFeedback").innerHTML=ok?'<div class="notice success">✅ Certo! +25 XP</div>':'<div class="notice error">❌ Não foi desta vez.</div>';if(ok){quizScore++;await xp(25,"responder ao quiz")}setTimeout(()=>{quizIndex++;renderQuiz()},700)});}
  function renderRanking(){const box=$("megaRanking");if(!box)return;const rows=accounts.slice().sort((a,b)=>(b.xp||0)-(a.xp||0)).slice(0,20);box.innerHTML=rows.map((a,i)=>`<div class="rankRow"><b>${i===0?"🥇":i===1?"🥈":i===2?"🥉":(i+1)+"º"} ${esc(a.username)}</b><span>${a.xp||0} XP · Nível ${levelInfo(a.xp||0).level}</span></div>`).join("")||'<p class="muted">Ainda não há jogadores.</p>';}

  function renderAdminMega(){const box=$("megaAdmin"),tab=$("megaAdminTab");if(!box||!tab)return;if(!u()?.admin){tab.classList.add("hide");return}tab.classList.remove("hide");const openReports=reports.filter(r=>r.status==="open");box.innerHTML=`<div class="megaGrid"><div class="megaCard"><b>👥 Utilizadores</b><h2>${accounts.length}</h2></div><div class="megaCard"><b>🎬 Episódios</b><h2>${episodes.length}</h2><small class="muted">👀 ${episodes.reduce((n,e)=>n+Number(e.views||0),0)} visualizações</small></div><div class="megaCard"><b>📋 Logs</b><h2>${activityLogs.length}</h2></div></div><div class="megaCard"><h3>🛠️ Moderação</h3><p class="muted">Denúncias abertas: ${openReports.length}</p><div id="megaAdminUsers"></div></div><div class="megaCard"><h3>📢 Criar anúncio</h3><input id="megaAnnTitle" placeholder="Título"><textarea id="megaAnnText" placeholder="Texto"></textarea><button class="btn primary" id="megaAnnCreate">Publicar</button></div><div class="megaCard"><h3>👑 Papéis</h3><p class="muted">Podes definir utilizadores como moderadores ou administradores.</p></div>`;const list=$("megaAdminUsers");list.innerHTML=accounts.map(a=>`<div class="megaToolbar" style="border-bottom:1px solid var(--line);padding-bottom:7px"><b>${esc(a.username)}</b><span class="muted">${esc(a.role||"user")}</span><button class="btn" onclick="window.setRoleMega('${esc(a.username)}','moderator')">🛡️ Mod</button><button class="btn" onclick="window.setRoleMega('${esc(a.username)}','admin')">👑 Admin</button><button class="btn" onclick="window.muteMega('${esc(a.username)}')">🔇 ${a.mutedUntil&&a.mutedUntil>Date.now()?"Desmutar":"Mute"}</button><button class="btn danger" onclick="window.banMega('${esc(a.username)}')">${a.banned?"🔓 Desbanir":"🔨 Banir"}</button></div>`).join("");$("megaAnnCreate").onclick=async()=>{const title=$("megaAnnTitle").value.trim(),text=$("megaAnnText").value.trim();if(!title||!text)return;await put("announcements",{id:makeId(),title,text,label:"NOVIDADE",color:"#e62b45",createdAt:Date.now()});announcements=await getAll("announcements");renderAnnouncements();await notifyAllUsers("📢 Novo anúncio!",title);$("megaAnnTitle").value="";$("megaAnnText").value="";};}
  window.setRoleMega=async(name,role)=>{if(!u()?.admin)return;const a=accounts.find(x=>normalizeUsername(x.username)===normalizeUsername(name));if(!a)return;a.role=role;a.admin=role==="admin";await put("accounts",a);accounts=await getAll("accounts");await log("role_change",`${name} -> ${role}`);renderAdminMega();};
  window.banMega=async name=>{if(!u()?.admin)return;const a=accounts.find(x=>normalizeUsername(x.username)===normalizeUsername(name));if(!a)return;a.banned=!a.banned;await put("accounts",a);await notify(name,a.banned?"🔨 Conta banida":"🔓 Conta desbanida",a.banned?"A tua conta foi banida por um administrador.":"A tua conta foi desbanida.","moderation");accounts=await getAll("accounts");renderAdminMega();};
  window.muteMega=async name=>{if(!u()?.admin)return;const a=accounts.find(x=>normalizeUsername(x.username)===normalizeUsername(name));if(!a)return;a.mutedUntil=a.mutedUntil&&a.mutedUntil>Date.now()?0:Date.now()+60*60*1000;await put("accounts",a);await notify(name,a.mutedUntil?"🔇 Foste silenciado":"🔊 Silenciamento removido",a.mutedUntil?"Não podes enviar mensagens durante 1 hora.":"Podes voltar a enviar mensagens.","moderation");accounts=await getAll("accounts");renderAdminMega();};
  async function notifyAllUsers(title,text){for(const a of accounts)if(normalizeUsername(a.username)!==uname())await notify(a.username,title,text,"announcement");}

  function renderMegaAll(){renderProfile();renderNotifs();renderMegaFriends();renderCommunityMega();renderMegaEpisodes();renderMegaPolls();renderMegaAchievements();renderGlobalSearch();renderCustom();renderCalendar();renderNews();renderWiki();renderQuiz();renderRanking();renderAdminMega();updateNotifBadges();if(window.adminRefreshAdvancedLists)window.adminRefreshAdvancedLists();}

  let swipeX=0;
  $("fullPlayer")?.addEventListener("touchstart",e=>{swipeX=e.changedTouches[0].clientX},{passive:true});
  $("fullPlayer")?.addEventListener("touchend",e=>{const dx=e.changedTouches[0].clientX-swipeX;if(Math.abs(dx)<80||!currentPlayingEpisodeId)return;const idx=episodes.findIndex(x=>x.id===currentPlayingEpisodeId);const next=episodes[idx+(dx<0?1:-1)];if(next)openEpisodePlayer(next,true)},{passive:true});

  // Global hooks
  document.querySelectorAll("#featureTabs [data-tab]").forEach(b=>b.addEventListener("click",()=>showTab(b.dataset.tab)));
  $("sideMenuButton")?.addEventListener("click",()=>$("sideDrawer").classList.toggle("hide"));
  document.querySelectorAll("[data-side]").forEach(b=>b.addEventListener("click",()=>{const x=b.dataset.side;$("sideDrawer").classList.add("hide");if(x==="mega")openHub("profile");else openSocialSection(x);}));
  $("openMegaHub")?.addEventListener("click",()=>openHub("profile"));$("megaClose")?.addEventListener("click",()=>$("megaModal").classList.add("hide"));$("editProfileClose")?.addEventListener("click",()=>$("editProfileModal").classList.add("hide"));$("saveProfileMega")?.addEventListener("click",saveProfile);
  $("notificationsQuickButton")?.addEventListener("click",()=>openHub("notifications"));$("globalSearchQuickButton")?.addEventListener("click",()=>openHub("search"));
  $("globalSearchInput")?.addEventListener("input",renderGlobalSearch);
  document.querySelectorAll("[data-bottom]").forEach(b=>b.addEventListener("click",()=>{const x=b.dataset.bottom;if(x==="home")window.scrollTo({top:0,behavior:"smooth"});else if(x==="episodes")openSocialSection("catalogo");else if(x==="friends")openHub("friends");else if(x==="community")openSocialSection("chat");else if(x==="profile")openHub("profile")}));
  $("profileButton")?.addEventListener("dblclick",()=>openHub("profile"));

  // update last seen while the page is open; this is local/client-side presence.
  setInterval(async()=>{if(u()&&ready()){u().lastSeen=Date.now();await put("accounts",u());accounts=await getAll("accounts");}if(ready()){polls=await getAll("polls");for(const p of polls){if(p.startAt&&Date.now()>=p.startAt&&!p.startNotified){p.startNotified=true;await put("polls",p);await notifyAllUsers("🗳️ Nova votação!",p.question);}}calendarItems=await getAll("calendar");for(const c of calendarItems){if(c.notify&&c.startAt&&Date.now()>=c.startAt&&!c.startNotified){c.startNotified=true;await put("calendar",c);await notifyAllUsers("📅 Nova estreia!",c.title);}}}},60000);

  // decorate after the existing app renders.
  const originalRender=window.render;
  if(typeof originalRender==="function"){
    window.render=originalRender;
  }
  const observer=new MutationObserver(()=>{if(document.querySelector("[data-episode-id]"))decorateEpisodeCards();});
  observer.observe(document.body,{childList:true,subtree:true});

  // Seed once DB is ready and refresh advanced panels.
  (async()=>{for(let i=0;i<50&&!ready();i++)await new Promise(r=>setTimeout(r,100));if(!ready())return;await seedAdvanced();renderMegaAll();})().catch(console.error);

  // Expose a simple global API for the existing site.
  async function logActivityCompat(action,detail){try{if(typeof log==="function")await log(action,detail)}catch(e){}}
  window.logActivityCompat=logActivityCompat;
  window.adminRefreshAdvancedLists=adminRefreshAdvancedLists;
  window.miraculousMega={openHub,showTab,renderMegaAll,xp,notify,notifyAllUsers,log:logActivityCompat};
})();

  $("checkVideoStorage")?.addEventListener("click",async()=>{
    const el=$("videoStorageInfo");
    try{const x=await getOPFSUsage();if(!x){el.textContent="OPFS não disponível neste navegador.";return}el.textContent=`Uso: ${formatBytes(x.usage)} / quota: ${formatBytes(x.quota)}`;}catch(e){el.textContent="Não foi possível consultar o armazenamento.";console.error(e);}});



window.addEventListener("online",()=>{try{if(typeof refreshAccounts==="function")refreshAccounts()}catch(_){}});





  const SUPABASE_URL = "https://gfnpyzmhhwkpzvjwkckg.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_CGhjWdOcexqk0ac_WyYfOg_3jif0Bwz";

  const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );

  // Disponível para o resto do site.
  window.supabaseClient = supabaseClient;
  window.SUPABASE_URL = SUPABASE_URL;

  console.log("[Supabase] Cliente inicializado.");



(function(){
"use strict";

const $m=id=>document.getElementById(id);
const safe=(v)=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));

function toast(title,message="",type="info"){
  document.querySelectorAll(".mkk-toast").forEach(x=>x.remove());
  const el=document.createElement("div");
  el.className="mkk-toast "+type;
  el.innerHTML='<div class="toast-title">'+safe(title)+'</div>'+safe(message);
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),4200);
}
window.mkkToast=toast;

function addRipple(e){
  const b=e.currentTarget;
  if(!b || b.dataset.noRipple==="1") return;
  const r=document.createElement("span"); r.className="ui-ripple";
  const rect=b.getBoundingClientRect();
  r.style.left=(e.clientX-rect.left)+"px";
  r.style.top=(e.clientY-rect.top)+"px";
  b.appendChild(r); setTimeout(()=>r.remove(),600);
}
document.addEventListener("click",e=>{
  const b=e.target.closest("button,.btn,[role=button]");
  if(b) addRipple({currentTarget:b,clientX:e.clientX,clientY:e.clientY});
});

function getEpisodes(){
  try{
    if(Array.isArray(window.episodes)) return window.episodes;
    return Array.isArray(episodes)?episodes:[];
  }catch(_){return []}
}
function getAccounts(){
  try{
    if(Array.isArray(window.accounts)) return window.accounts;
    return Array.isArray(accounts)?accounts:[];
  }catch(_){return []}
}

function buildStats(){
  const host=document.querySelector("main")||document.body;
  if(document.getElementById("mkkStats")) return;
  const eps=getEpisodes(), acc=getAccounts();
  const box=document.createElement("div");
  box.id="mkkStats"; box.className="mkk-stats page-enter";
  const watched=acc.reduce((n,a)=>n+(Array.isArray(a.watched)?a.watched.length:0),0);
  box.innerHTML=[
    ["🎬",eps.length,"Episódios"],
    ["👥",acc.length,"Contas"],
    ["👀",watched,"Visualizações marcadas"],
    ["✨","V2","Interface"]
  ].map((x,i)=>`<div class="mkk-stat" style="animation-delay:${i*55}ms">
    <div>${x[0]}</div><div class="num">${safe(x[1])}</div><div class="label">${x[2]}</div>
  </div>`).join("");
  const target=host.querySelector("section")||host.firstElementChild;
  if(target) target.parentNode.insertBefore(box,target);
}

function updateOnline(){
  let el=document.getElementById("mkkOnline");
  if(!el){
    el=document.createElement("span"); el.id="mkkOnline"; el.className="mkk-chip";
    const anchor=document.querySelector("header")||document.body;
    anchor.appendChild(el);
  }
  const online=navigator.onLine;
  el.className="mkk-chip "+(online?"online":"offline");
  el.textContent=online?"● Online":"● Offline";
}
window.addEventListener("online",()=>{updateOnline();toast("Ligação restaurada","O navegador está online.","success")});
window.addEventListener("offline",()=>{updateOnline();toast("Sem internet","Algumas funções online podem não funcionar.","error")});

const actions=[
  {id:"home",icon:"🏠",title:"Ir para o início",run:()=>window.scrollTo({top:0,behavior:"smooth"})},
  {id:"search",icon:"🔎",title:"Pesquisar episódios",run:()=>document.querySelector('input[type="search"],#search')?.focus()},
  {id:"top",icon:"↑",title:"Voltar ao topo",run:()=>window.scrollTo({top:0,behavior:"smooth"})},
  {id:"console",icon:"🖥️",title:"Abrir console do site",run:()=>document.querySelector("#consoleBtn,#openConsole,[onclick*='console']")?.click()},
  {id:"admin",icon:"⚙️",title:"Abrir painel Admin",run:()=>document.querySelector("#adminBtn,[onclick*='admin']")?.click()},
  {id:"refresh",icon:"↻",title:"Atualizar dados",run:()=>location.reload()},
];
function openCommand(){
  const modal=$m("mkkCommand"), input=$m("mkkCommandInput");
  modal.classList.remove("mkk-hidden"); modal.setAttribute("aria-hidden","false");
  input.value=""; renderCommands(""); setTimeout(()=>input.focus(),30);
}
function closeCommand(){
  const modal=$m("mkkCommand"); modal.classList.add("mkk-hidden"); modal.setAttribute("aria-hidden","true");
}
function renderCommands(q){
  const list=$m("mkkCommandList"); if(!list)return;
  const eps=getEpisodes();
  const ql=q.trim().toLowerCase();
  let rows=actions.filter(a=>!ql||a.title.toLowerCase().includes(ql));
  const matches=eps.filter(e=>ql && JSON.stringify(e).toLowerCase().includes(ql)).slice(0,12);
  list.innerHTML=rows.map((a,i)=>`<div class="mkk-command-item" data-action="${a.id}">
    <span>${a.icon}</span><span>${safe(a.title)}</span><span class="mkk-command-key">${i<9?i+1:""}</span>
  </div>`).join("");
  if(matches.length){
    list.innerHTML+=`<div style="padding:9px 13px;color:var(--muted);font-size:12px">EPISÓDIOS ENCONTRADOS</div>`;
    matches.forEach((e,i)=>list.innerHTML+=`<div class="mkk-command-item" data-episode="${safe(e.id)}">
      <span>🎬</span><span>${safe(e.title||"Episódio")}</span>
    </div>`);
  }
}
$m("mkkCommandBtn")?.addEventListener("click",openCommand);
$m("mkkTopBtn")?.addEventListener("click",()=>window.scrollTo({top:0,behavior:"smooth"}));
$m("mkkCommandInput")?.addEventListener("input",e=>renderCommands(e.target.value));
$m("mkkCommand")?.addEventListener("click",e=>{
  if(e.target.id==="mkkCommand") closeCommand();
  const item=e.target.closest(".mkk-command-item"); if(!item)return;
  const action=actions.find(a=>a.id===item.dataset.action);
  if(action){closeCommand();try{action.run()}catch(err){console.error(err);toast("Ação indisponível",err.message,"error")}}
  if(item.dataset.episode){
    closeCommand();
    const target=document.querySelector(`[data-id="${CSS.escape(item.dataset.episode)}"]`);
    target?.scrollIntoView({behavior:"smooth",block:"center"});
  }
});
document.addEventListener("keydown",e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();openCommand()}
  if(e.key==="Escape")closeCommand();
});

function decorateCards(){
  document.querySelectorAll(".card,.episode,.item").forEach((el,i)=>{
    el.classList.add("stagger-item");
    el.style.animationDelay=Math.min(i*25,300)+"ms";
  });
}
const observer=new MutationObserver(()=>{decorateCards()});
observer.observe(document.body,{childList:true,subtree:true});

function installReleasePanel(){
  if(document.getElementById("mkkUpdates"))return;
  const host=document.querySelector("main")||document.body;
  const panel=document.createElement("div");
  panel.id="mkkUpdates"; panel.className="mkk-update page-enter";
  panel.innerHTML=`<b>✨ miraculous.kk V2</b>
  <div class="muted">Interface renovada, animações, pesquisa rápida, indicador online,
  atalhos de teclado e melhorias no painel de episódios.</div>
  <div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:9px">
    <span class="mkk-chip">🎬 MP4</span><span class="mkk-chip">⚡ Animações</span>
    <span class="mkk-chip">⌕ Ctrl+K</span><span class="mkk-chip">🖥️ Console</span>
  </div>`;
  const stats=document.getElementById("mkkStats");
  if(stats) stats.after(panel); else host.prepend(panel);
}

window.addEventListener("load",()=>{
  updateOnline();
  setTimeout(()=>{buildStats();installReleasePanel();decorateCards()},250);
});
})();

/* =========================
   PLAYER ROBUSTNESS PATCH
   - garante metadata/duração depois de trocar a fonte
   - evita ficar preso visualmente em 0:00
   - mostra diagnóstico útil em Android
========================= */
(function(){
  const v=document.getElementById("megaVideo");
  if(!v)return;
  v.preload="auto";
  v.removeAttribute("crossorigin");

  let metadataTimer=null;
  function startMetadataWatch(){
    clearTimeout(metadataTimer);
    metadataTimer=setTimeout(()=>{
      if(v.src && (!Number.isFinite(v.duration)||v.duration<=0)) {
        const h=document.getElementById("playerHint");
        if(h) h.textContent="O vídeo foi aberto, mas a duração ainda não foi recebida. Se continuar em 0:00, o MP4 pode ter o índice (moov atom) no fim ou um codec não compatível com este navegador.";
        console.warn("[Player] Metadata não carregou",{src:v.currentSrc,readyState:v.readyState,networkState:v.networkState});
      }
    },15000);
  }
  v.addEventListener("loadstart",startMetadataWatch);
  v.addEventListener("loadedmetadata",()=>{
    clearTimeout(metadataTimer);
    console.log("[Player] Metadata carregada",{duration:v.duration,width:v.videoWidth,height:v.videoHeight});
  });
  v.addEventListener("durationchange",()=>{
    if(Number.isFinite(v.duration)&&v.duration>0) clearTimeout(metadataTimer);
  });
  v.addEventListener("emptied",()=>clearTimeout(metadataTimer));
})();

/* =========================
   NEMESIS CUSTOM VIDEO PLAYER
========================= */
(function(){
  const v=document.getElementById("megaVideo");
  const viewport=document.getElementById("nmViewport");
  const play=document.getElementById("nmPlay");
  const mute=document.getElementById("nmMute");
  const progress=document.getElementById("nmProgress");
  const time=document.getElementById("nmTime");
  const settings=document.getElementById("nmSettings");
  const menu=document.getElementById("nmMenu");
  const full=document.getElementById("nmFull");
  const pip=document.getElementById("nmPip");
  const shot=document.getElementById("nmShot");
  const controls=document.getElementById("nmControls");
  if(!v||!viewport||!play)return;

  const ICONS={
    play:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z" fill="currentColor" stroke="none"/></svg>',
    pause:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" stroke="none"/></svg>',
    volume:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 9.5a4 4 0 010 5M18.5 7a7.5 7.5 0 010 10"/></svg>',
    muted:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M18 9l-5 6M13 9l5 6"/></svg>',
    settings:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8a4 4 0 100 8 4 4 0 000-8z"/><path d="M4.9 15.2l-1.4 1.4 3 3 1.4-1.4M15.2 19.1l1.4 1.4 3-3-1.4-1.4M19.1 8.8l1.4-1.4-3-3-1.4 1.4M8.8 4.9L7.4 3.5l-3 3 1.4 1.4M8 12H3M21 12h-5M12 8V3M12 21v-5"/></svg>',
    pip:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M13 13h6v4h-6z" fill="currentColor" stroke="none"/></svg>',
    fullscreen:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5"/></svg>',
    camera:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h4l1.5-2h5L16 8h4v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>'
  };
  document.querySelectorAll("[data-icon]").forEach(el=>{const key=el.dataset.icon;if(ICONS[key])el.innerHTML=ICONS[key]});

  const progressFill=progress.querySelector(".nmProgressFill");
  const progressKnob=progress.querySelector(".nmProgressKnob");
  const fmt=s=>Number.isFinite(s)?Math.floor(s/60)+":"+String(Math.floor(s%60)).padStart(2,"0"):"0:00";
  function icon(name){return ICONS[name]||""}
  function setBusy(b){
    play.classList.toggle("is-loading",!!b);
    play.disabled=!!b;
  }
  function update(){
    play.querySelector(".nmIcon").innerHTML=icon(v.paused?"play":"pause");
    mute.querySelector(".nmIcon").innerHTML=icon((v.muted||v.volume===0)?"muted":"volume");
    const pct=(Number.isFinite(v.duration)&&v.duration>0)?Math.max(0,Math.min(100,v.currentTime/v.duration*100)):0;
    if(progressFill)progressFill.style.width=pct+"%";
    if(progressKnob)progressKnob.style.left=pct+"%";
    progress.setAttribute("aria-valuenow",String(Math.round(pct*10)));
    time.textContent=fmt(v.currentTime)+" / "+fmt(v.duration);
  }
  function seekFromEvent(e){
    if(!Number.isFinite(v.duration)||v.duration<=0)return;
    const r=progress.getBoundingClientRect();
    const x=Math.max(0,Math.min(r.width,(e.clientX||0)-r.left));
    v.currentTime=(x/r.width)*v.duration;
    update();showControls();
  }
  let draggingProgress=false;
  progress.addEventListener("pointerdown",e=>{draggingProgress=true;progress.setPointerCapture?.(e.pointerId);seekFromEvent(e);e.preventDefault();showControls()});
  progress.addEventListener("pointermove",e=>{if(draggingProgress)seekFromEvent(e)});
  progress.addEventListener("pointerup",()=>{draggingProgress=false;showControls()});
  progress.addEventListener("keydown",e=>{
    if(e.key==="ArrowLeft"){v.currentTime=Math.max(0,v.currentTime-5);e.preventDefault()}
    if(e.key==="ArrowRight"){v.currentTime=Math.min(v.duration||0,v.currentTime+5);e.preventDefault()}
    if(e.key==="Home"){v.currentTime=0;e.preventDefault()}
    if(e.key==="End"&&Number.isFinite(v.duration)){v.currentTime=v.duration;e.preventDefault()}
    update();
  });
  function showControls(){
    controls.classList.add("forceShow");
    clearTimeout(showControls.t);
    showControls.t=setTimeout(()=>controls.classList.remove("forceShow"),2500);
  }

  play.addEventListener("click",async()=>{
    try{
      if(v.paused){
        setBusy(true);
        await v.play();
      }else v.pause();
    }catch(err){
      const h=document.getElementById("playerHint");
      if(h)h.textContent="Não foi possível iniciar o vídeo. Verifica o formato H.264/AAC do MP4.";
      console.warn("Play falhou",err);
    }finally{setBusy(false);update();showControls();}
  });
  mute.addEventListener("click",()=>{v.muted=!v.muted;update();showControls()});
  settings.addEventListener("click",e=>{e.stopPropagation();menu.classList.toggle("open");showControls()});
  menu.addEventListener("click",e=>e.stopPropagation());
  document.addEventListener("click",()=>menu.classList.remove("open"));
  document.querySelectorAll("[data-nm-speed]").forEach(b=>b.addEventListener("click",()=>{
    v.playbackRate=Number(b.dataset.nmSpeed);menu.classList.remove("open");showControls();
  }));
  full.addEventListener("click",()=>{
    const target=document.getElementById("fullPlayer");
    if(document.fullscreenElement) document.exitFullscreen?.();
    else (target.requestFullscreen?.()||viewport.requestFullscreen?.())?.catch?.(()=>{});
    showControls();
  });
  pip.addEventListener("click",async()=>{
    try{
      if(document.pictureInPictureElement) await document.exitPictureInPicture();
      else if(document.pictureInPictureEnabled && !v.disablePictureInPicture) await v.requestPictureInPicture();
    }catch(e){ console.warn("PiP indisponível",e); }
    showControls();
  });
  shot.addEventListener("click",()=>{
    if(!v.videoWidth||!v.videoHeight)return;
    try{
      const c=document.createElement("canvas");c.width=v.videoWidth;c.height=v.videoHeight;
      c.getContext("2d").drawImage(v,0,0,c.width,c.height);
      c.toBlob(b=>{
        if(!b)return;
        const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download="miraculous-captura.jpg";
        a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
      },"image/jpeg",.92);
    }catch(e){console.warn("Captura indisponível",e)}
    menu.classList.remove("open");showControls();
  });
  viewport.addEventListener("mousemove",showControls,{passive:true});
  viewport.addEventListener("touchstart",showControls,{passive:true});
  ["loadedmetadata","durationchange","timeupdate","play","pause","volumechange","ratechange","progress","canplay"].forEach(ev=>v.addEventListener(ev,update));
  v.addEventListener("loadstart",()=>setBusy(true));
  v.addEventListener("canplay",()=>setBusy(false));
  v.addEventListener("waiting",()=>setBusy(true));
  v.addEventListener("playing",()=>setBusy(false));
  v.addEventListener("error",()=>{
    setBusy(false);
    const err=v.error;
    let msg="Não foi possível reproduzir este vídeo.";
    if(err?.code===3) msg="O vídeo foi encontrado, mas o navegador não conseguiu descodificar o MP4. Usa H.264 (AVC) + AAC.";
    else if(err?.code===4) msg="O formato/codec deste MP4 não é suportado pelo navegador. Para máxima compatibilidade, usa H.264 + AAC.";
    else if(err?.code===2) msg="Não foi possível carregar o vídeo pela rede. Tenta novamente.";
    const h=document.getElementById("playerHint");if(h)h.textContent=msg;
    console.error("Erro de vídeo",{code:err?.code,message:err?.message,src:v.currentSrc,networkState:v.networkState,readyState:v.readyState});
    update();
  });
  document.addEventListener("keydown",e=>{
    const fp=document.getElementById("fullPlayer");
    if(!fp?.classList.contains("active")||e.target.matches("input,textarea"))return;
    if(e.code==="Space"){e.preventDefault();play.click()}
    if(e.key.toLowerCase()==="m")mute.click();
    if(e.key==="ArrowLeft")v.currentTime=Math.max(0,v.currentTime-10);
    if(e.key==="ArrowRight")v.currentTime=Math.min(v.duration||Infinity,v.currentTime+10);
  });
  update();
})();
