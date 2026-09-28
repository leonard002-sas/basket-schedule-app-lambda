const SCORE_API = "https://7yxh3p2c5swyx6ajv45ldmiswe0tirop.lambda-url.ap-northeast-1.on.aws/";
const token = localStorage.getItem("id_token");
const qs = new URLSearchParams(location.search);
const seasonYear = new Date().getFullYear();
let team = null;
let players = [];
let games = [];
let currentGame = null;
let leaderboardRows = [];
let clockInterval = null;
let clockPauseSent = false;
let toastTimer = null;

function claims() { try { return JSON.parse(atob(token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/"))); } catch { return null; } }
function isAdmin() { return (claims()?.["cognito:groups"] || []).includes("admins"); }
function api(resource, method="GET", body=null, extra={}) {
    const params = new URLSearchParams({feature:"basketball",resource,...extra});
    return fetch(`${SCORE_API}?${params}`, {method,headers:{Authorization:`Bearer ${token}`,...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined})
        .then(async r=>{ const d=await r.json(); if(!r.ok) throw new Error(d.message||`APIエラー ${r.status}`); return d; });
}
function toast(message) { const el=document.getElementById("scorebookToast");el.textContent=message;el.classList.add("is-visible");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("is-visible"),2500); }
function playerId(item) { return item.playerId || String(item.sk||"").replace(/^PLAYER#/,""); }
function nameFor(id) { return players.find(p=>p.playerId===id)?.name || "選手"; }
function statRows(data) { return data?.items || []; }
function ratio(a,b) { return b ? `${(a/b*100).toFixed(1)}%` : "—"; }
function eff(s) { return (s.points||0)+(s.REB||0)+(s.AST||0)+(s.STL||0)+(s.BLK||0)-((s.FGA||0)-(s.FGM||0))-((s.FTA||0)-(s.FTM||0))-(s.TO||0); }

async function loadEverything() {
    const results=await Promise.all([api("team"),api("players"),api("games"),api("leaderboard","GET",null,{season:String(seasonYear)})]);
    team=results[0]; players=statRows(results[1]).map(p=>({...p,playerId:playerId(p)})).filter(p=>p.active!==false);
    games=statRows(results[2]).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    document.getElementById("teamName").value=team.name||"";
    document.getElementById("liveTeamName").textContent=team.name||"チーム";
    renderRoster();renderGames();renderLeaderboard(statRows(results[3]));
    if(!team.name) document.getElementById("teamStatus").textContent="まずチーム名を保存してください。";
}

function renderRoster() {
    document.getElementById("rosterList").innerHTML=players.length?players.map(p=>`<span class="roster-chip"><strong>#${Number(p.number)||"—"}</strong>${escapeHtml(p.name)}${Number(p.age)?` · ${Number(p.age)}歳`:""}</span>`).join(""):"<span class='field-hint'>選手はまだ登録されていません。</span>";
    const options=players.map(p=>`<option value="${escapeAttr(p.playerId)}">#${Number(p.number)||"—"} ${escapeHtml(p.name)}</option>`).join("");
    const picker=document.getElementById("activePlayer");const selected=picker.value;picker.innerHTML=options||"<option value=''>先に選手を登録してください</option>";if(players.some(p=>p.playerId===selected))picker.value=selected;
    document.getElementById("lineupChoices").innerHTML=players.map(p=>`<label class="lineup-choice"><input type="checkbox" value="${escapeAttr(p.playerId)}"> #${Number(p.number)||"—"} ${escapeHtml(p.name)}</label>`).join("")||"<span class='field-hint'>先に選手を登録してください。</span>";
}

function renderGames() {
    const box=document.getElementById("gamesList");
    if(!games.length){box.innerHTML="<div class='empty-state'>試合はまだありません。</div>";return;}
    box.innerHTML=games.map(g=>{const done=g.status==="FINAL",admin=isAdmin();return `<div class="game-item"><div><strong>${escapeHtml(g.date||"")} · ${escapeHtml(team.name||"チーム")} vs ${escapeHtml(g.opponent||"相手")}</strong><span>${done?`${g.teamScore||0} - ${g.opponentScore||0} · ${g.result||""}`:g.status==="LIVE"?"記録中":"未開始"}</span></div>${done||admin?`<button type="button" data-open-game="${escapeAttr(g.gameId)}" class="${done?"button-light":"button-accent"}">${done?"結果を見る":g.status==="LIVE"?"記録を再開":"記録開始"}</button>`:"<span>試合前</span>"}</div>`;}).join("");
    box.querySelectorAll("[data-open-game]").forEach(b=>b.addEventListener("click",()=>openGame(b.dataset.openGame)));
}

function renderLeaderboard(rows) {
    const body=document.getElementById("leaderboardBody");
    leaderboardRows=rows;
    const metric=document.getElementById("rankingMetric")?.value||"points";
    const value=s=>metric==="EFF"?eff(s):Number(s[metric])||0;
    const sorted=[...rows].sort((a,b)=>value(b)-value(a));
    body.innerHTML=sorted.map(s=>{const id=playerId(s),p=players.find(x=>x.playerId===id)||{},fga=Number(s.FGA)||0,fgm=Number(s.FGM)||0,twoa=Number(s["2PA"])||0,twom=Number(s["2PM"])||0,threea=Number(s["3PA"])||0,threem=Number(s["3PM"])||0,fta=Number(s.FTA)||0,ftm=Number(s.FTM)||0;return `<tr><td><b>${escapeHtml(nameFor(id))}</b></td><td>${Number(p.age)||"—"}</td><td>${Number(s.GP)||0}</td><td>${Number(s.W)||0}-${Number(s.L)||0}-${Number(s.D)||0}</td><td>${Math.floor((Number(s.minutesSeconds)||0)/60)}</td><td>${Number(s.points)||0}</td><td>${Number(s.REB)||0}</td><td>${Number(s.AST)||0}</td><td>${Number(s.STL)||0}</td><td>${Number(s.BLK)||0}</td><td>${fgm}/${fga}</td><td>${ratio(fgm,fga)}</td><td>${twom}/${twoa}</td><td>${ratio(twom,twoa)}</td><td>${threem}/${threea}</td><td>${ratio(threem,threea)}</td><td>${ftm}/${fta}</td><td>${ratio(ftm,fta)}</td><td>${Number(s.OREB)||0}</td><td>${Number(s.DREB)||0}</td><td>${Number(s.TO)||0}</td><td>${Number(s.PF)||0}</td><td>${eff(s)}</td></tr>`;}).join("");
    document.getElementById("leaderboardEmpty").hidden=sorted.length>0;
}

function escapeHtml(v) { return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function escapeAttr(v) { return escapeHtml(v); }

async function openGame(id) {
    try {
        currentGame=await api("game","GET",null,{gameId:id});
        document.getElementById("scorekeeperCard").hidden=false;
        const admin=isAdmin();
        ["clockToggle","nextPeriod","saveLineup","undoAction","finishGame","finalOpponentScore"].forEach(key=>{const el=document.getElementById(key);if(el)el.closest(".clock-controls,.lineup-panel,.scorekeeper-bottom")?.classList.toggle("viewer-hidden",!admin);});
        document.querySelector(".stat-entry").classList.toggle("viewer-hidden",!admin);
        document.getElementById("lineupChoices").classList.toggle("viewer-hidden",!admin);
        document.getElementById("liveGameTitle").textContent=`${currentGame.date} · vs ${currentGame.opponent}`;
        document.getElementById("liveTeamName").textContent=team.name||"チーム";
        document.getElementById("liveOpponent").textContent=currentGame.opponent||"相手";
        document.getElementById("finalOpponentScore").value=Number(currentGame.opponentScore)||0;
        renderRoster();
        const onCourt=Array.isArray(currentGame.onCourt)?currentGame.onCourt:String(currentGame.onCourt||"").split(",").filter(Boolean);
        currentGame.onCourt=onCourt;
        document.querySelectorAll("#lineupChoices input").forEach(i=>i.checked=onCourt.includes(i.value));
        drawGame();
        document.getElementById("scorekeeperCard").scrollIntoView({behavior:"smooth",block:"start"});
    } catch(e) { toast(e.message); }
}

function remainingNow() { const base=Number(currentGame?.remainingSeconds)||0; return currentGame?.clockRunning?Math.max(0,base-(Math.floor(Date.now()/1000)-(Number(currentGame.clockStartedAt)||Math.floor(Date.now()/1000)))):base; }
function drawGame() {
    if(!currentGame)return;
    const sec=remainingNow(); document.getElementById("liveClock").textContent=`${Math.floor(sec/60)}:${String(sec%60).padStart(2,"0")}`;
    document.getElementById("livePeriod").textContent=`${Number(currentGame.period)||1}Q`;
    document.getElementById("liveTeamScore").textContent=Number(currentGame.teamScore)||0;
    document.getElementById("liveOpponentScore").textContent=Number(currentGame.opponentScore)||0;
    document.getElementById("clockToggle").textContent=currentGame.clockRunning?"一時停止":"開始";
    document.getElementById("clockToggle").disabled=currentGame.status==="FINAL";
    document.getElementById("nextPeriod").disabled=currentGame.status==="FINAL";
    const events=statRows(currentGame.events).slice(-5).reverse();
    document.getElementById("recentActions").innerHTML=events.map(e=>`<span class="recent-action">${escapeHtml(nameFor(e.playerId))} · ${escapeHtml(statLabel(e.type))}</span>`).join("");
    const gameRows=statRows(currentGame.players).sort((a,b)=>(Number(b.points)||0)-(Number(a.points)||0));
    document.getElementById("gameBoxscoreBody").innerHTML=gameRows.map(s=>{const id=playerId(s),p=players.find(x=>x.playerId===id)||{},fga=Number(s.FGA)||0,fgm=Number(s.FGM)||0,twoa=Number(s["2PA"])||0,twom=Number(s["2PM"])||0,threea=Number(s["3PA"])||0,threem=Number(s["3PM"])||0,fta=Number(s.FTA)||0,ftm=Number(s.FTM)||0;return `<tr><td><b>${escapeHtml(nameFor(id))}</b></td><td>${Number(p.age)||"—"}</td><td>${Math.floor((Number(s.minutesSeconds)||0)/60)}</td><td>${Number(s.points)||0}</td><td>${Number(s.REB)||0}</td><td>${Number(s.AST)||0}</td><td>${Number(s.STL)||0}</td><td>${Number(s.BLK)||0}</td><td>${fgm}/${fga}</td><td>${ratio(fgm,fga)}</td><td>${twom}/${twoa}</td><td>${ratio(twom,twoa)}</td><td>${threem}/${threea}</td><td>${ratio(threem,threea)}</td><td>${ftm}/${fta}</td><td>${ratio(ftm,fta)}</td><td>${Number(s.OREB)||0}</td><td>${Number(s.DREB)||0}</td><td>${Number(s.TO)||0}</td><td>${Number(s.PF)||0}</td><td>${eff(s)}</td></tr>`;}).join("");
    const closed=currentGame.status==="FINAL";
    document.querySelectorAll("[data-stat]").forEach(button=>button.disabled=closed);
    document.getElementById("undoAction").disabled=closed;
    document.getElementById("finishGame").disabled=closed;
    document.getElementById("saveLineup").disabled=closed;
    document.getElementById("finalOpponentScore").disabled=closed;
    document.getElementById("scorekeeperStatus").textContent=closed?`確定済み · ${currentGame.result==="W"?"勝利":currentGame.result==="L"?"敗戦":"引き分け"}`:"記録は自動保存されています。";
    if(sec===0&&currentGame.clockRunning&&!clockPauseSent){clockPauseSent=true;updateClock("pause").catch(()=>{});}
}
function statLabel(type) { return ({FG2_MADE:"2P成功",FG2_MISS:"2P失敗",FG3_MADE:"3P成功",FG3_MISS:"3P失敗",FT_MADE:"FT成功",FT_MISS:"FT失敗",OREB:"OR",DREB:"DR",AST:"AST",STL:"STL",BLK:"BLK",TO:"TO",PF:"PF"})[type]||type; }

async function refreshGame() { currentGame=await api("game","GET",null,{gameId:currentGame.gameId});drawGame(); }
async function updateClock(command) { const r=await api("clock","PUT",{gameId:currentGame.gameId,command});Object.assign(currentGame,r);currentGame.clockStartedAt=Math.floor(Date.now()/1000);clockPauseSent=false;drawGame(); }

document.getElementById("teamForm").addEventListener("submit",async e=>{e.preventDefault();try{team=await api("team","PUT",{name:document.getElementById("teamName").value.trim()});document.getElementById("liveTeamName").textContent=team.name;document.getElementById("teamStatus").textContent="チーム情報を保存しました。";toast("チームを保存しました");}catch(err){document.getElementById("teamStatus").textContent=err.message;}});
document.getElementById("playerForm").addEventListener("submit",async e=>{e.preventDefault();if(!team?.name){toast("先にチーム名を登録してください");return;}try{await api("player","PUT",{name:document.getElementById("playerName").value.trim(),number:Number(document.getElementById("playerNumber").value)||0,age:Number(document.getElementById("playerAge").value)||0});e.target.reset();await loadEverything();toast("選手を追加しました");}catch(err){toast(err.message);}});
document.getElementById("gameForm").addEventListener("submit",async e=>{e.preventDefault();if(!team?.name){toast("先にチーム名を登録してください");return;}try{const body={date:document.getElementById("gameDate").value,opponent:document.getElementById("opponent").value.trim(),quarterMinutes:Number(document.getElementById("quarterMinutes").value)||10};const scheduleMonth=qs.get("scheduleMonth"),startDateTime=qs.get("startDateTime");if(scheduleMonth&&startDateTime){body.scheduleMonth=scheduleMonth;body.startDateTime=startDateTime;}await api("game","PUT",body);e.target.reset();document.getElementById("quarterMinutes").value=10;await loadEverything();document.getElementById("gameStatus").textContent="試合を登録しました。試合一覧から記録を始められます。";}catch(err){document.getElementById("gameStatus").textContent=err.message;}});
document.getElementById("gamesList").addEventListener("click",e=>{const b=e.target.closest("[data-open-game]");if(b)openGame(b.dataset.openGame);});
document.getElementById("clockToggle").addEventListener("click",()=>{if(!currentGame.clockRunning&&(currentGame.onCourt||[]).length!==5){toast("先にコート上の選手5人を保存してください");return;}updateClock(currentGame.clockRunning?"pause":"start").catch(e=>toast(e.message));});
document.getElementById("nextPeriod").addEventListener("click",async()=>{if(Number(currentGame.period)>=4){toast("4Qです。試合終了を記録してください。");return;}try{await updateClock("next");}catch(e){toast(e.message);}});
document.getElementById("saveLineup").addEventListener("click",async()=>{try{const playerIds=[...document.querySelectorAll("#lineupChoices input:checked")].map(i=>i.value);if(playerIds.length!==5){toast("出場選手を5人選択してください");return;}const r=await api("lineup","PUT",{gameId:currentGame.gameId,playerIds});currentGame.onCourt=r.playerIds;toast("出場選手と交代時間を保存しました");}catch(e){toast(e.message);}});
document.querySelectorAll("[data-stat]").forEach(b=>b.addEventListener("click",async()=>{if(!currentGame||currentGame.status==="FINAL")return;const playerId=document.getElementById("activePlayer").value;if(!playerId){toast("選手を登録してください");return;}b.disabled=true;try{await api("action","PUT",{gameId:currentGame.gameId,playerId,type:b.dataset.stat});await refreshGame();}catch(e){toast(e.message);}finally{b.disabled=false;}}));
document.getElementById("undoAction").addEventListener("click",async()=>{if(!currentGame)return;try{await api("undo","PUT",{gameId:currentGame.gameId});await refreshGame();toast("直前の記録を取り消しました");}catch(e){toast(e.message);}});
document.getElementById("finishGame").addEventListener("click",async()=>{if(!currentGame)return;const score=Number(document.getElementById("finalOpponentScore").value);if(!Number.isInteger(score)||score<0){toast("相手の得点を確認してください");return;}if(!confirm("試合を終了し、ランキングに反映します。よろしいですか？"))return;try{const checked=[...document.querySelectorAll("#lineupChoices input:checked")].map(i=>i.value);await api("lineup","PUT",{gameId:currentGame.gameId,playerIds:[]});const result=await api("finish","PUT",{gameId:currentGame.gameId,opponentScore:score});toast(`試合を保存しました（${result.teamScore} - ${result.opponentScore}）`);currentGame=null;document.getElementById("scorekeeperCard").hidden=true;await loadEverything();}catch(e){toast(e.message);}});
document.getElementById("closeGameButton").addEventListener("click",()=>{currentGame=null;document.getElementById("scorekeeperCard").hidden=true;});
document.getElementById("rankingMetric").addEventListener("change",()=>renderLeaderboard(leaderboardRows));

async function init() {
    if(!token){location.replace("index.html");return;}
    document.body.style.display="block";
    if(!isAdmin()) ["teamForm","playerForm","gameForm"].forEach(id=>document.getElementById(id).classList.add("viewer-hidden"));
    const date=qs.get("date");document.getElementById("gameDate").value=date||new Date().toISOString().slice(0,10);
    document.getElementById("rankingSeasonLabel").textContent=`${seasonYear}年シーズン · 確定試合の累計`;
    try{await loadEverything();}catch(e){toast(`${e.message}。DynamoDB設定を確認してください。`);}
    clockInterval=setInterval(drawGame,250);
}
init();

