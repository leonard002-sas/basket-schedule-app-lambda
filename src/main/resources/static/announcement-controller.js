/** 周知事項の表示、管理者向けフォーム、登録・削除操作を担当します。 */

/** 公開中のお知らせと管理者向け一覧を画面へ表示します。 */
function renderAnnouncements(admin = isCalendarAdmin()) {
    const area = document.getElementById("announcementsArea");
    const list = document.getElementById("announcementList");
    const activeAnnouncements = announcements.filter((item) => item.visible);

    area.hidden = activeAnnouncements.length === 0 && !admin;
    const navigationLink = document.querySelector(
        '.site-navigation [data-app-nav="announcements"]',
    );
    if (navigationLink) navigationLink.hidden = area.hidden;

    document.getElementById("announcementCount").textContent = activeAnnouncements.length
        ? `${activeAnnouncements.length}件`
        : "";
    list.innerHTML = activeAnnouncements.map(renderAnnouncementCard).join("");

    const manager = document.getElementById("announcementManager");
    manager.hidden = !admin;
    if (!admin) return;

    const adminList = document.getElementById("announcementAdminList");
    adminList.innerHTML = announcements.length
        ? announcements.map(renderAnnouncementAdminRow).join("")
        : "<p class='announcement-empty'>周知事項はまだありません。</p>";
}

/** 公開一覧用のお知らせカードを安全なHTML文字列にします。 */
function renderAnnouncementCard(item) {
    const urgencyLabel =
        item.urgency === "URGENT" ? "緊急" : item.urgency === "IMPORTANT" ? "重要" : "お知らせ";

    return `<article class="announcement-card urgency-${escapeHtml(item.urgency)}">
        <div class="announcement-meta"><span>${urgencyLabel}</span>
        <span>${escapeHtml(item.visibleUntil)}まで</span></div>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.content).replace(/\n/g, "<br>")}</p>
    </article>`;
}

/** 管理者一覧用のお知らせ行を安全なHTML文字列にします。 */
function renderAnnouncementAdminRow(item) {
    const status = item.visible ? "表示中" : "期限切れ";
    const rowClass = item.visible ? "" : " is-expired";

    return `<div class="announcement-admin-item${rowClass}">
        <span><strong>${escapeHtml(item.title)}</strong>
        <small>${status} · ${escapeHtml(item.visibleUntil)}まで</small></span>
        <span class="announcement-admin-actions">
            <button type="button" class="button-light" data-edit-announcement="${escapeHtml(item.id)}">編集</button>
            <button type="button" class="button-danger" data-delete-announcement="${escapeHtml(item.id)}">削除</button>
        </span>
    </div>`;
}

/** お知らせフォームを新規登録の状態に戻します。 */
function resetAnnouncementForm() {
    document.getElementById("announcementForm").reset();
    document.getElementById("announcementId").value = "";
    document.getElementById("cancelAnnouncementEdit").hidden = true;
    document.getElementById("announcementStatus").textContent = "";
}

/** 管理者がお知らせを登録または更新したときの処理です。 */
async function saveAnnouncement(event) {
    event.preventDefault();
    const status = document.getElementById("announcementStatus");
    const payload = {
        id: document.getElementById("announcementId").value,
        title: document.getElementById("announcementTitle").value.trim(),
        content: document.getElementById("announcementContent").value.trim(),
        urgency: document.getElementById("announcementUrgency").value,
        visibleUntil: document.getElementById("announcementVisibleUntil").value,
    };

    status.textContent = "保存しています…";
    try {
        const response = await authenticatedFetch(`${API_URL}?resource=announcement`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "保存できませんでした");

        resetAnnouncementForm();
        await loadSchedule();
        status.textContent = "周知事項を保存しました。";
    } catch (error) {
        status.textContent = error.message;
    }
}

/** 管理者一覧の編集・削除ボタンを処理します。 */
async function handleAnnouncementListClick(event) {
    const editButton = event.target.closest("[data-edit-announcement]");
    if (editButton) {
        beginAnnouncementEdit(editButton.dataset.editAnnouncement);
        return;
    }

    const deleteButton = event.target.closest("[data-delete-announcement]");
    if (!deleteButton) return;
    await deleteAnnouncement(deleteButton.dataset.deleteAnnouncement);
}

/** 選択したお知らせの内容をフォームへ読み込みます。 */
function beginAnnouncementEdit(announcementId) {
    const item = announcements.find((announcement) => announcement.id === announcementId);
    if (!item) return;

    document.getElementById("announcementId").value = item.id;
    document.getElementById("announcementTitle").value = item.title;
    document.getElementById("announcementContent").value = item.content;
    document.getElementById("announcementUrgency").value = item.urgency;
    document.getElementById("announcementVisibleUntil").value = item.visibleUntil;
    document.getElementById("cancelAnnouncementEdit").hidden = false;
    document.getElementById("announcementTitle").focus();
}

/** 選択したお知らせを確認後に削除し、一覧を再読み込みします。 */
async function deleteAnnouncement(announcementId) {
    const item = announcements.find((announcement) => announcement.id === announcementId);
    if (!item || !confirm(`「${item.title}」を削除しますか？`)) return;

    try {
        const response = await authenticatedFetch(
            `${API_URL}?resource=announcement&id=${encodeURIComponent(item.id)}`,
            { method: "DELETE" },
        );
        if (!response.ok) throw new Error("削除できませんでした");
        await loadSchedule();
    } catch (error) {
        alert(error.message);
    }
}

// 各フォーム要素があるカレンダーページでだけイベントを登録します。
document.getElementById("announcementForm")?.addEventListener("submit", saveAnnouncement);
document.getElementById("cancelAnnouncementEdit")?.addEventListener("click", resetAnnouncementForm);
document
    .getElementById("announcementAdminList")
    ?.addEventListener("click", handleAnnouncementListClick);
