const API_URL = "https://7yxh3p2c5swyx6ajv45ldmiswe0tirop.lambda-url.ap-northeast-1.on.aws/";

const scheduleElement = document.getElementById("schedule");
const calendarButton = document.getElementById("calendarButton");

let schedules = [];


async function loadSchedule() {

    try {

        const response = await fetch(API_URL);

        if (!response.ok) {
            throw new Error(
                "APIエラー: " + response.status
            );
        }

        schedules = await response.json();

        displaySchedule();

    } catch (error) {

        console.error(error);

        scheduleElement.innerHTML =
            '<p class="error">予定の取得に失敗しました。</p>';
    }
}


function displaySchedule() {

    if (schedules.length === 0) {

        scheduleElement.innerHTML =
            "<p>予定がありません。</p>";

        return;
    }

    scheduleElement.innerHTML = "";

    schedules.forEach(schedule => {

        const start = new Date(schedule.startDateTime);
        const end = new Date(schedule.endDateTime);

        const dateText =
            formatDate(start);

        const startTime =
            formatTime(start);

        const endTime =
            formatTime(end);

        const eventElement =
            document.createElement("div");

        eventElement.className = "event";

        eventElement.innerHTML = `
            <div class="date">
                ${dateText}
            </div>

            <div class="time">
                ${startTime} ～ ${endTime}
            </div>

            <div class="time-zone">
                ${schedule.timeZone}
            </div>
        `;

        scheduleElement.appendChild(eventElement);
    });
}


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


function formatTime(date) {

    const hours =
        String(date.getHours()).padStart(2, "0");

    const minutes =
        String(date.getMinutes()).padStart(2, "0");

    return `${hours}:${minutes}`;
}


calendarButton.addEventListener(
    "click",
    () => {

        alert(
            "カレンダー登録機能はこれから実装します。"
        );

    }
);


loadSchedule();