// ========================================
// 施設API
// ========================================

const FACILITY_API_URL =
    "https://wybpjskbmgh6jbra4647ethnhm0pkulf.lambda-url.ap-northeast-1.on.aws/";


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


registerButton.addEventListener(
    "click",
    () => {

        const rows =
            document.querySelectorAll(
                ".schedule-row"
            );

        const schedules = [];


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
// 初期処理
// ========================================

loadFacilities();