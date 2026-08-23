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
// 施設マスタ
// ========================================

let facilities = [];


// ========================================
// 施設マスタ取得
// ========================================

async function loadFacilities() {

    try {

        const response =
            await fetch(FACILITY_API_URL);

        if (!response.ok) {

            throw new Error(
                "施設APIエラー: " +
                response.status
            );

        }

        facilities =
            await response.json();

        console.log(
            "取得した施設:",
            facilities
        );

        // 既に存在している行に施設を設定
        document
            .querySelectorAll(".facility-select")
            .forEach((select) => {

                setFacilityOptions(select);

            });

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

    // デフォルト
    const defaultOption =
        document.createElement("option");

    defaultOption.value = "";

    defaultOption.textContent =
        "施設を選択してください";

    select.appendChild(
        defaultOption
    );


    // 施設マスタを設定
    facilities.forEach((facility) => {

        const option =
            document.createElement("option");

        option.value =
            facility.facilityId;

        option.textContent =
            facility.facilityName;

        select.appendChild(
            option
        );

    });

}


// ========================================
// 予定入力行
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

        scheduleRows.appendChild(row);


        // 追加した行に施設マスタを設定
        const facilitySelect =
            row.querySelector(
                ".facility-select"
            );

        setFacilityOptions(
            facilitySelect
        );

    }
);


// ========================================
// 削除ボタン
// ========================================

scheduleRows.addEventListener(
    "click",
    (event) => {

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


// ========================================
// 登録ボタン
// ========================================

const registerButton =
    document.getElementById(
        "registerButton"
    );

const status =
    document.getElementById(
        "status"
    );

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

            rows.forEach((row) => {

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

                const facilityName =
                    facilitySelect
                        .selectedOptions[0]
                        ?.textContent;

                schedules.push({
                    date: date,
                    startTime: startTime,
                    endTime: endTime,
                    facilityId: facilityId,
                    facilityName: facilityName
                });

            });

            console.log(
                "登録する予定:",
                schedules
            );

            // ====================================
            // 入力チェック
            // ====================================

            for (const schedule of schedules) {

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

            if (schedules.length === 0) {

                throw new Error(
                    "登録する予定がありません"
                );

            }

            // ====================================
            // 登録中
            // ====================================

            registerButton.disabled = true;

            if (status) {
                status.textContent =
                    "登録中です...";
            }

            // ====================================
            // ScheduleRegisterApi呼び出し
            // ====================================

            const response =
                await fetch(
                    SCHEDULE_REGISTER_API_URL,
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body: JSON.stringify({
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

            // ====================================
            // APIエラー
            // ====================================

            if (!response.ok) {

                throw new Error(
                    result.message
                        || "登録に失敗しました"
                );

            }

            // ====================================
            // 登録成功
            // ====================================

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


// ========================================
// カレンダーに戻る
// ========================================

const backButton =
    document.getElementById(
        "backButton"
    );


backButton.addEventListener(
    "click",
    () => {

        window.location.href =
            "index.html";

    }
);

// ========================================
// 画像アップロード
// ========================================

const uploadButton =
    document.getElementById("uploadButton");

const imageInput =
    document.getElementById("imageFile");

const uploadStatus =
    document.getElementById("uploadStatus");

if (uploadButton) {

    uploadButton.addEventListener(
        "click",
        async () => {

            console.log(
                "=== 画像アップロードボタン押下 ==="
            );

            const file =
                imageInput.files[0];

            if (!file) {

                alert(
                    "画像を選択してください。"
                );

                return;
            }

            try {

                uploadButton.disabled = true;

                uploadStatus.textContent =
                    "アップロード準備中...";

                // ====================================
                // ① Upload APIからPresigned URL取得
                // ====================================

                console.log(
                    "Upload API呼び出し開始"
                );

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

                console.log(
                    "Upload API response:",
                    response.status
                );

                if (!response.ok) {

                    throw new Error(
                        "Upload APIエラー: "
                        + response.status
                    );
                }

                const data =
                    await response.json();

                console.log(
                    "Presigned URL取得成功"
                );

                // ====================================
                // ② S3へ直接アップロード
                // ====================================

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

                console.log(
                    "S3 upload response:",
                    uploadResponse.status
                );

                if (!uploadResponse.ok) {

                    throw new Error(
                        "S3アップロードエラー: "
                        + uploadResponse.status
                    );
                }

                // ====================================
                // ③ 完了
                // ====================================

                uploadStatus.textContent =
                    "アップロード完了！解析中です。";

                console.log(
                    "=== 画像アップロード成功 ==="
                );

                alert(
                    "画像をアップロードしました。\n" +
                    "Geminiによる予定解析を開始します。"
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
                    "アップロードに失敗しました。\n" +
                    error.message
                );

            } finally {

                uploadButton.disabled = false;

            }
        }
    );
}


// ========================================
// 初期処理
// ========================================

loadFacilities();