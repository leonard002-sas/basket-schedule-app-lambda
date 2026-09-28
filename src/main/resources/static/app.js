/** 認証済みデータの読み込み、予定表示、管理者操作をまとめるカレンダー画面です。 */
const API_URL = "https://7yxh3p2c5swyx6ajv45ldmiswe0tirop.lambda-url.ap-northeast-1.on.aws/";

const UPLOAD_API_URL = "https://gg5d4xxwdpfjdesh2n5vyxqm5q0mnwii.lambda-url.ap-northeast-1.on.aws/";

// ========================================
// 施設API
// ========================================

const FACILITY_API_URL =
    "https://wybpjskbmgh6jbra4647ethnhm0pkulf.lambda-url.ap-northeast-1.on.aws/";

const scheduleElement = document.getElementById("scheduleList");

const uploadButton = document.getElementById("uploadButton");

const imageInput = document.getElementById("imageFile");

const uploadStatus = document.getElementById("status");

const calendarElement = document.getElementById("calendar");

const calendarMonthElement = document.getElementById("calendarMonth");

const prevMonthButton = document.getElementById("prevMonth");

const nextMonthButton = document.getElementById("nextMonth");

const calendarExportStatus = document.getElementById("calendarExportStatus");

let schedules = [];
let announcements = [];

// 施設マスタ
let facilities = [];

// 現在開いている予定
let currentScheduleDetail = null;

// ========================================
// 現在表示している月
// ========================================

const initialToday = new Date();
let currentYear = initialToday.getFullYear();
let currentMonth = initialToday.getMonth() + 1;

// ========================================
// 祝日データ
// ========================================

// 年ごとに取得した祝日を保存
// 一度取得した年は再度APIを呼ばない
const holidayCache = {};
const holidayRequests = {};

// ========================================
// 祝日取得
// ========================================

async function loadHolidays(year) {
    // すでに取得済みならAPIを呼ばない
    if (holidayCache[year]) {
        return;
    }

    if (holidayRequests[year]) {
        return holidayRequests[year];
    }

    holidayRequests[year] = (async () => {
        try {
            const response = await fetch(`https://holidays-jp.shogo82148.com/${year}`);

            if (!response.ok) {
                throw new Error("祝日APIエラー: " + response.status);
            }

            const data = await response.json();
            holidayCache[year] = {};
            data.holidays.forEach((holiday) => {
                holidayCache[year][holiday.date] = holiday.name;
            });

            console.log(`${year}年の祝日を取得しました`, holidayCache[year]);
        } catch (error) {
            console.error(`${year}年の祝日取得に失敗しました`, error);
            // API取得に失敗してもカレンダー自体は表示できるようにする
            holidayCache[year] = {};
        }
    })();

    return holidayRequests[year];
}

// ========================================
// 日付キー作成
// ========================================

async function loadSchedule() {
    try {
        const response = await authenticatedFetch(API_URL, {
            method: "GET",
        });

        if (!response.ok) {
            throw new Error("APIエラー: " + response.status);
        }

        const payload = await response.json();
        schedules = Array.isArray(payload) ? payload : payload.items || [];
        announcements = Array.isArray(payload) ? [] : payload.announcements || [];
        renderAnnouncements();

        schedules.sort((a, b) => new Date(a.startDateTime) - new Date(b.startDateTime));

        if (exportMonthCalendarButton) {
            exportMonthCalendarButton.disabled = false;
        }

        displayCalendar();
        displaySchedule();
        renderHomeAgenda();
        renderVideoArchive();
    } catch (error) {
        console.error(error);

        scheduleElement.innerHTML = '<p class="error">予定の取得に失敗しました。</p>';
    }
}

/** 画面上で管理者用の登録操作を表示するか、確認済み情報から判定します。 */
function isCalendarAdmin() {
    return (getValidIdTokenClaims()?.["cognito:groups"] || []).includes("admins");
}

const cognitoDomain = "https://ap-northeast-1cd5fxlwj3.auth.ap-northeast-1.amazoncognito.com";

const clientId = "3mr9ep2rosop9ratlg1l3bta70";

const redirectUri = "https://d13o4oynf3jxlu.cloudfront.net";

/** 期限切れでないIDトークンのクレームを画面表示用に読み取ります。 */
function getValidIdTokenClaims() {
    const token = localStorage.getItem("id_token");
    if (!token) {
        return null;
    }

    try {
        const encodedPayload = token.split(".")[1];
        if (!encodedPayload) {
            throw new Error("IDトークンの形式が不正です");
        }

        const base64 = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
        const payload = JSON.parse(atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4)));

        if (!payload.exp || payload.exp * 1000 <= Date.now()) {
            throw new Error("IDトークンの有効期限が切れています");
        }
        return payload;
    } catch (error) {
        localStorage.removeItem("id_token");
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        return null;
    }
}

/** CognitoのIDトークンを付けてAPIを呼び、認証切れを共通処理します。 */
async function authenticatedFetch(url, options = {}) {
    const token = localStorage.getItem("id_token");
    if (!getValidIdTokenClaims() || !token) {
        updateAuthUI();
        throw new Error("ログインしてください。");
    }

    return fetch(url, {
        ...options,
        headers: {
            ...(options.headers || {}),
            Authorization: `Bearer ${token}`,
        },
    });
}

// ========================================
// Cognito認証コード → トークン
// ========================================

async function handleCognitoCallback() {
    const params = new URLSearchParams(window.location.search);

    const code = params.get("code");

    // ログイン後でなければ何もしない
    if (!code) {
        return;
    }

    console.log("Cognito認証コードを取得しました");

    try {
        const response = await fetch(`${cognitoDomain}/oauth2/token`, {
            method: "POST",

            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },

            body: new URLSearchParams({
                grant_type: "authorization_code",

                client_id: clientId,

                code: code,

                redirect_uri: redirectUri,
            }),
        });

        const tokens = await response.json();

        if (!response.ok) {
            throw new Error(
                tokens.error_description || tokens.error || "トークン取得に失敗しました",
            );
        }

        // トークンを保存
        localStorage.setItem("id_token", tokens.id_token);
        localStorage.setItem("access_token", tokens.access_token);

        if (tokens.refresh_token) {
            localStorage.setItem("refresh_token", tokens.refresh_token);
        }

        console.log("Cognitoログイン成功");

        document.dispatchEvent(new Event("courtside:auth-changed"));

        updateAuthUI();

        console.log("=== updateAuthUI完了 ===");

        // URLから ?code=xxxxx を削除
        window.history.replaceState({}, document.title, window.location.pathname);
    } catch (error) {
        console.error("Cognito認証エラー:", error);
    }
}

// ========================================
// ログインボタン
// ========================================

const loginButton = document.getElementById("loginButton");

if (loginButton) {
    loginButton.addEventListener("click", () => {
        const loginUrl =
            `${cognitoDomain}/oauth2/authorize` +
            `?client_id=${clientId}` +
            `&response_type=code` +
            `&scope=openid+email+phone+aws.cognito.signin.user.admin` +
            `&redirect_uri=${encodeURIComponent(redirectUri)}` +
            `&lang=ja`;

        window.location.href = loginUrl;
    });
}

// ========================================
// ログイン状態・管理者権限を確認
// ========================================

function updateAuthUI() {
    const claims = getValidIdTokenClaims();
    const idToken = claims ? localStorage.getItem("id_token") : null;

    const calendarContent = document.getElementById("calendarContent");

    const loginRequiredMessage = document.getElementById("loginRequiredMessage");

    const loginButton = document.getElementById("loginButton");

    const registerButton = document.getElementById("registerButton");

    const mainNavigation = document.querySelector(".site-navigation");
    const accountMenu = document.getElementById("accountMenu");

    // =========================
    // 未ログイン
    // =========================

    if (!idToken) {
        if (mainNavigation) mainNavigation.hidden = true;
        if (accountMenu) accountMenu.hidden = true;

        if (calendarContent) {
            calendarContent.hidden = true;
        }

        if (loginRequiredMessage) {
            loginRequiredMessage.hidden = false;
        }

        if (loginButton) {
            loginButton.style.display = "inline-block";
        }

        if (registerButton) {
            registerButton.style.display = "inline-block";
        }

        return;
    }

    if (calendarContent) {
        calendarContent.hidden = false;
    }
    if (mainNavigation) mainNavigation.hidden = false;
    if (accountMenu) accountMenu.hidden = false;

    if (loginRequiredMessage) {
        loginRequiredMessage.hidden = true;
    }

    // =========================
    // ログイン済み
    // =========================

    if (loginButton) {
        loginButton.style.display = "none";
    }

    if (registerButton) {
        registerButton.style.display = "none";
    }

    // =========================
    // 管理者判定
    // =========================

    try {
        const isAdmin = isCalendarAdmin();
        document
            .querySelectorAll(
                '.site-navigation [data-app-nav="schedule"], .site-navigation [data-app-nav="facility"]',
            )
            .forEach((link) => {
                link.hidden = !isAdmin;
            });

        // =========================
        // 管理者の場合
        // =========================
    } catch (error) {
        console.error("IDトークン解析エラー:", error);

        if (mainNavigation) mainNavigation.hidden = true;
        if (accountMenu) accountMenu.hidden = true;
    }
}

// ========================================
// 新規登録ボタン
// ========================================

const registerButton = document.getElementById("registerButton");

if (registerButton) {
    registerButton.addEventListener("click", () => {
        const signupUrl =
            `${cognitoDomain}/signup` +
            `?client_id=${clientId}` +
            `&response_type=code` +
            `&scope=openid+email+phone+aws.cognito.signin.user.admin` +
            `&redirect_uri=${encodeURIComponent(redirectUri)}`;

        window.location.href = signupUrl;
    });
}

// ========================================
// 初期表示
// ========================================

handleCognitoCallback().then(async () => {
    console.log("=== 初期表示処理開始 ===");

    updateAuthUI();

    if (!getValidIdTokenClaims()) {
        return;
    }

    if (location.hash) {
        requestAnimationFrame(() => {
            document
                .getElementById(decodeURIComponent(location.hash.slice(1)))
                ?.scrollIntoView({ block: "start" });
        });
    }

    displayCalendar();
    const yearToLoad = currentYear;
    loadHolidays(yearToLoad).then(() => {
        if (currentYear === yearToLoad) displayCalendar();
    });

    await Promise.all([loadSchedule(), loadFacilities()]);

    console.log("=== 初期表示処理完了 ===");
});

// ========================================
// 予定詳細ダイアログ
// ========================================
