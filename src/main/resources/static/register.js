// ========================================
// 施設API
// ========================================

const FACILITY_API_URL =
    "https://wybpjskbmgh6jbra4647ethnhm0pkulf.lambda-url.ap-northeast-1.on.aws/";


// ========================================
// 手入力登録API
// ========================================

const SCHEDULE_REGISTER_API_URL =
    "https://z7gedcbjogrjl7ld4o6rcj7dte0cjklf.lambda-url.ap-northeast-1.on.aws/";


// ========================================
// 画像アップロードAPI
// ========================================

const UPLOAD_API_URL =
    "https://gg5d4xxwdpfjdesh2n5vyxqm5q0mnwii.lambda-url.ap-northeast-1.on.aws/";

function getAdminIdToken() {

    const token = localStorage.getItem("id_token");
    if (!token) {
        return null;
    }

    try {
        const encodedPayload = token.split(".")[1];
        const base64 = encodedPayload
            .replace(/-/g, "+")
            .replace(/_/g, "/");
        const payload = JSON.parse(
            atob(base64 + "=".repeat((4 - base64.length % 4) % 4))
        );

        if (!payload.exp || payload.exp * 1000 <= Date.now()
                || !Array.isArray(payload["cognito:groups"])
                || !payload["cognito:groups"].includes("admins")) {
            throw new Error("管理者ログインが必要です");
        }
        return token;
    } catch (error) {
        localStorage.removeItem("id_token");
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        return null;
    }
}

async function adminFetch(url, options = {}) {

    const token = getAdminIdToken();
    if (!token) {
        window.location.replace("index.html");
        throw new Error("管理者ログインが必要です。");
    }

    return fetch(url, {
        ...options,
        headers: {
            ...(options.headers || {}),
            Authorization: `Bearer ${token}`
        }
    });
}


// ========================================
// 施設マスタ
// ========================================

let facilities = [];


// ========================================
// 施設マスタ取得
// ========================================

async function loadFacilities() {

    try {

        const response =
            await adminFetch(
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
            "取得した施設:",
            facilities
        );


        document
            .querySelectorAll(
                ".facility-select"
            )
            .forEach(
                select => {

                    setFacilityOptions(
                        select
                    );

                }
            );

    } catch (error) {

        console.error(
            "施設取得エラー:",
            error
        );

    }

}


// ========================================
// 施設プルダウン作成
// ========================================

function setFacilityOptions(select) {

    select.innerHTML = "";


    const defaultOption =
        document.createElement(
            "option"
        );

    defaultOption.value =
        "";

    defaultOption.textContent =
        "施設を選択してください";

    select.appendChild(
        defaultOption
    );


    facilities.forEach(
        facility => {

            const option =
                document.createElement(
                    "option"
                );

            option.value =
                facility.facilityId;

            option.textContent =
                facility.facilityName;

            select.appendChild(
                option
            );

        }
    );

}


// ========================================
// 予定入力
// ========================================

const scheduleRows =
    document.getElementById(
        "scheduleRows"
    );

const addScheduleButton =
    document.getElementById(
        "addScheduleButton"
    );


// ========================================
// 予定追加
// ========================================

if (addScheduleButton) {

    addScheduleButton.addEventListener(
        "click",
        () => {

            const row =
                document.createElement(
                    "div"
                );

            row.className =
                "schedule-row";


            row.innerHTML = `
                <select class="event-type-select" aria-label="予定種別">
                    <option value="PRACTICE">練習</option>
                    <option value="GAME">試合</option>
                </select>

                <input
                    type="date"
                    class="date-input"
                >

                <input
                    type="time"
                    class="time-input"
                >

                <span>～</span>

                <input
                    type="time"
                    class="time-input"
                >

                <select
                    class="facility-select"
                >
                    <option value="">
                        施設を選択してください
                    </option>
                </select>

                <button
                    type="button"
                    class="delete-button"
                >
                    削除
                </button>
            `;


            scheduleRows.appendChild(
                row
            );


            const facilitySelect =
                row.querySelector(
                    ".facility-select"
                );

            setFacilityOptions(
                facilitySelect
            );

        }
    );

}


// ========================================
// 削除ボタン
// ========================================

if (scheduleRows) {

    scheduleRows.addEventListener(
        "click",
        event => {

            if (
                event.target.classList.contains(
                    "delete-button"
                )
            ) {

                const row =
                    event.target.closest(
                        ".schedule-row"
                    );

                if (row) {

                    row.remove();

                }

            }

        }
    );

}


// ========================================
// 手入力登録
// ========================================

const registerButton =
    document.getElementById(
        "registerButton"
    );

const status =
    document.getElementById(
        "status"
    );


if (registerButton) {

    registerButton.addEventListener(
        "click",
        async () => {

            try {

                const rows =
                    document.querySelectorAll(
                        ".schedule-row"
                    );

                const schedules = [];


                // ====================================
                // 入力値取得
                // ====================================

                rows.forEach(
                    row => {

                        const date =
                            row.querySelector(
                                ".date-input"
                            ).value;

                        const timeInputs =
                            row.querySelectorAll(
                                ".time-input"
                            );

                        const startTime =
                            timeInputs[0].value;

                        const endTime =
                            timeInputs[1].value;

                        const facilitySelect =
                            row.querySelector(
                                ".facility-select"
                            );

                        const facilityId =
                            facilitySelect.value;

                        const eventType =
                            row.querySelector(".event-type-select").value;

                        const facilityName =
                            facilitySelect
                                .selectedOptions[0]
                                ?.textContent
                                || "";


                        schedules.push({

                            date:
                                date,

                            startTime:
                                startTime,

                            endTime:
                                endTime,

                            facilityId:
                                facilityId,

                            facilityName:
                                facilityName,

                            eventType:
                                eventType

                        });

                    }
                );


                console.log(
                    "登録する予定:",
                    schedules
                );


                // ====================================
                // 入力チェック
                // ====================================

                for (
                    const schedule
                    of schedules
                ) {

                    if (!schedule.date) {

                        throw new Error(
                            "日付を入力してください"
                        );

                    }

                    if (!schedule.startTime) {

                        throw new Error(
                            "開始時間を入力してください"
                        );

                    }

                    if (!schedule.endTime) {

                        throw new Error(
                            "終了時間を入力してください"
                        );

                    }

                    if (!schedule.facilityId) {

                        throw new Error(
                            "施設を選択してください"
                        );

                    }

                }


                if (
                    schedules.length === 0
                ) {

                    throw new Error(
                        "登録する予定がありません"
                    );

                }


                // ====================================
                // 登録中
                // ====================================

                registerButton.disabled =
                    true;


                if (status) {

                    status.textContent =
                        "登録中です...";

                }


                // ====================================
                // API呼び出し
                // ====================================

                const response =
                    await adminFetch(
                        SCHEDULE_REGISTER_API_URL,
                        {
                            method:
                                "POST",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body:
                                JSON.stringify({

                                    schedules:
                                        schedules

                                })

                        }
                    );


                const result =
                    await response.json();


                console.log(
                    "登録APIレスポンス:",
                    result
                );


                if (!response.ok) {

                    throw new Error(
                        result.message
                        || "登録に失敗しました"
                    );

                }


                if (status) {

                    status.textContent =
                        schedules.length
                        + "件の予定を登録しました。";

                }


            } catch (error) {

                console.error(
                    "登録エラー:",
                    error
                );


                if (status) {

                    status.textContent =
                        "登録エラー: "
                        + error.message;

                }


            } finally {

                registerButton.disabled =
                    false;

            }

        }
    );

}


// ========================================
// カレンダーに戻る
// ========================================

const backButton =
    document.getElementById(
        "backButton"
    );


if (backButton) {

    backButton.addEventListener(
        "click",
        () => {

            window.location.href =
                "index.html";

        }
    );

}


// ========================================
// 画像アップロード
// ========================================

const uploadButton =
    document.getElementById(
        "uploadButton"
    );

const imageInput =
    document.getElementById(
        "imageFile"
    );

const uploadStatus =
    document.getElementById(
        "uploadStatus"
    );

const uploadDropzone =
    document.getElementById("uploadDropzone");

const selectedFileName =
    document.getElementById("selectedFileName");

if (imageInput && selectedFileName) {
    imageInput.addEventListener("change", () => {
        selectedFileName.textContent = imageInput.files[0]
            ? imageInput.files[0].name
            : "画像を選択、またはここにドロップ";
    });
}

if (uploadDropzone && imageInput) {
    ["dragenter", "dragover"].forEach(type => {
        uploadDropzone.addEventListener(type, event => {
            event.preventDefault();
            uploadDropzone.classList.add("is-dragover");
        });
    });
    ["dragleave", "drop"].forEach(type => {
        uploadDropzone.addEventListener(type, event => {
            event.preventDefault();
            uploadDropzone.classList.remove("is-dragover");
        });
    });
    uploadDropzone.addEventListener("drop", event => {
        const file = event.dataTransfer.files[0];
        if (!file || !file.type.startsWith("image/")) return;
        const transfer = new DataTransfer();
        transfer.items.add(file);
        imageInput.files = transfer.files;
        imageInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
}


if (uploadButton) {

    uploadButton.addEventListener(
        "click",
        async () => {

            console.log(
                "=== 画像アップロードボタン押下 ==="
            );


            const file =
                imageInput.files[0];

            let jobId = null;


            if (!file) {
                uploadStatus.textContent = "先に画像を選択してください。";
                return;
            }

            if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
                uploadStatus.textContent = "JPG、PNG、WebP形式の画像を選択してください。";
                return;
            }


            try {

                uploadButton.disabled =
                    true;


                uploadStatus.textContent =
                    "アップロード準備中...";


                // ====================================
                // ① Presigned URL取得
                // ====================================

                const response =
                    await adminFetch(
                        UPLOAD_API_URL,
                        {
                            method:
                                "POST",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body:
                                JSON.stringify({

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

                jobId = data.fileName;
                if (window.BasketImageJobs && jobId) {
                    window.BasketImageJobs.start(jobId, file.name);
                }


                // ====================================
                // ② S3へ直接アップロード
                // ====================================

                uploadStatus.textContent =
                    "画像をS3へアップロード中...";


                await new Promise((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    xhr.open("PUT", data.uploadUrl);
                    xhr.setRequestHeader("Content-Type", file.type || "image/jpeg");
                    xhr.upload.addEventListener("progress", event => {
                        if (event.lengthComputable && jobId && window.BasketImageJobs) {
                            window.BasketImageJobs.uploadProgress(
                                jobId,
                                (event.loaded / event.total) * 100
                            );
                        }
                    });
                    xhr.addEventListener("load", () => {
                        if (xhr.status >= 200 && xhr.status < 300) {
                            resolve();
                        } else {
                            reject(new Error("S3アップロードエラー: " + xhr.status));
                        }
                    });
                    xhr.addEventListener("error", () => reject(new Error("S3への接続に失敗しました")));
                    xhr.addEventListener("abort", () => reject(new Error("アップロードを中断しました")));
                    xhr.send(file);
                });


                // ====================================
                // ③ 完了
                // ====================================

                uploadStatus.textContent =
                    "画像を送信しました。解析状況は画面上部に表示します。";

                if (jobId && window.BasketImageJobs) {
                    window.BasketImageJobs.uploaded(jobId);
                }


                imageInput.value =
                    "";


            } catch (error) {

                if (jobId && window.BasketImageJobs) {
                    window.BasketImageJobs.failed(jobId, error.message);
                }

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
// 初期処理
// ========================================

if (getAdminIdToken()) {
    document.body.style.display = "";
    loadFacilities();
} else {
    window.location.replace("index.html");
}
