/**
 * スコアブック画面の状態とAPI通信を管理します。
 *
 * ブラウザーで読み取ったクレームは操作ボタンの表示だけに使います。
 * チームデータの変更を許可する前に、Java API側でもトークンと権限を検証します。
 */
const SCORE_API = "https://7yxh3p2c5swyx6ajv45ldmiswe0tirop.lambda-url.ap-northeast-1.on.aws/";
const SCHEDULE_API = SCORE_API;
const token = localStorage.getItem("id_token");
const qs = new URLSearchParams(location.search);
let seasonYear = new Date().getFullYear();
let team = null;
let cachedTeams = null;
let activeTeamId = localStorage.getItem("basket_team_id") || "";
let players = [];
let games = [];
let currentGame = null;
let leaderboardRows = [];
let scheduleRows = [];
let selectedSchedule = null;
let selectedPlayerId = "";
let clockInterval = null;
let clockPauseSent = false;
let toastTimer = null;
let playerTrendRows = [];
let playerTrendId = "";

/** ログイン時に保存したIDトークンから表示用の利用者情報を読み取ります。 */
function claims() {
    try {
        const encoded = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
        const normalized = encoded + "=".repeat((4 - (encoded.length % 4)) % 4);
        const payload = JSON.parse(atob(normalized));
        return Number(payload.exp) * 1000 > Date.now() ? payload : null;
    } catch {
        return null;
    }
}
/** 管理者向けの編集操作を表示するか、画面上で判断します。API側でも権限を検証します。 */
function isAdmin() {
    return (claims()?.["cognito:groups"] || []).includes("admins");
}

/** 現在の画面に合わせてスコアブック共通メニューを初期化します。 */
function initializeScorebookNavigation() {
    const view = qs.get("view") || (qs.has("date") ? "games" : "teams");
    document.querySelectorAll(".site-navigation [data-app-nav]").forEach((link) => {
        if (link.dataset.appNav === view) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
        if (["schedule", "facility"].includes(link.dataset.appNav)) link.hidden = !isAdmin();
    });
}
initializeScorebookNavigation();
/**
 * 認証情報を付けてスコアブックAPIへリクエストを送ります。
 *
 * @param {string} resource APIのリソース名（例: games、player）
 * @param {string} [method="GET"] HTTPメソッド
 * @param {object|null} [body=null] 書き込み時に送るJSON本文
 * @param {object} [extra={}] シーズンや選手IDなどの追加クエリ
 * @returns {Promise<object>} 解析済みのJSON応答
 */
function api(resource, method = "GET", body = null, extra = {}) {
    const params = new URLSearchParams({
        feature: "basketball",
        resource,
        ...(activeTeamId ? { teamId: activeTeamId } : {}),
        ...extra,
    });
    const headers = {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
    };

    return fetch(`${SCORE_API}?${params}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    })
        .then(async (response) => {
            const data = await response.json();
            if (!response.ok) {
                const code = data.code ? ` (${data.code})` : "";
                throw new Error(`${data.message || `APIエラー ${response.status}`}${code}`);
            }
            return data;
        })
        .catch((error) => {
            if (error instanceof TypeError) {
                throw new Error("APIに接続できません。しばらく待って再読み込みしてください。");
            }
            throw error;
        });
}
/** 操作の結果を短時間だけ画面に通知します。 */
function toast(message) {
    const element = document.getElementById("scorebookToast");
    element.textContent = message;
    element.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => element.classList.remove("is-visible"), 2500);
}

/** 選手レコードの新旧形式から共通の選手IDを取得します。 */
function playerId(item) {
    return item.playerId || String(item.sk || "").replace(/^PLAYER#/, "");
}

/** 選手IDを画面に表示する選手名へ変換します。 */
function nameFor(id) {
    return players.find((player) => player.playerId === id)?.name || "選手";
}

/** 選手のスタッツを表に並べる項目定義と値へ変換します。 */
function statRows(data) {
    return data?.items || [];
}

/** チーム、選手、試合の情報をまとめて読み、現在の画面を描画します。 */
async function loadEverything() {
    // 待ち時間を減らすため、チーム、選手、試合、ランキングの独立したデータを並行して取得します。
    const view = qs.get("view") || (qs.has("date") ? "games" : "teams");
    const requestedTeamId = activeTeamId;
    const teamListPromise = cachedTeams
        ? Promise.resolve(cachedTeams)
        : api("teams", "GET", null, { teamId: "" }).then(statRows);
    const teamDataPromise = requestedTeamId ? api("team-data") : Promise.resolve(null);
    const extraPromises =
        requestedTeamId && view === "games"
            ? [api("games")]
            : requestedTeamId && view === "rankings"
              ? [api("leaderboard", "GET", null, { season: String(seasonYear) })]
              : [];
    const [loadedTeams, initialTeamData, ...initialExtra] = await Promise.all([
        teamListPromise,
        teamDataPromise,
        ...extraPromises,
    ]);
    cachedTeams = loadedTeams;
    const availableTeams = cachedTeams;
    if (!availableTeams.some((t) => String(t.teamId) === activeTeamId))
        activeTeamId = availableTeams[0]?.teamId || "";
    let selectedTeamData = initialTeamData,
        extraData = initialExtra;
    if (activeTeamId !== requestedTeamId) {
        const nextRequests = activeTeamId
            ? [
                  api("team-data"),
                  ...(view === "games"
                      ? [api("games")]
                      : view === "rankings"
                        ? [api("leaderboard", "GET", null, { season: String(seasonYear) })]
                        : []),
              ]
            : [];
        const next = nextRequests.length ? await Promise.all(nextRequests) : [];
        selectedTeamData = next[0] || null;
        extraData = next.slice(1);
    }
    const select = document.getElementById("teamSelect");
    select.innerHTML =
        availableTeams
            .map(
                (t) =>
                    `<option value="${escapeAttr(t.teamId)}">${escapeHtml(t.name || "名称未設定")}</option>`,
            )
            .join("") || "<option value=''>チームを登録してください</option>";
    select.value = activeTeamId;
    if (activeTeamId) localStorage.setItem("basket_team_id", activeTeamId);
    else localStorage.removeItem("basket_team_id");
    team = selectedTeamData?.team || {};
    players = activeTeamId
        ? statRows(selectedTeamData?.players).map((p) => ({ ...p, playerId: playerId(p) }))
        : [];
    games =
        view === "games" && activeTeamId
            ? statRows(extraData[0]).sort((a, b) => String(a.date).localeCompare(String(b.date)))
            : [];
    const rankingData = view === "rankings" && activeTeamId ? statRows(extraData[0]) : [];
    document.getElementById("teamName").value = team.name || "";
    document.getElementById("liveTeamName").textContent = team.name || "チーム";
    renderRoster();
    renderGames();
    renderLeaderboard(rankingData);
    if (qs.get("view") === "games" || qs.has("scheduleMonth")) await loadScheduleOptions();
    document.getElementById("teamStatus").textContent = !activeTeamId
        ? "チームを登録するとメンバーと試合を管理できます。"
        : team.name
          ? ""
          : "チーム名を登録してください。";
    document
        .getElementById("playerForm")
        .classList.toggle("viewer-hidden", !activeTeamId || !isAdmin());
    document
        .getElementById("newGameCard")
        .querySelector("form")
        .classList.toggle("viewer-hidden", !activeTeamId || !isAdmin());
    document
        .getElementById("csvImportForm")
        .classList.toggle("viewer-hidden", !activeTeamId || !isAdmin());
    document.getElementById("deleteTeamButton").hidden = !activeTeamId || !isAdmin();
}

/** 選択チームの選手一覧と編集操作を表示します。 */
function renderRoster() {
    const activePlayers = players.filter((p) => p.active !== false);
    document.getElementById("rosterList").innerHTML = activePlayers.length
        ? activePlayers
              .map(
                  (p) =>
                      `<article class="roster-member"><div><strong>#${Number(p.number) || "—"} ${escapeHtml(p.name)}</strong><span>${escapeHtml(p.position || "POS未設定")}</span></div>${isAdmin() ? `<div class="roster-member-actions"><button type="button" class="button-light" data-edit-player="${escapeAttr(p.playerId)}">編集</button><button type="button" class="button-danger" data-remove-player="${escapeAttr(p.playerId)}">削除</button></div>` : ""}</article>`,
              )
              .join("")
        : "<div class='empty-state'>このチームにメンバーはいません。上のフォームから登録できます。</div>";
    document.getElementById("lineupChoices").innerHTML =
        activePlayers
            .map(
                (p) =>
                    `<label class="lineup-choice"><input type="checkbox" value="${escapeAttr(p.playerId)}"> #${Number(p.number) || "—"} ${escapeHtml(p.name)}</label>`,
            )
            .join("") || "<span class='field-hint'>先に選手を登録してください。</span>";
    renderPlayerSelection();
}

/** ライブ記録で選手を素早く一人選べるボタン一覧を描画します。 */
function renderPlayerSelection() {
    const activePlayers = players.filter((p) => p.active !== false);
    if (!activePlayers.some((p) => p.playerId === selectedPlayerId)) selectedPlayerId = "";
    document.getElementById("playerStatCards").innerHTML = activePlayers.length
        ? activePlayers
              .map(
                  (p) =>
                      `<button type="button" class="player-select-button${p.playerId === selectedPlayerId ? " is-selected" : ""}" aria-pressed="${p.playerId === selectedPlayerId}" data-player-select="${escapeAttr(p.playerId)}"><span class="player-select-number">#${Number(p.number) || "—"}</span><span class="player-select-copy"><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.position || "ポジション未設定")}</small></span><span class="player-select-check" aria-hidden="true">${p.playerId === selectedPlayerId ? "✓" : ""}</span></button>`,
              )
              .join("")
        : "<div class='empty-state'>先に選手を登録してください。</div>";
    renderSelectedPlayerPanel();
}

/** 選択選手に対する記録ボタンと現在のスタッツを表示します。 */
function renderSelectedPlayerPanel() {
    const panel = document.getElementById("selectedPlayerPanel");
    const player = players.find((p) => p.playerId === selectedPlayerId && p.active !== false);
    panel.hidden = !player;
    document.getElementById("playerSelectionHint").hidden = !!player;
    document.getElementById("selectedPlayerName").textContent = player
        ? `#${Number(player.number) || "—"} ${player.name} · ${player.position || "POS未設定"}`
        : "";
}

/** スコアブックの試合とカレンダー予定を結び付けるための共通IDを作ります。 */
function scheduleId(item) {
    return `${item.scheduleMonth || ""}|${item.startDateTime || ""}`;
}
/** カレンダーの試合予定を読み、スコアブックとの紐付け候補にします。 */
async function loadScheduleOptions() {
    const select = document.getElementById("scheduleGameSelect");
    try {
        const response = await fetch(SCHEDULE_API, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        scheduleRows = (Array.isArray(payload) ? payload : payload.items || []).filter(
            (s) => s.eventType === "GAME",
        );
        const competitions = [
            ...new Set(
                scheduleRows.map((s) => String(s.competitionName || "").trim()).filter(Boolean),
            ),
        ].sort((a, b) => a.localeCompare(b, "ja"));
        document.getElementById("basketballCompetitionNames").replaceChildren(
            ...competitions.map((name) => {
                const option = document.createElement("option");
                option.value = name;
                return option;
            }),
        );
        const linked = new Set(
            games.filter((g) => g.scheduleMonth && g.startDateTime).map(scheduleId),
        );
        const available = scheduleRows
            .filter((s) => !linked.has(scheduleId(s)))
            .sort((a, b) => String(a.startDateTime).localeCompare(String(b.startDateTime)));
        const wanted = selectedSchedule
            ? scheduleId(selectedSchedule)
            : [qs.get("scheduleMonth"), qs.get("startDateTime")].filter(Boolean).join("|");
        select.innerHTML = `<option value="">予定表から選択（任意）</option>${available.length ? available.map((s) => `<option value="${escapeAttr(scheduleId(s))}">${escapeHtml(s.startDateTime?.replace("T", " ") || "日時未設定")} · ${escapeHtml(s.competitionName ? `${s.competitionName}${s.round ? ` · ${s.round}` : ""}` : s.facilityName || "試合予定")}</option>`).join("") : "<option disabled>紐づけ可能な試合予定はありません</option>"}`;
        selectedSchedule = available.find((s) => scheduleId(s) === wanted) || null;
        select.value = selectedSchedule ? scheduleId(selectedSchedule) : "";
        if (selectedSchedule)
            document.getElementById("gameDate").value = selectedSchedule.startDateTime.slice(0, 10);
    } catch (e) {
        select.innerHTML =
            "<option value=''>予定表を読み込めませんでした（手入力できます）</option>";
        selectedSchedule = null;
    }
}

/** 試合結果を日付順の一覧にし、詳細や編集への操作を付けます。 */
function renderGames() {
    const box = document.getElementById("gamesList");
    document.getElementById("exportGamesButton").disabled = games.length === 0;
    if (!games.length) {
        box.innerHTML = "<div class='empty-state'>試合はまだありません。</div>";
        return;
    }
    const itemHtml = (g) => {
        const done = g.status === "FINAL",
            admin = isAdmin(),
            resultText = g.result === "U" ? "結果未入力" : g.result || "";
        return `<div class="game-item"><div><strong>${escapeHtml(g.date || "")} · ${escapeHtml(team.name || "チーム")} vs ${escapeHtml(g.opponent || "相手")}</strong><span>${done ? `${g.teamScore || 0} - ${g.result === "U" ? "—" : g.opponentScore || 0} · ${resultText}` : g.status === "LIVE" ? "記録中" : "未開始"}</span>${g.round ? `<div class="game-item-meta"><span class="game-meta-chip game-competition-chip">${escapeHtml(g.round)}</span></div>` : ""}</div><div class="game-item-actions"><button type="button" data-open-game="${escapeAttr(g.gameId)}" class="${done ? "button-light" : admin ? "button-accent" : "button-light"}">${done ? "結果を見る" : admin ? (g.status === "LIVE" ? "記録を再開" : "スコア記録") : "詳細を見る"}</button>${admin ? `<button type="button" data-edit-game="${escapeAttr(g.gameId)}" class="button-light">編集</button>` : ""}</div></div>`;
    };
    if (document.getElementById("gameGrouping").value === "date") {
        box.innerHTML = games.map(itemHtml).join("");
        return;
    }
    const groups = new Map();
    games.forEach((g) => {
        const name = g.competitionName || "大会未設定";
        if (!groups.has(name)) groups.set(name, []);
        groups.get(name).push(g);
    });
    box.innerHTML = [...groups.entries()]
        .map(
            ([competition, rows]) =>
                `<section class="game-competition-group"><h3 class="game-competition-heading">${escapeHtml(competition)}</h3>${rows.map(itemHtml).join("")}</section>`,
        )
        .join("");
}

/** 選択チームの試合データを表計算ソフト向けCSVとして保存します。 */
function exportGamesCsv() {
    const headers = [
        "DATE",
        "COMPETITION",
        "ROUND",
        "TEAM",
        "OPPONENT",
        "TEAM_SCORE",
        "OPPONENT_SCORE",
        "RESULT",
        "STATUS",
    ];
    const data = games.map((g) => [
        g.date || "",
        g.competitionName || "",
        g.round || "",
        team.name || "",
        g.opponent || "",
        g.status === "FINAL" ? (g.teamScore ?? 0) : "",
        g.status === "FINAL" && g.result !== "U" ? (g.opponentScore ?? 0) : "",
        g.result === "U" ? "" : g.result || "",
        g.status || "",
    ]);
    const csv = [headers, ...data].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `games-${activeTeamId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
}

/** 集計済みスタッツをランキング表に表示します。 */
function renderLeaderboard(rows) {
    const body = document.getElementById("leaderboardBody");
    leaderboardRows = rows;
    const metric = document.getElementById("rankingMetric")?.value || "points";
    const value = (s) => (metric === "EFF" ? eff(s) : Number(s[metric]) || 0);
    const sorted = [...rows].sort((a, b) => value(b) - value(a));
    body.innerHTML = sorted
        .map((s) => {
            const id = playerId(s),
                p = players.find((x) => x.playerId === id) || {},
                fga = Number(s.FGA) || 0,
                fgm = Number(s.FGM) || 0,
                twoa = Number(s["2PA"]) || 0,
                twom = Number(s["2PM"]) || 0,
                threea = Number(s["3PA"]) || 0,
                threem = Number(s["3PM"]) || 0,
                fta = Number(s.FTA) || 0,
                ftm = Number(s.FTM) || 0;
            return `<tr><td><button type="button" class="trend-player-button" data-trend-player="${escapeAttr(id)}">${escapeHtml(nameFor(id))} ↗</button></td><td>${escapeHtml(p.position || "—")}</td><td>${Number(s.GP) || 0}</td><td>${Number(s.W) || 0}-${Number(s.L) || 0}-${Number(s.D) || 0}</td><td>${Math.floor((Number(s.minutesSeconds) || 0) / 60)}</td><td>${Number(s.points) || 0}</td><td>${Number(s.REB) || 0}</td><td>${Number(s.AST) || 0}</td><td>${Number(s.STL) || 0}</td><td>${Number(s.BLK) || 0}</td><td>${fgm}/${fga}</td><td>${ratio(fgm, fga)}</td><td>${twom}/${twoa}</td><td>${ratio(twom, twoa)}</td><td>${threem}/${threea}</td><td>${ratio(threem, threea)}</td><td>${ftm}/${fta}</td><td>${ratio(ftm, fta)}</td><td>${Number(s.OREB) || 0}</td><td>${Number(s.DREB) || 0}</td><td>${Number(s.TO) || 0}</td><td>${Number(s.PF) || 0}</td><td>${eff(s)}</td></tr>`;
        })
        .join("");
    document.getElementById("leaderboardEmpty").hidden = sorted.length > 0;
}

/** 選手の試合ごとの記録を読み、推移グラフの表示対象を切り替えます。 */
async function showPlayerTrend(id) {
    playerTrendId = id;
    const panel = document.getElementById("playerTrendPanel");
    panel.hidden = false;
    document.getElementById("playerTrendTitle").textContent =
        `${nameFor(id)} · ${seasonYear}年の試合ごとの推移`;
    document.getElementById("playerTrendChart").innerHTML =
        "<p class='empty-state'>読み込み中…</p>";
    try {
        const result = await api("player-trend", "GET", null, {
            playerId: id,
            season: String(seasonYear),
        });
        if (playerTrendId !== id) return;
        playerTrendRows = statRows(result).reverse();
        renderPlayerTrend();
        panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (e) {
        document.getElementById("playerTrendChart").innerHTML =
            `<p class='empty-state'>推移を読み込めませんでした：${escapeHtml(e.message)}</p>`;
    }
}

/** 選手ごとのスタッツ推移を、グラフと試合別の数値で表示します。 */
function renderPlayerTrend() {
    const rows = playerTrendRows,
        metric = document.getElementById("playerTrendMetric").value,
        chart = document.getElementById("playerTrendChart"),
        field = metric === "minutesSeconds" ? "minutesSeconds" : metric;
    if (!rows.length) {
        chart.innerHTML = "<p class='empty-state'>このシーズンに確定した試合はありません。</p>";
        document.getElementById("playerTrendGames").innerHTML = "";
        return;
    }
    const values = rows.map((r) =>
            metric === "minutesSeconds"
                ? Math.round((Number(r[field]) || 0) / 60)
                : Number(r[field]) || 0,
        ),
        max = Math.max(1, ...values),
        w = 640,
        h = 210,
        pad = 30;
    const points = values.map((v, i) => ({
        x: pad + (rows.length === 1 ? (w - 2 * pad) / 2 : (i * (w - 2 * pad)) / (rows.length - 1)),
        y: h - pad - (v / max) * (h - 2 * pad),
        v,
    }));
    const path = points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");
    chart.innerHTML = `<div class="trend-chart-scroll"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${escapeHtml(nameFor(playerTrendId))}の試合ごとの推移"><line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" class="trend-axis"/><path d="${path}" class="trend-line"/>${points.map((p, i) => `<circle cx="${p.x}" cy="${p.y}" r="5" class="trend-point"><title>${escapeHtml(rows[i].date)} ${escapeHtml(rows[i].opponent || "")}：${p.v}</title></circle>`).join("")}</svg></div><div class="trend-chart-caption"><span>${escapeHtml(rows[0].date || "")} · ${escapeHtml(rows[0].opponent || "")}</span><strong>最大 ${max}${metric === "minutesSeconds" ? "分" : ""}</strong><span>${escapeHtml(rows.at(-1).date || "")} · ${escapeHtml(rows.at(-1).opponent || "")}</span></div>`;
    document.getElementById("playerTrendGames").innerHTML = rows
        .map(
            (r, i) =>
                `<span><strong>${escapeHtml(r.date || "")}</strong> vs ${escapeHtml(r.opponent || "—")} · ${values[i]}${metric === "minutesSeconds" ? "分" : ""}</span>`,
        )
        .join("");
}

/** 選手名などの登録値をHTMLとして実行されないように保護します。 */
function escapeHtml(value) {
    return String(value ?? "").replace(
        /[&<>"']/g,
        (character) =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
            })[character],
    );
}

/** HTML属性へ入れる値の引用符と特殊文字をエスケープします。 */
function escapeAttr(value) {
    return escapeHtml(value);
}

/** 現在のシーズン集計をCSVファイルとして保存します。 */
function downloadSeasonCsv() {
    const headers = [
        "PLAYER",
        "POS",
        "GP",
        "W",
        "L",
        "D",
        "PTS",
        "REB",
        "AST",
        "STL",
        "BLK",
        "FGM",
        "FGA",
        "FG%",
        "2PM",
        "2PA",
        "2P%",
        "3PM",
        "3PA",
        "3P%",
        "FTM",
        "FTA",
        "FT%",
        "OREB",
        "DREB",
        "TO",
        "PF",
        "EFF",
    ];
    const data = leaderboardRows.map((s) => {
        const row = { ...s };
        return [
            nameFor(playerId(s)),
            players.find((p) => p.playerId === playerId(s))?.position || "",
            s.GP || 0,
            s.W || 0,
            s.L || 0,
            s.D || 0,
            s.points || 0,
            s.REB || 0,
            s.AST || 0,
            s.STL || 0,
            s.BLK || 0,
            s.FGM || 0,
            s.FGA || 0,
            ratio(Number(s.FGM) || 0, Number(s.FGA) || 0),
            s["2PM"] || 0,
            s["2PA"] || 0,
            ratio(Number(s["2PM"]) || 0, Number(s["2PA"]) || 0),
            s["3PM"] || 0,
            s["3PA"] || 0,
            ratio(Number(s["3PM"]) || 0, Number(s["3PA"]) || 0),
            s.FTM || 0,
            s.FTA || 0,
            ratio(Number(s.FTM) || 0, Number(s.FTA) || 0),
            s.OREB || 0,
            s.DREB || 0,
            s.TO || 0,
            s.PF || 0,
            eff(row),
        ];
    });
    const csv = [headers, ...data].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `basketball-${activeTeamId}-${seasonYear}.csv`;
    link.click();
    URL.revokeObjectURL(url);
}

/** 選択した試合を開き、記録または結果確認画面を用意します。 */
async function openGame(id) {
    try {
        currentGame = await api("game", "GET", null, { gameId: id });
        selectedPlayerId = "";
        document.getElementById("scorekeeperCard").hidden = false;
        const admin = isAdmin();
        const readOnly = !admin || currentGame.status === "FINAL";
        document.getElementById("scorekeeperCard").classList.toggle("is-readonly", readOnly);
        [
            "clockToggle",
            "nextPeriod",
            "saveLineup",
            "undoAction",
            "finishGame",
            "finalOpponentScore",
        ].forEach((key) => {
            const el = document.getElementById(key);
            if (el)
                el.closest(".clock-controls,.lineup-panel,.scorekeeper-bottom")?.classList.toggle(
                    "viewer-hidden",
                    readOnly,
                );
        });
        document.querySelector(".stat-entry").classList.toggle("viewer-hidden", readOnly);
        document.getElementById("lineupChoices").classList.toggle("viewer-hidden", readOnly);
        document.querySelector("#scorekeeperCard .eyebrow").textContent = readOnly
            ? "GAME RESULT"
            : "LIVE GAME";
        document.getElementById("liveGameTitle").textContent =
            `${currentGame.date} · vs ${currentGame.opponent}`;
        document.getElementById("liveTeamName").textContent = team.name || "チーム";
        document.getElementById("liveOpponent").textContent = currentGame.opponent || "相手";
        document.getElementById("finalOpponentScore").value =
            currentGame.result === "U" ? "" : Number(currentGame.opponentScore) || 0;
        renderRoster();
        const onCourt = Array.isArray(currentGame.onCourt)
            ? currentGame.onCourt
            : String(currentGame.onCourt || "")
                  .split(",")
                  .filter(Boolean);
        currentGame.onCourt = onCourt;
        document
            .querySelectorAll("#lineupChoices input")
            .forEach((i) => (i.checked = onCourt.includes(i.value)));
        drawGame();
        document
            .getElementById("scorekeeperCard")
            .scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
        toast(e.message);
    }
}

/** 試合時計の経過状態から、現在の残り時間を計算します。 */
function remainingNow() {
    const base = Number(currentGame?.remainingSeconds) || 0;
    if (!currentGame?.clockRunning) return base;

    const startedAt = Number(currentGame.clockStartedAt) || Math.floor(Date.now() / 1000);
    const elapsedSeconds = Math.floor(Date.now() / 1000) - startedAt;
    return Math.max(0, base - elapsedSeconds);
}
/** 試合時計、スコア、選手の記録操作を画面へ反映します。 */
function drawGame() {
    if (!currentGame) return;
    const sec = remainingNow();
    document.getElementById("liveClock").textContent =
        `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
    document.getElementById("livePeriod").textContent = `${Number(currentGame.period) || 1}Q`;
    document.getElementById("liveTeamScore").textContent = Number(currentGame.teamScore) || 0;
    document.getElementById("liveOpponentScore").textContent =
        currentGame.result === "U" ? "—" : Number(currentGame.opponentScore) || 0;
    document.getElementById("clockToggle").textContent = currentGame.clockRunning
        ? "一時停止"
        : "開始";
    document.getElementById("clockToggle").disabled = currentGame.status === "FINAL";
    document.getElementById("nextPeriod").disabled = currentGame.status === "FINAL";
    const events = statRows(currentGame.events).slice(-5).reverse();
    document.getElementById("recentActions").innerHTML = events
        .map(
            (e) =>
                `<span class="recent-action">${escapeHtml(nameFor(e.playerId))} · ${escapeHtml(statLabel(e.type))}</span>`,
        )
        .join("");
    const gameRows = statRows(currentGame.players).sort(
        (a, b) => (Number(b.points) || 0) - (Number(a.points) || 0),
    );
    document.getElementById("gameBoxscoreBody").innerHTML = gameRows
        .map((s) => {
            const id = playerId(s),
                p = players.find((x) => x.playerId === id) || {},
                fga = Number(s.FGA) || 0,
                fgm = Number(s.FGM) || 0,
                twoa = Number(s["2PA"]) || 0,
                twom = Number(s["2PM"]) || 0,
                threea = Number(s["3PA"]) || 0,
                threem = Number(s["3PM"]) || 0,
                fta = Number(s.FTA) || 0,
                ftm = Number(s.FTM) || 0;
            return `<tr><td><b>${escapeHtml(nameFor(id))}</b></td><td>${escapeHtml(p.position || "—")}</td><td>${Math.floor((Number(s.minutesSeconds) || 0) / 60)}</td><td>${Number(s.points) || 0}</td><td>${Number(s.REB) || 0}</td><td>${Number(s.AST) || 0}</td><td>${Number(s.STL) || 0}</td><td>${Number(s.BLK) || 0}</td><td>${fgm}/${fga}</td><td>${ratio(fgm, fga)}</td><td>${twom}/${twoa}</td><td>${ratio(twom, twoa)}</td><td>${threem}/${threea}</td><td>${ratio(threem, threea)}</td><td>${ftm}/${fta}</td><td>${ratio(ftm, fta)}</td><td>${Number(s.OREB) || 0}</td><td>${Number(s.DREB) || 0}</td><td>${Number(s.TO) || 0}</td><td>${Number(s.PF) || 0}</td><td>${eff(s)}</td></tr>`;
        })
        .join("");
    const closed = currentGame.status === "FINAL";
    document.querySelectorAll("[data-stat]").forEach((button) => (button.disabled = closed));
    document.getElementById("undoAction").disabled = closed;
    document.getElementById("finishGame").disabled = closed;
    document.getElementById("saveLineup").disabled = closed;
    document.getElementById("finalOpponentScore").disabled = closed;
    document.getElementById("scorekeeperStatus").textContent = closed
        ? `確定済み · ${currentGame.result === "W" ? "勝利" : currentGame.result === "L" ? "敗戦" : currentGame.result === "U" ? "結果未入力" : "引き分け"}`
        : "記録は自動保存されています。";
    if (sec === 0 && currentGame.clockRunning && !clockPauseSent) {
        clockPauseSent = true;
        updateClock("pause").catch(() => {});
    }
}
/** 記録操作コードをスコアブックのボタン表示名に変換します。 */
function statLabel(type) {
    return (
        {
            FG2_MADE: "2P成功",
            FG2_MISS: "2P失敗",
            FG3_MADE: "3P成功",
            FG3_MISS: "3P失敗",
            FT_MADE: "FT成功",
            FT_MISS: "FT失敗",
            OREB: "OR",
            DREB: "DR",
            AST: "AST",
            STL: "STL",
            BLK: "BLK",
            TO: "TO",
            PF: "PF",
        }[type] || type
    );
}

/** APIから試合の最新状態を読み直し、スコア表示を同期します。 */
async function refreshGame() {
    currentGame = await api("game", "GET", null, { gameId: currentGame.gameId });
    drawGame();
}
/** 時計の開始、一時停止、リセットをAPIへ保存して表示を更新します。 */
async function updateClock(command) {
    const updatedGame = await api("clock", "PUT", { gameId: currentGame.gameId, command });
    Object.assign(currentGame, updatedGame);
    currentGame.clockStartedAt = Math.floor(Date.now() / 1000);
    clockPauseSent = false;
    drawGame();
}

document.getElementById("teamForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const creating = !activeTeamId;
    try {
        const saved = await api(
            "team",
            "PUT",
            {
                ...(creating ? {} : { teamId: activeTeamId }),
                name: document.getElementById("teamName").value.trim(),
            },
            { teamId: "" },
        );
        activeTeamId = saved.teamId;
        cachedTeams = null;
        localStorage.setItem("basket_team_id", activeTeamId);
        await loadEverything();
        toast(creating ? "チームを登録しました" : "チーム名を更新しました");
    } catch (err) {
        document.getElementById("teamStatus").textContent = err.message;
    }
});
document.getElementById("newTeamButton").addEventListener("click", () => {
    resetPlayerForm();
    activeTeamId = "";
    localStorage.removeItem("basket_team_id");
    team = null;
    document.getElementById("teamSelect").value = "";
    document.getElementById("teamName").value = "";
    document.getElementById("teamStatus").textContent = "新しいチーム名を入力してください。";
    document.getElementById("deleteTeamButton").hidden = true;
    document.getElementById("teamName").focus();
});
document.getElementById("teamSelect").addEventListener("change", async (e) => {
    resetPlayerForm();
    activeTeamId = e.target.value;
    localStorage.setItem("basket_team_id", activeTeamId);
    try {
        await loadEverything();
    } catch (err) {
        toast(err.message);
    }
});
document.getElementById("deleteTeamButton").addEventListener("click", async () => {
    if (
        !activeTeamId ||
        !confirm(
            `「${team.name || "このチーム"}」とそのメンバー・試合・ランキングデータをすべて削除します。この操作は取り消せません。削除しますか？`,
        )
    )
        return;
    try {
        await api("team", "DELETE", null, { teamId: activeTeamId });
        resetPlayerForm();
        activeTeamId = "";
        cachedTeams = null;
        localStorage.removeItem("basket_team_id");
        await loadEverything();
        toast("チームと関連データを削除しました");
    } catch (e) {
        toast(e.message);
    }
});
/** 選手フォームを新規登録用の初期状態へ戻します。 */
function resetPlayerForm() {
    const form = document.getElementById("playerForm");
    form.reset();
    document.getElementById("playerEditingId").value = "";
    document.getElementById("savePlayerButton").textContent = "選手を追加";
    document.getElementById("cancelPlayerEdit").hidden = true;
}
document.getElementById("playerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!activeTeamId) {
        toast("先にチームを登録してください");
        return;
    }
    try {
        const playerId = document.getElementById("playerEditingId").value;
        await api("player", "PUT", {
            ...(playerId ? { playerId } : {}),
            name: document.getElementById("playerName").value.trim(),
            position: document.getElementById("playerPosition").value,
            number: Number(document.getElementById("playerNumber").value) || 0,
        });
        resetPlayerForm();
        await loadEverything();
        toast(playerId ? "メンバー情報を更新しました" : "メンバーを追加しました");
    } catch (err) {
        toast(err.message);
    }
});
document.getElementById("cancelPlayerEdit").addEventListener("click", resetPlayerForm);
document.getElementById("rosterList").addEventListener("click", async (e) => {
    const edit = e.target.closest("[data-edit-player]");
    if (edit) {
        const player = players.find((p) => p.playerId === edit.dataset.editPlayer);
        if (!player) return;
        document.getElementById("playerEditingId").value = player.playerId;
        document.getElementById("playerName").value = player.name || "";
        document.getElementById("playerPosition").value = player.position || "";
        document.getElementById("playerNumber").value = Number(player.number) || "";
        document.getElementById("savePlayerButton").textContent = "変更を保存";
        document.getElementById("cancelPlayerEdit").hidden = false;
        document.getElementById("playerName").focus();
        return;
    }
    const remove = e.target.closest("[data-remove-player]");
    if (remove) {
        const player = players.find((p) => p.playerId === remove.dataset.removePlayer);
        if (
            !player ||
            !confirm(`${player.name}をメンバー一覧から削除しますか？過去の試合記録は残ります。`)
        )
            return;
        try {
            await api("player", "DELETE", null, { playerId: player.playerId });
            await loadEverything();
            toast("メンバーを一覧から削除しました");
        } catch (err) {
            toast(err.message);
        }
    }
});
document.getElementById("scheduleGameSelect").addEventListener("change", (e) => {
    selectedSchedule = scheduleRows.find((s) => scheduleId(s) === e.target.value) || null;
    if (selectedSchedule)
        document.getElementById("gameDate").value = selectedSchedule.startDateTime.slice(0, 10);
});
document.getElementById("gameForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!activeTeamId) {
        toast("先にチームを登録してください");
        return;
    }
    try {
        const body = {
            date: document.getElementById("gameDate").value,
            opponent: document.getElementById("opponent").value.trim(),
            quarterMinutes: Number(document.getElementById("quarterMinutes").value) || 10,
        };
        if (selectedSchedule) {
            body.scheduleMonth = selectedSchedule.scheduleMonth;
            body.startDateTime = selectedSchedule.startDateTime;
            body.competitionName = selectedSchedule.competitionName || "";
            body.round = selectedSchedule.round || "";
        }
        await api("game", "PUT", body);
        e.target.reset();
        selectedSchedule = null;
        document.getElementById("quarterMinutes").value = 10;
        await loadEverything();
        document.getElementById("gameStatus").textContent =
            "試合を登録しました。予定表の大会・ラウンド情報も紐づけました。";
    } catch (err) {
        document.getElementById("gameStatus").textContent = err.message;
    }
});
document.getElementById("gamesList").addEventListener("click", (e) => {
    const edit = e.target.closest("[data-edit-game]");
    if (edit) {
        const game = games.find((g) => g.gameId === edit.dataset.editGame);
        if (!game) return;
        document.getElementById("editingGameId").value = game.gameId;
        document.getElementById("editGameDate").value = game.date || "";
        document.getElementById("editOpponent").value = game.opponent || "";
        document.getElementById("editQuarterMinutes").value = Number(game.quarterMinutes) || 10;
        document.getElementById("editQuarterMinutes").disabled = game.status !== "READY";
        document.getElementById("editOpponentScoreLabel").hidden = game.status !== "FINAL";
        document.getElementById("editOpponentScore").value =
            game.result === "U" ? "" : Number(game.opponentScore) || 0;
        document.getElementById("editGameHint").textContent =
            game.status === "READY"
                ? "試合開始前のため、クォーター時間も変更できます。"
                : game.status === "FINAL"
                  ? "試合日・対戦相手と、必要なら相手得点を修正できます。"
                  : "試合開始後はクォーター時間を変更できません。";
        document.getElementById("editGameDialog").showModal();
        return;
    }
    const b = e.target.closest("[data-open-game]");
    if (b) openGame(b.dataset.openGame);
});
document
    .getElementById("cancelGameEdit")
    .addEventListener("click", () => document.getElementById("editGameDialog").close());
document.getElementById("editGameForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const gameId = document.getElementById("editingGameId").value;
    try {
        const body = {
                gameId,
                date: document.getElementById("editGameDate").value,
                opponent: document.getElementById("editOpponent").value.trim(),
                quarterMinutes: Number(document.getElementById("editQuarterMinutes").value) || 10,
            },
            existing = games.find((g) => g.gameId === gameId);
        if (
            existing?.status === "FINAL" &&
            document.getElementById("editOpponentScore").value !== ""
        )
            body.opponentScore = Number(document.getElementById("editOpponentScore").value);
        await api("game", "PUT", body);
        document.getElementById("editGameDialog").close();
        await loadEverything();
        toast("試合内容を更新しました");
    } catch (err) {
        toast(err.message);
    }
});
document.getElementById("clockToggle").addEventListener("click", () => {
    if (!currentGame.clockRunning && (currentGame.onCourt || []).length !== 5) {
        toast("先にコート上の選手5人を保存してください");
        return;
    }
    updateClock(currentGame.clockRunning ? "pause" : "start").catch((e) => toast(e.message));
});
document.getElementById("nextPeriod").addEventListener("click", async () => {
    if (Number(currentGame.period) >= 4) {
        toast("4Qです。試合終了を記録してください。");
        return;
    }
    try {
        await updateClock("next");
    } catch (e) {
        toast(e.message);
    }
});
document.getElementById("saveLineup").addEventListener("click", async () => {
    try {
        const playerIds = [...document.querySelectorAll("#lineupChoices input:checked")].map(
            (i) => i.value,
        );
        if (playerIds.length !== 5) {
            toast("出場選手を5人選択してください");
            return;
        }
        const r = await api("lineup", "PUT", { gameId: currentGame.gameId, playerIds });
        currentGame.onCourt = r.playerIds;
        toast("出場選手と交代時間を保存しました");
    } catch (e) {
        toast(e.message);
    }
});
document.getElementById("playerStatCards").addEventListener("click", (e) => {
    const button = e.target.closest("[data-player-select]");
    if (!button || !currentGame || currentGame.status === "FINAL") return;
    selectedPlayerId =
        selectedPlayerId === button.dataset.playerSelect ? "" : button.dataset.playerSelect;
    renderPlayerSelection();
    if (selectedPlayerId)
        document
            .getElementById("selectedPlayerPanel")
            .scrollIntoView({ behavior: "smooth", block: "nearest" });
});
document.getElementById("clearSelectedPlayer").addEventListener("click", () => {
    selectedPlayerId = "";
    renderPlayerSelection();
});
document.getElementById("selectedPlayerPanel").addEventListener("click", async (e) => {
    const button = e.target.closest("[data-stat]");
    if (!button || !currentGame || currentGame.status === "FINAL" || !selectedPlayerId) return;
    button.disabled = true;
    try {
        await api("action", "PUT", {
            gameId: currentGame.gameId,
            playerId: selectedPlayerId,
            type: button.dataset.stat,
        });
        await refreshGame();
    } catch (err) {
        toast(err.message);
    } finally {
        button.disabled = false;
    }
});
document.getElementById("undoAction").addEventListener("click", async () => {
    if (!currentGame) return;
    try {
        await api("undo", "PUT", { gameId: currentGame.gameId });
        await refreshGame();
        toast("直前の記録を取り消しました");
    } catch (e) {
        toast(e.message);
    }
});
document.getElementById("finishGame").addEventListener("click", async () => {
    if (!currentGame) return;
    const score = Number(document.getElementById("finalOpponentScore").value);
    if (!Number.isInteger(score) || score < 0) {
        toast("相手の得点を確認してください");
        return;
    }
    if (!confirm("試合を終了し、ランキングに反映します。よろしいですか？")) return;
    try {
        const checked = [...document.querySelectorAll("#lineupChoices input:checked")].map(
            (i) => i.value,
        );
        await api("lineup", "PUT", { gameId: currentGame.gameId, playerIds: [] });
        const result = await api("finish", "PUT", {
            gameId: currentGame.gameId,
            opponentScore: score,
        });
        toast(`試合を保存しました（${result.teamScore} - ${result.opponentScore}）`);
        currentGame = null;
        document.getElementById("scorekeeperCard").hidden = true;
        await loadEverything();
    } catch (e) {
        toast(e.message);
    }
});
document.getElementById("closeGameButton").addEventListener("click", () => {
    currentGame = null;
    document.getElementById("scorekeeperCard").hidden = true;
});
document
    .getElementById("rankingMetric")
    .addEventListener("change", () => renderLeaderboard(leaderboardRows));
document.getElementById("leaderboardBody").addEventListener("click", (e) => {
    const button = e.target.closest("[data-trend-player]");
    if (button) showPlayerTrend(button.dataset.trendPlayer);
});
document.getElementById("playerTrendMetric").addEventListener("change", renderPlayerTrend);
document
    .getElementById("closePlayerTrend")
    .addEventListener("click", () => (document.getElementById("playerTrendPanel").hidden = true));
document.getElementById("gameGrouping").addEventListener("change", renderGames);
document.getElementById("exportGamesButton").addEventListener("click", exportGamesCsv);
document.getElementById("seasonSelect").addEventListener("change", async (e) => {
    seasonYear = Number(e.target.value) || new Date().getFullYear();
    document.getElementById("rankingSeasonLabel").textContent =
        `${seasonYear}年シーズン · 確定試合の累計`;
    try {
        await loadEverything();
        if (!document.getElementById("playerTrendPanel").hidden && playerTrendId)
            await showPlayerTrend(playerTrendId);
    } catch (err) {
        toast(err.message);
    }
});
document.getElementById("exportStatsButton").addEventListener("click", downloadSeasonCsv);
document.getElementById("downloadImportTemplateButton").addEventListener("click", () => {
    const headers = [
        "DATE",
        "COMPETITION",
        "ROUND",
        "OPPONENT",
        "OPPONENT_SCORE",
        "PLAYER",
        "POS",
        "NUMBER",
        "PTS",
        "REB",
        "AST",
        "STL",
        "BLK",
        "FGM",
        "FGA",
        "2PM",
        "2PA",
        "3PM",
        "3PA",
        "FTM",
        "FTA",
        "OREB",
        "DREB",
        "TO",
        "PF",
    ];
    const blob = new Blob(["\uFEFF", headers.join(",") + "\r\n"], {
        type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "basketball-game-import-template.csv";
    link.click();
    URL.revokeObjectURL(url);
});
document.getElementById("csvImportForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = document.getElementById("csvImportStatus"),
        file = document.getElementById("statsCsvFile").files[0];
    if (!file) return;
    status.textContent = "CSVを読み込んでいます…";
    try {
        const parsed = parseMigrationCsv(await file.text());
        let result, summary;
        if (parsed.multi) {
            if (parsed.matches.length > 50) throw new Error("一度に取り込めるのは50試合までです。");
            result = await api("import-games", "PUT", { matches: parsed.matches });
            summary = `${result.gamesImported}試合、選手記録${result.playersImported}件を取り込みました。`;
        } else {
            const date = document.getElementById("importGameDate").value,
                opponent = document.getElementById("importOpponent").value.trim();
            if (!date || !opponent)
                throw new Error("旧形式の1試合CSVでは試合日と対戦相手を入力してください。");
            const body = {
                date,
                opponent,
                competitionName: document.getElementById("importCompetition").value.trim(),
                players: parsed.players,
            };
            const opponentScore = document.getElementById("importOpponentScore").value;
            if (opponentScore !== "") body.opponentScore = Number(opponentScore);
            result = await api("import-game", "PUT", body);
            summary = `1試合、選手記録${result.playersImported}件を取り込みました。`;
        }
        await loadEverything();
        status.textContent = `過去データを取り込みました。${summary}`;
        e.target.reset();
    } catch (err) {
        status.textContent = err.message;
    }
});

/** URLの画面指定から、チーム・試合・ランキングの表示を選びます。 */
function applyView() {
    const view = qs.get("view") || (qs.has("date") ? "games" : "teams");
    const config = {
        teams: {
            title: "チーム管理",
            description: "チームを登録して、メンバーを管理します。",
            sections: ["teamCard", "rosterCard"],
        },
        games: {
            title: "試合管理",
            description: "選択したチームの試合を登録し、詳細やスコアを確認します。",
            sections: ["newGameCard", "gamesCard", "scorekeeperCard"],
        },
        rankings: {
            title: "ランキング",
            description: "選択したチームのシーズンスタッツを確認します。",
            sections: ["leaderboardCard"],
        },
    };
    const page = config[view] ? view : "teams",
        selected = config[page];
    document.getElementById("scorebookPageTitle").textContent = selected.title;
    document.getElementById("scorebookPageDescription").textContent = selected.description;
    document.querySelectorAll(".scorebook-grid > section").forEach((section) => {
        section.hidden =
            !selected.sections.includes(section.id) ||
            (section.id === "scorekeeperCard" && !currentGame);
    });
    document
        .querySelectorAll("[data-view-link]")
        .forEach((link) => link.classList.toggle("is-active", link.dataset.viewLink === page));
}

/** 画面イベント、認証状態、初期データを設定してスコアブックを起動します。 */
async function init() {
    if (!claims()) {
        location.replace("index.html");
        return;
    }
    document.body.classList.remove("auth-pending");
    document.getElementById("memberViewNote").hidden = isAdmin();
    if (!isAdmin())
        [
            "teamForm",
            "playerForm",
            "gameForm",
            "newTeamButton",
            "deleteTeamButton",
            "csvImportForm",
        ].forEach((id) => document.getElementById(id).classList.add("viewer-hidden"));
    applyView();
    if (!isAdmin()) {
        document.getElementById("newGameCard").hidden = true;
        document.querySelector(".csv-import-panel").classList.add("viewer-hidden");
    }
    const date = qs.get("date");
    document.getElementById("gameDate").value = date || new Date().toISOString().slice(0, 10);
    document.getElementById("importGameDate").value = new Date().toISOString().slice(0, 10);
    const seasonSelect = document.getElementById("seasonSelect");
    seasonSelect.innerHTML = Array.from({ length: 21 }, (_, i) => new Date().getFullYear() - i)
        .map((year) => `<option value="${year}">${year}年</option>`)
        .join("");
    seasonSelect.value = String(seasonYear);
    document.getElementById("rankingSeasonLabel").textContent =
        `${seasonYear}年シーズン · 確定試合の累計`;
    try {
        await loadEverything();
    } catch (e) {
        toast(`${e.message}。DynamoDB設定を確認してください。`);
    }
    clockInterval = setInterval(drawGame, 250);
}
init();
