const API_URL =
    "https://7yxh3p2c5swyx6ajv45ldmiswe0tirop.lambda-url.ap-northeast-1.on.aws/";

const UPLOAD_API_URL =
    "https://gg5d4xxwdpfjdesh2n5vyxqm5q0mnwii.lambda-url.ap-northeast-1.on.aws/";

// ========================================
// 施設API
// ========================================

const FACILITY_API_URL =
    "https://wybpjskbmgh6jbra4647ethnhm0pkulf.lambda-url.ap-northeast-1.on.aws/";
	
const scheduleElement =
    document.getElementById("scheduleList");

const uploadButton =
    document.getElementById("uploadButton");

const imageInput =
    document.getElementById("imageFile");

const uploadStatus =
    document.getElementById("status");

const calendarElement =
    document.getElementById("calendar");

const calendarMonthElement =
    document.getElementById("calendarMonth");

const prevMonthButton =
    document.getElementById("prevMonth");

const nextMonthButton =
    document.getElementById("nextMonth");


let schedules = [];

// 施設マスタ
let facilities = [];

// 現在開いている予定
let currentScheduleDetail = null;


// ========================================
// 現在表示している月
// ========================================

let currentYear = 2026;
let currentMonth = 8;


// ========================================
// 祝日データ
// ========================================

// 年ごとに取得した祝日を保存
// 一度取得した年は再度APIを呼ばない
const holidayCache = {};


// ========================================
// 祝日取得
// ========================================

async function loadHolidays(year) {

    // すでに取得済みならAPIを呼ばない
    if (holidayCache[year]) {
        return;
    }

    try {

        const response = await fetch(
            `https://holidays-jp.shogo82148.com/${year}`
        );

        if (!response.ok) {
            throw new Error(
                "祝日APIエラー: " + response.status
            );
        }

        const data = await response.json();

        holidayCache[year] = {};

        data.holidays.forEach(holiday => {

            holidayCache[year][holiday.date] =
                holiday.name;

        });

        console.log(
            `${year}年の祝日を取得しました`,
            holidayCache[year]
        );

    } catch (error) {

        console.error(
            `${year}年の祝日取得に失敗しました`,
            error
        );

        // API取得に失敗しても
        // カレンダー自体は表示できるようにする
        holidayCache[year] = {};
    }
}


// ========================================
// 日付キー作成
// ========================================

function getDateKey(year, month, day) {

    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

}


// ========================================
// 予定取得
// ========================================

async function loadSchedule() {

    try {

        const response =
            await fetch(API_URL, {
                method: "GET"
            });

        if (!response.ok) {

            throw new Error(
                "APIエラー: " + response.status
            );
        }

        schedules =
            await response.json();

        schedules.sort(
            (a, b) =>
                new Date(a.startDateTime) -
                new Date(b.startDateTime)
        );

        await loadHolidays(currentYear);

        displayCalendar();
        displaySchedule();

    } catch (error) {

        console.error(error);

        scheduleElement.innerHTML =
            '<p class="error">予定の取得に失敗しました。</p>';
    }
}


// ========================================
// カレンダー表示
// ========================================

async function displayCalendar() {

    // 現在の年の祝日を取得

    await loadHolidays(currentYear);


    calendarElement.innerHTML = "";

    calendarMonthElement.textContent =
        `${currentYear}年${currentMonth}月`;


    // ========================================
    // 曜日
    // ========================================

    const weekdays = [
        "日",
        "月",
        "火",
        "水",
        "木",
        "金",
        "土"
    ];


    weekdays.forEach(day => {

        const element =
            document.createElement("div");

        element.className = "weekday";

        element.textContent = day;

        calendarElement.appendChild(element);

    });


    // ========================================
    // 月初の曜日
    // ========================================

    const firstDay =
        new Date(
            currentYear,
            currentMonth - 1,
            1
        ).getDay();


    // ========================================
    // 月の日数
    // ========================================

    const daysInMonth =
        new Date(
            currentYear,
            currentMonth,
            0
        ).getDate();


    // ========================================
    // 月初までの空白
    // ========================================

    for (
        let i = 0;
        i < firstDay;
        i++
    ) {

        const element =
            document.createElement("div");

        element.className =
            "calendar-day empty-day";

        calendarElement.appendChild(element);

    }


    // ========================================
    // 日付
    // ========================================

    for (
        let day = 1;
        day <= daysInMonth;
        day++
    ) {

        const element =
            document.createElement("div");

        element.className =
            "calendar-day";


        const dayDate =
            new Date(
                currentYear,
                currentMonth - 1,
                day
            );


        const dayOfWeek =
            dayDate.getDay();


        const dateKey =
            getDateKey(
                currentYear,
                currentMonth,
                day
            );


        // ========================================
        // 土曜日
        // ========================================

        if (dayOfWeek === 6) {

            element.classList.add(
                "saturday"
            );

        }


        // ========================================
        // 日曜日
        // ========================================

        if (dayOfWeek === 0) {

            element.classList.add(
                "sunday"
            );

        }

        // ========================================
        // 今日
        // ========================================

        const today =
            new Date();


        if (
            today.getFullYear() === currentYear &&
            today.getMonth() === currentMonth - 1 &&
            today.getDate() === day
        ) {

            element.classList.add(
                "today"
            );

        }


        // ========================================
        // 日付番号
        // ========================================

        const dayNumber =
            document.createElement("div");

        dayNumber.className =
            "day-number";

        dayNumber.textContent =
            day;

        element.appendChild(dayNumber);


        // ========================================
        // 祝日
        // ========================================

        const holidayName =
            holidayCache[currentYear]?.[dateKey];

        if (holidayName) {

            element.classList.add("holiday");

            const holidayElement =
                document.createElement("span");

            holidayElement.className =
                "holiday-name";

            holidayElement.textContent =
                holidayName;

            dayNumber.appendChild(
                holidayElement
            );
        }


        // ========================================
        // この日の予定
        // ========================================

        const daySchedules =
            schedules.filter(schedule => {

                const date =
                    new Date(
                        schedule.startDateTime
                    );

                return (
                    date.getFullYear() === currentYear &&
                    date.getMonth() === currentMonth - 1 &&
                    date.getDate() === day
                );

            });


        // ========================================
        // 予定表示
        // ========================================

        daySchedules.forEach(schedule => {

            const event =
                document.createElement("div");

            event.className =
                "event-dot";

            const start =
                new Date(
                    schedule.startDateTime
                );

            const end =
                new Date(
                    schedule.endDateTime
                );

            event.textContent =
                `${formatTime(start)}～${formatTime(end)}`;


            // ========================================
            // 予定クリック
            // ========================================

            event.addEventListener(
                "click",
                (clickEvent) => {

                    // 日付セルのクリック処理を止める
                    clickEvent.stopPropagation();

                    showScheduleDetail(
                        schedule
                    );

                }
            );


            // マウスカーソル
            event.style.cursor =
                "pointer";


            element.appendChild(event);

        });


        // ========================================
        // 日付クリック
        // ========================================

        element.addEventListener(
            "click",
            () => {

                showDaySchedule(
                    currentYear,
                    currentMonth,
                    day
                );

            }
        );


        calendarElement.appendChild(element);

    }

}


// ========================================
// クリックした日の予定へ移動
// ========================================

function showDaySchedule(
    year,
    month,
    day
) {

    const daySchedules =
        schedules.filter(schedule => {

            const date =
                new Date(
                    schedule.startDateTime
                );

            return (
                date.getFullYear() === year &&
                date.getMonth() === month - 1 &&
                date.getDate() === day
            );

        });


    if (daySchedules.length === 0) {
        return;
    }


    const target =
        document.querySelector(
            "#scheduleList"
        );


    target.scrollIntoView({
        behavior: "smooth"
    });

}


// ========================================
// 月変更
// ========================================

prevMonthButton.addEventListener(
    "click",
    async () => {

        currentMonth--;

        if (currentMonth === 0) {

            currentMonth = 12;
            currentYear--;

        }

        // 移動先の年の祝日を取得

        await loadHolidays(currentYear);

        displayCalendar();

    }
);


nextMonthButton.addEventListener(
    "click",
    async () => {

        currentMonth++;

        if (currentMonth === 13) {

            currentMonth = 1;
            currentYear++;

        }

        // 移動先の年の祝日を取得

        await loadHolidays(currentYear);

        displayCalendar();

    }
);


// ========================================
// 今後の予定表示
// ========================================

function displaySchedule() {

    if (schedules.length === 0) {

        scheduleElement.innerHTML =
            "<p>予定がありません。</p>";

        return;

    }


    // 今日の日付

    const today =
        new Date();

    today.setHours(
        0,
        0,
        0,
        0
    );


    // 今日以降の予定だけ取得

    const upcomingSchedules =
        schedules.filter(schedule => {

            const start =
                new Date(
                    schedule.startDateTime
                );

            return start >= today;

        });


    if (upcomingSchedules.length === 0) {

        scheduleElement.innerHTML =
            "<p>今後の予定はありません。</p>";

        return;

    }


    scheduleElement.innerHTML = "";


    upcomingSchedules.forEach(schedule => {

        const start =
            new Date(
                schedule.startDateTime
            );

        const end =
            new Date(
                schedule.endDateTime
            );


        const eventElement =
            document.createElement("div");

        eventElement.className =
            "upcoming-schedule";


        eventElement.innerHTML = `
            <div class="upcoming-date">
                ${formatDate(start)}
            </div>

            <div class="upcoming-time">
                ${formatTime(start)}
                ～ 
                ${formatTime(end)}
            </div>

            <div class="upcoming-time-zone">
                ${schedule.timeZone}
            </div>
        `;


        scheduleElement.appendChild(
            eventElement
        );

    });

}


// ========================================
// 日付フォーマット
// ========================================

function formatDate(date) {

    const weekdays = [
        "日",
        "月",
        "火",
        "水",
        "木",
        "金",
        "土"
    ];


    return `${date.getFullYear()}年
            ${date.getMonth() + 1}月
            ${date.getDate()}日
            (${weekdays[date.getDay()]})`;

}


// ========================================
// 時刻フォーマット
// ========================================

function formatTime(date) {

    const hours =
        String(date.getHours())
            .padStart(2, "0");


    const minutes =
        String(date.getMinutes())
            .padStart(2, "0");


    return `${hours}:${minutes}`;

}




// ========================================
// 画像アップロード
// ========================================
if (uploadButton) {

    uploadButton.addEventListener(
        "click",
        async () => {

            const file =
                imageInput.files[0];

            if (!file) {

                alert(
                    "画像を選択してください。"
                );

                return;
            }


            try {

                uploadButton.disabled =
                    true;

                uploadStatus.textContent =
                    "アップロード準備中...";


                // ========================================
                // ① Presigned URL取得
                // ========================================

                const response =
                    await fetch(
                        UPLOAD_API_URL,
                        {
                            method: "POST",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body: JSON.stringify({

                                fileName:
                                    file.name,

                                contentType:
                                    file.type

                            })
                        }
                    );


                if (!response.ok) {

                    throw new Error(
                        "Upload APIエラー: "
                        + response.status
                    );

                }


                const data =
                    await response.json();


                // ========================================
                // ② S3へ直接アップロード
                // ========================================

                uploadStatus.textContent =
                    "画像をS3へアップロード中...";


                const uploadResponse =
                    await fetch(
                        data.uploadUrl,
                        {
                            method: "PUT",

                            headers: {
                                "Content-Type":
                                    file.type
                            },

                            body: file
                        }
                    );


                if (!uploadResponse.ok) {

                    throw new Error(
                        "S3アップロードエラー: "
                        + uploadResponse.status
                    );

                }


                // ========================================
                // ③ 完了
                // ========================================

                uploadStatus.textContent =
                    "アップロード完了！解析中です。";


                alert(
                    "画像をアップロードしました。\n"
                    + "Geminiによる予定解析を開始します。"
                );


                imageInput.value = "";


            } catch (error) {

                console.error(
                    "画像アップロードエラー:",
                    error
                );


                uploadStatus.textContent =
                    "アップロードに失敗しました。";


                alert(
                    "アップロードに失敗しました。\n"
                    + error.message
                );


            } finally {

                uploadButton.disabled =
                    false;

            }

        }
    );

}


// ========================================
// Cognito認証
// ========================================

const cognitoDomain =
    "https://ap-northeast-1cd5fxlwj3.auth.ap-northeast-1.amazoncognito.com";

const clientId =
    "3mr9ep2rosop9ratlg1l3bta70";

const redirectUri =
    "https://d13o4oynf3jxlu.cloudfront.net";

// ========================================
// Cognito認証コード → トークン
// ========================================

async function handleCognitoCallback() {

    const params =
        new URLSearchParams(
            window.location.search
        );

    const code =
        params.get("code");

    // ログイン後でなければ何もしない
    if (!code) {
        return;
    }

    console.log(
        "Cognito認証コードを取得しました"
    );

    try {

        const response =
            await fetch(
                `${cognitoDomain}/oauth2/token`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/x-www-form-urlencoded"
                    },

                    body:
                        new URLSearchParams({
                            grant_type:
                                "authorization_code",

                            client_id:
                                clientId,

                            code:
                                code,

                            redirect_uri:
                                redirectUri
                        })
                }
            );

        const tokens =
            await response.json();

        console.log(
            "Cognitoトークン取得結果:",
            tokens
        );

        if (!response.ok) {

            throw new Error(
                tokens.error_description ||
                tokens.error ||
                "トークン取得に失敗しました"
            );
        }

        // トークンを保存
        console.log("=== トークン保存開始 ===");

        console.log("id_token:", tokens.id_token);
        console.log("access_token:", tokens.access_token);
        console.log("refresh_token:", tokens.refresh_token);

        localStorage.setItem("id_token", tokens.id_token);
        localStorage.setItem("access_token", tokens.access_token);

        if (tokens.refresh_token) {
            localStorage.setItem(
                "refresh_token",
                tokens.refresh_token
            );
        }

        console.log(
            "保存後 id_token:",
            localStorage.getItem("id_token")
        );

        console.log(
            "保存後 access_token:",
            localStorage.getItem("access_token")
        );

        console.log(
            "保存後 refresh_token:",
            localStorage.getItem("refresh_token")
        );

        console.log("=== トークン保存終了 ===");

        console.log(
            "Cognitoログイン成功"
        );

        console.log(
            "ログイン直後のid_token:",
            !!localStorage.getItem("id_token")
        );

        updateAuthUI();

        console.log(
            "=== updateAuthUI完了 ==="
        );

        // URLから ?code=xxxxx を削除
        window.history.replaceState(
            {},
            document.title,
            window.location.pathname
        );

    } catch (error) {

        console.error(
            "Cognito認証エラー:",
            error
        );

    }

}


// ========================================
// ログインボタン
// ========================================

const loginButton =
    document.getElementById("loginButton");

if (loginButton) {

    loginButton.addEventListener(
        "click",
        () => {

            const loginUrl =
                `${cognitoDomain}/login` +
                `?client_id=${clientId}` +
                `&response_type=code` +
                `&scope=openid+email+phone` +
                `&redirect_uri=${encodeURIComponent(redirectUri)}`;

            window.location.href =
                loginUrl;

        }
    );

}

// ========================================
// ログイン状態・管理者権限を確認
// ========================================

function updateAuthUI() {

    const idToken =
        localStorage.getItem("id_token");

    const loginButton =
        document.getElementById("loginButton");

    const logoutButton =
        document.getElementById("logoutButton");

    const registerButton =
        document.getElementById("registerButton");

    const scheduleRegisterButton =
        document.getElementById(
            "scheduleRegisterButton"
        );


    // =========================
    // 未ログイン
    // =========================

    if (!idToken) {

        if (loginButton) {

            loginButton.style.display =
                "inline-block";

        }

        if (logoutButton) {

            logoutButton.style.display =
                "none";

        }

        if (registerButton) {

            registerButton.style.display =
                "inline-block";

        }

        if (scheduleRegisterButton) {

            scheduleRegisterButton.style.display =
                "none";

        }

        return;
    }


    // =========================
    // ログイン済み
    // =========================

    if (loginButton) {

        loginButton.style.display =
            "none";

    }

    if (logoutButton) {

        logoutButton.style.display =
            "inline-block";

    }

    if (registerButton) {

        registerButton.style.display =
            "none";

    }


    // =========================
    // 管理者判定
    // =========================

    try {

        const payload =
            JSON.parse(
                atob(
                    idToken
                        .split(".")[1]
                        .replace(/-/g, "+")
                        .replace(/_/g, "/")
                )
            );

        console.log(
            "Cognitoユーザー情報:",
            payload
        );

        const groups =
            payload["cognito:groups"] || [];

        console.log(
            "Cognitoグループ:",
            groups
        );

        const isAdmin =
            groups.includes("admins");


        // =========================
        // 管理者の場合
        // =========================

        if (scheduleRegisterButton) {

            scheduleRegisterButton.style.display =
                isAdmin
                    ? "inline-block"
                    : "none";

        }

    } catch (error) {

        console.error(
            "IDトークン解析エラー:",
            error
        );

        if (scheduleRegisterButton) {

            scheduleRegisterButton.style.display =
                "none";

        }

    }

}

// ========================================
// ログアウトボタン
// ========================================

const logoutButton =
    document.getElementById("logoutButton");

if (logoutButton) {

    logoutButton.addEventListener(
        "click",
        () => {

            // ローカルのトークンを削除
            localStorage.removeItem("id_token");
            localStorage.removeItem("access_token");
            localStorage.removeItem("refresh_token");

            // Cognitoからログアウト
            const logoutUrl =
                `${cognitoDomain}/logout` +
                `?client_id=${clientId}` +
                `&logout_uri=${encodeURIComponent(redirectUri)}`;

            window.location.href =
                logoutUrl;
        }
    );
}

// ========================================
// 新規登録ボタン
// ========================================

const registerButton =
    document.getElementById("registerButton");

if (registerButton) {

    registerButton.addEventListener(
        "click",
        () => {

            const signupUrl =
                `${cognitoDomain}/signup` +
                `?client_id=${clientId}` +
                `&response_type=code` +
                `&scope=openid+email+phone` +
                `&redirect_uri=${encodeURIComponent(redirectUri)}`;

            window.location.href = signupUrl;
        }
    );
}


// ========================================
// 初期表示
// ========================================


handleCognitoCallback()
    .then(async () => {

        console.log(
            "=== 初期表示処理開始 ==="
        );

        updateAuthUI();

        console.log(
            "=== updateAuthUI完了 ==="
        );

        await loadFacilities();

        await loadSchedule();

        console.log("=== 初期表示処理完了 ===");

    });

// ========================================
// 予定表登録画面へ
// ========================================

const scheduleRegisterButton =
    document.getElementById("scheduleRegisterButton");

if (scheduleRegisterButton) {

    scheduleRegisterButton.addEventListener(
        "click",
        () => {

            window.location.href =
                "register.html";

        }
    );

}

// ========================================
// 予定詳細ダイアログ
// ========================================

const scheduleDetailModal =
    document.getElementById(
        "scheduleDetailModal"
    );

const closeScheduleDetailButton =
    document.getElementById(
        "closeScheduleDetailButton"
    );

const closeScheduleDetailButtonBottom =
    document.getElementById(
        "closeScheduleDetailButtonBottom"
    );

const editScheduleButton =
    document.getElementById(
        "editScheduleButton"
    );

const deleteScheduleButton =
    document.getElementById(
        "deleteScheduleButton"
    );

// ========================================
// 詳細ダイアログを閉じる
// ========================================

function closeScheduleDetail() {

    scheduleDetailModal.classList.remove(
        "active"
    );

}


// ========================================
// 詳細APIから予定取得
// ========================================
async function showScheduleDetail(
    schedule
) {

    try {

        const params =
            new URLSearchParams({

                scheduleMonth:
                    schedule.scheduleMonth,

                startDateTime:
                    schedule.startDateTime

            });


        const response =
            await fetch(
                `${API_URL}?${params.toString()}`,
                {
                    method: "GET"
                }
            );


        if (!response.ok) {

            throw new Error(
                "予定詳細APIエラー: "
                + response.status
            );

        }


        const detail =
            await response.json();

        console.log(
            "予定詳細:",
            detail
        );

        currentScheduleDetail = detail;


        // ========================================
        // 日時
        // ========================================

        const start =
            new Date(
                detail.startDateTime
            );

        const end =
            new Date(
                detail.endDateTime
            );


        document.getElementById(
            "detailDate"
        ).textContent =
            `${start.getFullYear()}年`
            + `${start.getMonth() + 1}月`
            + `${start.getDate()}日`;


        document.getElementById(
            "detailDayOfWeek"
        ).textContent =
            detail.dayOfWeek;


        document.getElementById(
            "detailStartTime"
        ).textContent =
            formatTime(start);


        document.getElementById(
            "detailEndTime"
        ).textContent =
            formatTime(end);


        // ========================================
        // 施設
        // ========================================

        document.getElementById(
            "detailFacilityName"
        ).textContent =
            detail.facilityName
            || "未設定";


        document.getElementById(
            "detailAddress"
        ).textContent =
            detail.address
            || "未設定";


        const facilityUrl =
            document.getElementById(
                "detailFacilityUrl"
            );


        if (detail.url) {

            facilityUrl.href =
                detail.url;

            facilityUrl.style.display =
                "inline";

        } else {

            facilityUrl.removeAttribute(
                "href"
            );

            facilityUrl.style.display =
                "none";

        }


        // ========================================
        // 管理者ボタン表示
        // ========================================

        const idToken =
            localStorage.getItem("id_token");

        let isAdmin = false;

        if (idToken) {

            try {

                const payload =
                    JSON.parse(
                        atob(
                            idToken
                                .split(".")[1]
                                .replace(/-/g, "+")
                                .replace(/_/g, "/")
                        )
                    );

                console.log(
                    "詳細画面のCognitoユーザー:",
                    payload
                );

                const groups =
                    payload["cognito:groups"] || [];

                console.log(
                    "詳細画面のCognitoグループ:",
                    groups
                );

                isAdmin =
                    Array.isArray(groups)
                    && groups.includes("admins");

                console.log(
                    "詳細画面 isAdmin:",
                    isAdmin
                );

            } catch (error) {

                console.error(
                    "管理者判定エラー:",
                    error
                );

            }
        }

        if (editScheduleButton) {

            editScheduleButton.style.display =
                isAdmin
                    ? "inline-block"
                    : "none";

        }

        if (deleteScheduleButton) {

            deleteScheduleButton.style.display =
                isAdmin
                    ? "inline-block"
                    : "none";

        }

        scheduleDetailModal.classList.add(
            "active"
        );


    } catch (error) {

        console.error(
            "予定詳細取得エラー:",
            error
        );

        alert(
            "予定詳細の取得に失敗しました。"
        );

    }

}


// ========================================
// 閉じるボタン
// ========================================

if (closeScheduleDetailButton) {

    closeScheduleDetailButton.addEventListener(
        "click",
        closeScheduleDetail
    );

}


if (closeScheduleDetailButtonBottom) {

    closeScheduleDetailButtonBottom.addEventListener(
        "click",
        closeScheduleDetail
    );

}


// ========================================
// 背景クリックで閉じる
// ========================================

if (scheduleDetailModal) {

    scheduleDetailModal.addEventListener(
        "click",
        (event) => {

            if (
                event.target ===
                scheduleDetailModal
            ) {

                closeScheduleDetail();

            }

        }
    );

}

// ========================================
// 予定削除
// ========================================

if (deleteScheduleButton) {

    deleteScheduleButton.addEventListener(
        "click",
        async () => {

            if (!currentScheduleDetail) {
                return;
            }

            const confirmed =
                window.confirm(
                    "この予定を削除しますか？"
                );

            if (!confirmed) {
                return;
            }

            try {

                deleteScheduleButton.disabled =
                    true;

                const response =
                    await fetch(
                        API_URL,
                        {
                            method: "DELETE",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body: JSON.stringify({
                                scheduleMonth:
                                    currentScheduleDetail.scheduleMonth,

                                startDateTime:
                                    currentScheduleDetail.startDateTime
                            })
                        }
                    );

                const result =
                    await response.json();

                console.log(
                    "削除APIレスポンス:",
                    result
                );

                if (!response.ok) {

                    throw new Error(
                        result.message ||
                        "削除に失敗しました"
                    );

                }

                alert(
                    "予定を削除しました。"
                );

                closeScheduleDetail();

                await loadSchedule();

            } catch (error) {

                console.error(
                    "予定削除エラー:",
                    error
                );

                alert(
                    "予定の削除に失敗しました。\n"
                    + error.message
                );

            } finally {

                deleteScheduleButton.disabled =
                    false;

            }

        }
    );

}

// ========================================
// 編集ボタン
// ========================================

if (editScheduleButton) {

    editScheduleButton.addEventListener(
        "click",
        () => {

            if (!currentScheduleDetail) {
                return;
            }

            enterEditMode();

        }
    );

}

// ========================================
// 編集用施設プルダウン作成
// ========================================

function prepareEditFacilityOptions() {

    if (!editFacilityId) {
        return;
    }

    editFacilityId.innerHTML = "";

    const defaultOption =
        document.createElement("option");

    defaultOption.value = "";

    defaultOption.textContent =
        "施設を選択してください";

    editFacilityId.appendChild(
        defaultOption
    );

    facilities.forEach(
        facility => {

            const option =
                document.createElement("option");

            option.value =
                facility.facilityId;

            option.textContent =
                facility.facilityName;

            editFacilityId.appendChild(
                option
            );

        }
    );

    console.log(
        "編集用施設プルダウン:",
        facilities
    );
}


// ========================================
// 施設変更時の情報更新
// ========================================

function updateEditFacilityInfo() {

    if (!editFacilityId) {
        return;
    }

    const selectedFacility =
        facilities.find(
            facility =>
                facility.facilityId ===
                editFacilityId.value
        );

    if (!selectedFacility) {

        if (editAddress) {
            editAddress.textContent =
                "未設定";
        }

        if (editFacilityUrl) {
            editFacilityUrl.removeAttribute(
                "href"
            );

            editFacilityUrl.style.display =
                "none";
        }

        return;
    }


    // ========================================
    // 住所
    // ========================================

    if (editAddress) {

        editAddress.textContent =
            selectedFacility.address
            || "未設定";

    }


    // ========================================
    // URL
    // ========================================

    if (editFacilityUrl) {

        if (selectedFacility.url) {

            editFacilityUrl.href =
                selectedFacility.url;

            editFacilityUrl.style.display =
                "inline";

        } else {

            editFacilityUrl.removeAttribute(
                "href"
            );

            editFacilityUrl.style.display =
                "none";

        }

    }

}

// ========================================
// 施設マスタ取得
// ========================================

async function loadFacilities() {

    try {

        const response =
            await fetch(
                FACILITY_API_URL
            );

        if (!response.ok) {

            throw new Error(
                "施設APIエラー: "
                + response.status
            );

        }

        facilities =
            await response.json();

        console.log(
            "施設マスタ:",
            facilities
        );

        // 編集用施設プルダウンを作成
        prepareEditFacilityOptions();

    } catch (error) {

        console.error(
            "施設取得エラー:",
            error
        );

    }

}

// ========================================
// 施設変更
// ========================================

if (editFacilityId) {

    editFacilityId.addEventListener(
        "change",
        () => {

            console.log(
                "選択された施設:",
                editFacilityId.value
            );

            updateEditFacilityInfo();

        }
    );

}

// ========================================
// 編集モード開始
// ========================================

function enterEditMode() {

    if (!currentScheduleDetail) {
        return;
    }


    // ========================================
    // 閲覧モード → 編集モード
    // ========================================

    if (scheduleViewMode) {

        scheduleViewMode.style.display =
            "none";

    }

    if (scheduleEditMode) {

        scheduleEditMode.style.display =
            "block";

    }

    if (viewModeButtons) {

        viewModeButtons.style.display =
            "none";

    }

    if (editModeButtons) {

        editModeButtons.style.display =
            "block";

    }


    // ========================================
    // 既存値を設定
    // ========================================

    const startDateTime =
        currentScheduleDetail.startDateTime;

    const endDateTime =
        currentScheduleDetail.endDateTime;


    if (editDate) {

        editDate.value =
            startDateTime.substring(
                0,
                10
            );

    }


    if (editStartTime) {

        editStartTime.value =
            startDateTime.substring(
                11,
                16
            );

    }


    if (editEndTime) {

        editEndTime.value =
            endDateTime.substring(
                11,
                16
            );

    }


    // ========================================
    // 施設
    // ========================================

    if (editFacilityId) {

        editFacilityId.value =
            currentScheduleDetail.facilityId;

    }


    // ========================================
    // 曜日
    // ========================================

    updateEditDayOfWeek();


    // ========================================
    // 施設情報
    // ========================================

    updateEditFacilityInfo();


    console.log(
        "=== 編集モード開始 ==="
    );

}

// ========================================
// 保存
// ========================================

if (saveScheduleButton) {

    saveScheduleButton.addEventListener(
        "click",
        async () => {

            if (!currentScheduleDetail) {

                console.error(
                    "currentScheduleDetail がありません"
                );

                return;
            }


            const date =
                editDate.value;

            const startTime =
                editStartTime.value;

            const endTime =
                editEndTime.value;

            const facilityId =
                editFacilityId.value;


            console.log(
                "=== 保存開始 ==="
            );

            console.log(
                "日付:",
                date
            );

            console.log(
                "開始:",
                startTime
            );

            console.log(
                "終了:",
                endTime
            );

            console.log(
                "施設:",
                facilityId
            );


            // ========================================
            // 入力チェック
            // ========================================

            if (!date) {

                alert(
                    "日付を入力してください。"
                );

                return;
            }


            if (!startTime) {

                alert(
                    "開始時間を入力してください。"
                );

                return;
            }


            if (!endTime) {

                alert(
                    "終了時間を入力してください。"
                );

                return;
            }


            if (!facilityId) {

                alert(
                    "施設を選択してください。"
                );

                return;
            }


            if (endTime <= startTime) {

                alert(
                    "終了時間は開始時間より後にしてください。"
                );

                return;
            }


            try {

                saveScheduleButton.disabled =
                    true;

                saveScheduleButton.textContent =
                    "保存中...";


                // ========================================
                // PUT
                // ========================================

                const response =
                    await fetch(
                        API_URL,
                        {
                            method:
                                "PUT",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body:
                                JSON.stringify({

                                    oldScheduleMonth:
                                        currentScheduleDetail
                                            .scheduleMonth,

                                    oldStartDateTime:
                                        currentScheduleDetail
                                            .startDateTime,

                                    date:
                                        date,

                                    startTime:
                                        startTime,

                                    endTime:
                                        endTime,

                                    facilityId:
                                        facilityId

                                })
                        }
                    );


                const result =
                    await response.json();


                console.log(
                    "更新APIレスポンス:",
                    result
                );


                if (!response.ok) {

                    throw new Error(
                        result.message
                        || "更新に失敗しました"
                    );

                }


                // ========================================
                // 成功
                // ========================================

                alert(
                    "予定を更新しました。"
                );


                // ========================================
                // 最新データ再取得
                // ========================================

                await loadSchedule();


                // ========================================
                // 編集モード終了
                // ========================================

                exitEditMode();


                // ========================================
                // 更新後の予定を検索
                // ========================================

                const newStartDateTime =
                    `${date}T${startTime}`;


                const updatedSchedule =
                    schedules.find(
                        schedule =>
                            schedule.startDateTime ===
                            newStartDateTime
                    );


                if (updatedSchedule) {

                    await showScheduleDetail(
                        updatedSchedule
                    );

                } else {

                    closeScheduleDetail();

                }


            } catch (error) {

                console.error(
                    "予定更新エラー:",
                    error
                );


                alert(
                    "予定の更新に失敗しました。\n"
                    + error.message
                );


            } finally {

                saveScheduleButton.disabled =
                    false;

                saveScheduleButton.textContent =
                    "保存";

            }

        }
    );

}

// ========================================
// 曜日更新
// ========================================

function updateEditDayOfWeek() {

    if (
        !editDate ||
        !editDayOfWeek
    ) {
        return;
    }


    if (!editDate.value) {

        editDayOfWeek.textContent =
            "";

        return;
    }


    const date =
        new Date(
            editDate.value
            + "T00:00:00"
        );


    const weekdays = [
        "日",
        "月",
        "火",
        "水",
        "木",
        "金",
        "土"
    ];


    editDayOfWeek.textContent =
        weekdays[
        date.getDay()
        ];

}

// ========================================
// 編集モード終了
// ========================================

function exitEditMode() {

    if (scheduleViewMode) {

        scheduleViewMode.style.display =
            "block";

    }

    if (scheduleEditMode) {

        scheduleEditMode.style.display =
            "none";

    }

    if (viewModeButtons) {

        viewModeButtons.style.display =
            "block";

    }

    if (editModeButtons) {

        editModeButtons.style.display =
            "none";

    }

}
