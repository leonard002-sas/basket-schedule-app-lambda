const SCORE_API = window.BasketScheduleConfig.apiUrl;
const SCHEDULE_API = SCORE_API;
const token = localStorage.getItem("id_token");
const qs = new URLSearchParams(location.search);
const currentScoreView = qs.get("view") || (qs.has("date") ? "games" : "teams");
document.querySelectorAll(".site-navigation [data-app-nav]").forEach((link) => {
    if (link.dataset.appNav === currentScoreView) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
});
if (!isAdmin()) {
    document
        .querySelectorAll(
            '.site-navigation [data-app-nav="schedule"], .site-navigation [data-app-nav="facility"], .site-navigation [data-app-nav="announcements"]',
        )
        .forEach((link) => {
            link.hidden = true;
        });
}

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
let selectedParticipantIds = null;
let selectedParticipantTeamId = "";

function claims() {
    try {
        return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    } catch {
        return null;
    }
}
function isAdmin() {
    const groups = claims()?.["cognito:groups"] || [];
    return groups.includes("admins") || groups.includes("root-admins");
}
function api(resource, method = "GET", body = null, extra = {}) {
    const params = new URLSearchParams({
        feature: "basketball",
        resource,
        ...(activeTeamId ? { teamId: activeTeamId } : {}),
        ...extra,
    });
    return fetch(`${SCORE_API}?${params}`, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    })
        .then(async (r) => {
            const d = await r.json();
            if (!r.ok)
                throw new Error(
                    `${d.message || `APIエラー ${r.status}`}${d.code ? ` (${d.code})` : ""}`,
                );
            return d;
        })
        .catch((e) => {
            if (e instanceof TypeError)
                throw new Error("APIに接続できません。しばらく待って再読み込みしてください。");
            throw e;
        });
}
function toast(message) {
    const el = document.getElementById("scorebookToast");
    el.textContent = message;
    el.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-visible"), 2500);
}
function playerId(item) {
    return item.playerId || String(item.sk || "").replace(/^PLAYER#/, "");
}
function nameFor(id) {
    return players.find((p) => p.playerId === id)?.name || "選手";
}
function statRows(data) {
    return data?.items || [];
}
function ratio(a, b) {
    return b ? `${((a / b) * 100).toFixed(1)}%` : "—";
}
function eff(s) {
    return (
        (s.points || 0) +
        (s.REB || 0) +
        (s.AST || 0) +
        (s.STL || 0) +
        (s.BLK || 0) -
        ((s.FGA || 0) - (s.FGM || 0)) -
        ((s.FTA || 0) - (s.FTM || 0)) -
        (s.TO || 0)
    );
}

async function loadEverything() {
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
    renderGameParticipantChoices();
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

function renderGameParticipantChoices() {
    const activePlayers = players.filter((player) => player.active !== false);
    if (selectedParticipantTeamId !== activeTeamId || selectedParticipantIds === null) {
        selectedParticipantTeamId = activeTeamId;
        selectedParticipantIds = activePlayers.map((player) => player.playerId);
    }
    const selectedIds = new Set(selectedParticipantIds);
    document.getElementById("gameParticipantChoices").innerHTML = activePlayers.length
        ? activePlayers
              .map(
                  (player) =>
                      `<label class="game-participant-choice"><input type="checkbox" value="${escapeAttr(player.playerId)}" ${selectedIds.has(player.playerId) ? "checked" : ""}><span class="game-participant-number">#${Number(player.number) || "?"}</span><span class="game-participant-name">${escapeHtml(player.name)}</span><span class="game-participant-position">${escapeHtml(player.position || "—")}</span></label>`,
              )
              .join("")
        : "<span class='field-hint'>先にチームメンバーを登録してください。</span>";
    updateParticipantSelectionCount();
}

function updateParticipantSelectionCount() {
    const count = document.querySelectorAll("#gameParticipantChoices input:checked").length;
    document.getElementById("participantSelectionCount").textContent =
        `${count}人を選択中・5人以上必要です`;
}

function renderLineupChoices(eligiblePlayers) {
    document.getElementById("lineupChoices").innerHTML =
        eligiblePlayers
            .map(
                (player) =>
                    `<label class="lineup-choice"><input type="checkbox" value="${escapeAttr(player.playerId)}"> #${Number(player.number) || "?"} ${escapeHtml(player.name)}</label>`,
            )
            .join("") ||
        "<span class='field-hint'>試合の出場予定メンバーを先に選択してください。</span>";
}

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

function renderSelectedPlayerPanel() {
    const panel = document.getElementById("selectedPlayerPanel");
    const player = players.find((p) => p.playerId === selectedPlayerId && p.active !== false);
    panel.hidden = !player;
    document.getElementById("playerSelectionHint").hidden = !!player;
    document.getElementById("selectedPlayerName").textContent = player
        ? `#${Number(player.number) || "—"} ${player.name} · ${player.position || "POS未設定"}`
        : "";
}

function scheduleId(item) {
    return `${item.scheduleMonth || ""}|${item.startDateTime || ""}`;
}
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

function renderLeaderboard(rows) {
    const body = document.getElementById("leaderboardBody");
    const rankedByPlayerId = new Map(rows.map((row) => [playerId(row), row]));
    players
        .filter((player) => player.active !== false)
        .forEach((player) => {
            if (!rankedByPlayerId.has(player.playerId))
                rankedByPlayerId.set(player.playerId, { playerId: player.playerId, GP: 0 });
        });
    leaderboardRows = [...rankedByPlayerId.values()];
    const metric = document.getElementById("rankingMetric")?.value || "points";
    const average = (stats, field) => {
        const appearances = Number(stats.GP) || 0;
        return appearances ? (Number(stats[field]) || 0) / appearances : null;
    };
    const metricValue = (stats) => {
        if (metric === "EFF") return eff(stats);
        if (metric === "PPG") return average(stats, "points") ?? -1;
        if (metric === "RPG") return average(stats, "REB") ?? -1;
        if (metric === "APG") return average(stats, "AST") ?? -1;
        if (metric === "MPG") {
            const appearances = Number(stats.GP) || 0;
            return appearances ? (Number(stats.minutesSeconds) || 0) / 60 / appearances : -1;
        }
        return Number(stats[metric]) || 0;
    };
    const sorted = [...leaderboardRows].sort((a, b) => metricValue(b) - metricValue(a));
    body.innerHTML = sorted
        .map((stats) => {
            const id = playerId(stats);
            const profile = players.find((player) => player.playerId === id) || {};
            const appearances = Number(stats.GP) || 0;
            const perGame = (field) => {
                const value = average(stats, field);
                return value === null ? "—" : value.toFixed(1);
            };
            const minutesPerGame = appearances
                ? ((Number(stats.minutesSeconds) || 0) / 60 / appearances).toFixed(1)
                : "—";
            const fga = Number(stats.FGA) || 0;
            const fgm = Number(stats.FGM) || 0;
            const twoAttempts = Number(stats["2PA"]) || 0;
            const twoMade = Number(stats["2PM"]) || 0;
            const threeAttempts = Number(stats["3PA"]) || 0;
            const threeMade = Number(stats["3PM"]) || 0;
            const freeAttempts = Number(stats.FTA) || 0;
            const freeMade = Number(stats.FTM) || 0;
            return `<tr><td><button type="button" class="trend-player-button" data-trend-player="${escapeAttr(id)}">${escapeHtml(nameFor(id))}</button></td><td>${escapeHtml(profile.position || "—")}</td><td>${appearances}</td><td>${Number(stats.W) || 0}-${Number(stats.L) || 0}-${Number(stats.D) || 0}</td><td>${Math.floor((Number(stats.minutesSeconds) || 0) / 60)}</td><td>${perGame("points")}</td><td>${perGame("REB")}</td><td>${perGame("AST")}</td><td>${minutesPerGame}</td><td>${Number(stats.points) || 0}</td><td>${Number(stats.REB) || 0}</td><td>${Number(stats.AST) || 0}</td><td>${Number(stats.STL) || 0}</td><td>${Number(stats.BLK) || 0}</td><td>${fgm}/${fga}</td><td>${ratio(fgm, fga)}</td><td>${twoMade}/${twoAttempts}</td><td>${ratio(twoMade, twoAttempts)}</td><td>${threeMade}/${threeAttempts}</td><td>${ratio(threeMade, threeAttempts)}</td><td>${freeMade}/${freeAttempts}</td><td>${ratio(freeMade, freeAttempts)}</td><td>${Number(stats.OREB) || 0}</td><td>${Number(stats.DREB) || 0}</td><td>${Number(stats.TO) || 0}</td><td>${Number(stats.PF) || 0}</td><td>${eff(stats)}</td></tr>`;
        })
        .join("");
    document.getElementById("leaderboardEmpty").hidden = sorted.length > 0;
}
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
function renderPlayerTrend() {
    const allRows = playerTrendRows;
    const rows = allRows.filter((row) => row.participation !== "DNP");
    const metric = document.getElementById("playerTrendMetric").value;
    const chart = document.getElementById("playerTrendChart");
    if (!rows.length) {
        chart.innerHTML = "<p class='empty-state'>今シーズンの出場記録はありません。</p>";
        document.getElementById("playerTrendGames").innerHTML = allRows
            .map(
                (row) =>
                    `<span class="trend-game-dnp"><strong>${escapeHtml(row.date || "")}</strong> vs ${escapeHtml(row.opponent || "?")} · DNP</span>`,
            )
            .join("");
        return;
    }
    const values = rows.map((row) =>
        metric === "minutesSeconds"
            ? Math.round((Number(row[metric]) || 0) / 60)
            : Number(row[metric]) || 0,
    );
    const max = Math.max(1, ...values);
    const width = 640;
    const height = 210;
    const padding = 30;
    const points = values.map((value, index) => ({
        x:
            padding +
            (rows.length === 1
                ? (width - 2 * padding) / 2
                : (index * (width - 2 * padding)) / (rows.length - 1)),
        y: height - padding - (value / max) * (height - 2 * padding),
        value,
    }));
    const path = points
        .map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`)
        .join(" ");
    chart.innerHTML = `<div class="trend-chart-scroll"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(nameFor(playerTrendId))}の出場試合スタッツ推移"><line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" class="trend-axis"/><path d="${path}" class="trend-line"/>${points.map((point, index) => `<circle cx="${point.x}" cy="${point.y}" r="5" class="trend-point"><title>${escapeHtml(rows[index].date)} ${escapeHtml(rows[index].opponent || "")}：${point.value}</title></circle>`).join("")}</svg></div><div class="trend-chart-caption"><span>${escapeHtml(rows[0].date || "")} · ${escapeHtml(rows[0].opponent || "")}</span><strong>最大 ${max}${metric === "minutesSeconds" ? "分" : ""}</strong><span>${escapeHtml(rows.at(-1).date || "")} · ${escapeHtml(rows.at(-1).opponent || "")}</span></div>`;
    document.getElementById("playerTrendGames").innerHTML = allRows
        .map((row) => {
            if (row.participation === "DNP")
                return `<span class="trend-game-dnp"><strong>${escapeHtml(row.date || "")}</strong> vs ${escapeHtml(row.opponent || "?")} · DNP</span>`;
            const value =
                metric === "minutesSeconds"
                    ? Math.round((Number(row[metric]) || 0) / 60)
                    : Number(row[metric]) || 0;
            return `<span><strong>${escapeHtml(row.date || "")}</strong> vs ${escapeHtml(row.opponent || "?")} · ${value}${metric === "minutesSeconds" ? "分" : ""}</span>`;
        })
        .join("");
}
function escapeHtml(v) {
    return String(v ?? "").replace(
        /[&<>"']/g,
        (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
}
function escapeAttr(v) {
    return escapeHtml(v);
}

function parseCsv(text) {
    const rows = [];
    let row = [],
        cell = "",
        quoted = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quoted) {
            if (c === '"' && text[i + 1] === '"') {
                cell += '"';
                i++;
            } else if (c === '"') quoted = false;
            else cell += c;
        } else if (c === '"') quoted = true;
        else if (c === ",") {
            row.push(cell);
            cell = "";
        } else if (c === "\n") {
            row.push(cell.replace(/\r$/, ""));
            rows.push(row);
            row = [];
            cell = "";
        } else cell += c;
    }
    if (cell.length || row.length) {
        row.push(cell.replace(/\r$/, ""));
        rows.push(row);
    }
    return rows;
}

function parseStatsCsv(text) {
    const rows = parseCsv(text);
    if (rows.length < 2) throw new Error("CSVにデータ行がありません。");
    const headers = rows[0].map((h) =>
        h
            .replace(/^\uFEFF/, "")
            .trim()
            .toUpperCase()
            .replace(/\s+/g, ""),
    );
    const findIndex = (...names) => headers.findIndex((h) => names.includes(h));
    const nameIndex = findIndex("PLAYER", "NAME", "選手", "選手名");
    if (nameIndex < 0) throw new Error("PLAYER（選手名）列が見つかりません。");
    const aliases = {
        PTS: ["PTS", "POINTS"],
        REB: ["REB", "REBOUNDS"],
        AST: ["AST", "ASSISTS"],
        STL: ["STL", "STEALS"],
        BLK: ["BLK", "BLOCKS"],
        FGM: ["FGM"],
        FGA: ["FGA"],
        "2PM": ["2PM"],
        "2PA": ["2PA"],
        "3PM": ["3PM"],
        "3PA": ["3PA"],
        FTM: ["FTM"],
        FTA: ["FTA"],
        OREB: ["OREB"],
        DREB: ["DREB"],
        TO: ["TO", "TOV"],
        PF: ["PF"],
    };
    const indexes = Object.fromEntries(
        Object.entries(aliases).map(([key, names]) => [key, findIndex(...names)]),
    );
    const numberIndex = findIndex("NUMBER", "NO", "背番号"),
        positionIndex = findIndex("POS", "POSITION", "ポジション");
    const dnpIndex = findIndex("DNP", "DIDNOTPLAY", "DIDNOTPARTICIPATE");
    const playedIndex = findIndex("PLAYED", "PARTICIPATED");
    const gamesPlayedIndex = findIndex("GP", "GAMESPLAYED", "APPEARANCES");
    const numeric = (value) =>
        /^\s*\d+(?:\.0+)?\s*$/.test(value || "") ? Math.trunc(Number(value)) : null;
    const imported = [],
        seen = new Set();
    for (const cells of rows.slice(1)) {
        const name = (cells[nameIndex] || "").trim();
        if (!name || /^(TOTAL|合計|総計|計)$/i.test(name)) continue;
        const stats = {};
        let numericCount = 0;
        for (const [field, index] of Object.entries(indexes)) {
            if (index < 0) continue;
            const value = numeric(cells[index] || "");
            if (value !== null) {
                stats[field] = value;
                numericCount++;
            }
        }
        const didNotPlay =
            (dnpIndex >= 0 && /^(1|TRUE|YES|DNP)$/i.test((cells[dnpIndex] || "").trim())) ||
            (playedIndex >= 0 && /^(0|FALSE|NO)$/i.test((cells[playedIndex] || "").trim())) ||
            (gamesPlayedIndex >= 0 && numeric(cells[gamesPlayedIndex] || "") === 0);
        if (!numericCount && !didNotPlay) continue;
        const key = name.toLocaleLowerCase();
        if (seen.has(key))
            throw new Error(`「${name}」が複数行あります。選手を1行にまとめてください。`);
        seen.add(key);
        imported.push({
            name,
            number: numberIndex < 0 ? 0 : numeric(cells[numberIndex] || "") || 0,
            position: positionIndex < 0 ? "" : (cells[positionIndex] || "").trim(),
            stats,
        });
    }
    if (!imported.length)
        throw new Error(
            "選手のスタッツ行を読み取れませんでした。PLAYER列とスタッツ列を確認してください。",
        );
    return imported;
}

function csvCell(value) {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
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
        const gameRoster = Array.isArray(currentGame.rosterPlayerIds)
            ? new Set(currentGame.rosterPlayerIds)
            : new Set(players.map((player) => player.playerId));
        renderLineupChoices(
            players.filter((player) => player.active !== false && gameRoster.has(player.playerId)),
        );
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

function remainingNow() {
    const base = Number(currentGame?.remainingSeconds) || 0;
    return currentGame?.clockRunning
        ? Math.max(
              0,
              base -
                  (Math.floor(Date.now() / 1000) -
                      (Number(currentGame.clockStartedAt) || Math.floor(Date.now() / 1000))),
          )
        : base;
}
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
    const recordedPlayerIds = new Set(statRows(currentGame.players).map(playerId));
    const dnpRows = (currentGame.rosterPlayerIds || [])
        .filter((id) => !recordedPlayerIds.has(id))
        .map((id) => ({ playerId: id, participation: "DNP" }));
    const gameRows = [...statRows(currentGame.players), ...dnpRows].sort(
        (a, b) => (Number(b.points) || 0) - (Number(a.points) || 0),
    );
    document.getElementById("gameBoxscoreBody").innerHTML = gameRows
        .map((stats) => {
            const id = playerId(stats);
            const profile = players.find((player) => player.playerId === id) || {};
            const fga = Number(stats.FGA) || 0;
            const fgm = Number(stats.FGM) || 0;
            const twoAttempts = Number(stats["2PA"]) || 0;
            const twoMade = Number(stats["2PM"]) || 0;
            const threeAttempts = Number(stats["3PA"]) || 0;
            const threeMade = Number(stats["3PM"]) || 0;
            const freeAttempts = Number(stats.FTA) || 0;
            const freeMade = Number(stats.FTM) || 0;
            const didNotPlay = stats.participation === "DNP";
            return `<tr class="${didNotPlay ? "is-dnp" : ""}"><td><b>${escapeHtml(nameFor(id))}</b></td><td>${escapeHtml(profile.position || "—")}</td><td>${didNotPlay ? "DNP" : "出場"}</td><td>${Math.floor((Number(stats.minutesSeconds) || 0) / 60)}</td><td>${Number(stats.points) || 0}</td><td>${Number(stats.REB) || 0}</td><td>${Number(stats.AST) || 0}</td><td>${Number(stats.STL) || 0}</td><td>${Number(stats.BLK) || 0}</td><td>${fgm}/${fga}</td><td>${ratio(fgm, fga)}</td><td>${twoMade}/${twoAttempts}</td><td>${ratio(twoMade, twoAttempts)}</td><td>${threeMade}/${threeAttempts}</td><td>${ratio(threeMade, threeAttempts)}</td><td>${freeMade}/${freeAttempts}</td><td>${ratio(freeMade, freeAttempts)}</td><td>${Number(stats.OREB) || 0}</td><td>${Number(stats.DREB) || 0}</td><td>${Number(stats.TO) || 0}</td><td>${Number(stats.PF) || 0}</td><td>${eff(stats)}</td></tr>`;
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

async function refreshGame() {
    currentGame = await api("game", "GET", null, { gameId: currentGame.gameId });
    drawGame();
}
async function updateClock(command) {
    const r = await api("clock", "PUT", { gameId: currentGame.gameId, command });
    Object.assign(currentGame, r);
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
document.getElementById("gameParticipantChoices").addEventListener("change", () => {
    selectedParticipantIds = [
        ...document.querySelectorAll("#gameParticipantChoices input:checked"),
    ].map((input) => input.value);
    updateParticipantSelectionCount();
});
document.getElementById("selectAllParticipants").addEventListener("click", () => {
    document.querySelectorAll("#gameParticipantChoices input").forEach((input) => {
        input.checked = true;
    });
    selectedParticipantIds = players
        .filter((player) => player.active !== false)
        .map((player) => player.playerId);
    updateParticipantSelectionCount();
});
document.getElementById("clearParticipants").addEventListener("click", () => {
    document.querySelectorAll("#gameParticipantChoices input").forEach((input) => {
        input.checked = false;
    });
    selectedParticipantIds = [];
    updateParticipantSelectionCount();
});
document.getElementById("gameForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!activeTeamId) {
        toast("先にチームを登録してください");
        return;
    }
    const participantIds = [
        ...document.querySelectorAll("#gameParticipantChoices input:checked"),
    ].map((input) => input.value);
    if (participantIds.length < 5) {
        toast("今回の出場予定メンバーを5人以上選択してください");
        return;
    }
    try {
        const body = {
            date: document.getElementById("gameDate").value,
            opponent: document.getElementById("opponent").value.trim(),
            quarterMinutes: Number(document.getElementById("quarterMinutes").value) || 10,
            participantIds,
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
        selectedParticipantIds = null;
        selectedParticipantTeamId = "";
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
document.getElementById("seasonSelect").addEventListener("change", () => {
    if (playerTrendId) document.getElementById("playerTrendPanel").hidden = true;
});
document.getElementById("gameGrouping").addEventListener("change", renderGames);
document.getElementById("exportGamesButton").addEventListener("click", exportGamesCsv);
document.getElementById("seasonSelect").addEventListener("change", async (e) => {
    seasonYear = Number(e.target.value) || new Date().getFullYear();
    document.getElementById("rankingSeasonLabel").textContent =
        `${seasonYear}年シーズン · 確定試合の累計`;
    try {
        await loadEverything();
    } catch (err) {
        toast(err.message);
    }
});
document.getElementById("exportStatsButton").addEventListener("click", downloadSeasonCsv);
document.getElementById("csvImportForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const status = document.getElementById("csvImportStatus"),
        file = document.getElementById("statsCsvFile").files[0];
    if (!file) return;
    status.textContent = "CSVを読み込んでいます…";
    try {
        const text = await file.text();
        const importedPlayers = parseStatsCsv(text);
        const body = {
            date: document.getElementById("importGameDate").value,
            opponent: document.getElementById("importOpponent").value.trim(),
            players: importedPlayers,
        };
        const opponentScore = document.getElementById("importOpponentScore").value;
        if (opponentScore !== "") body.opponentScore = Number(opponentScore);
        seasonYear = Number(body.date.slice(0, 4));
        const seasonSelect = document.getElementById("seasonSelect");
        if (![...seasonSelect.options].some((option) => Number(option.value) === seasonYear))
            seasonSelect.add(new Option(`${seasonYear}年`, String(seasonYear)));
        seasonSelect.value = String(seasonYear);
        document.getElementById("rankingSeasonLabel").textContent =
            `${seasonYear}年シーズン · 確定試合の累計`;
        const result = await api("import-game", "PUT", body);
        await loadEverything();
        status.textContent = `過去試合を取り込みました。${result.playersImported}名の記録を${seasonYear}年ランキングに反映しました。`;
        e.target.reset();
    } catch (err) {
        status.textContent = err.message;
    }
});

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
        .querySelectorAll(".site-navigation [data-app-nav]")
        .forEach((link) => link.classList.toggle("is-active", link.dataset.appNav === page));
}

async function init() {
    if (!token) {
        location.replace("index.html");
        return;
    }
    document.body.style.display = "block";
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
