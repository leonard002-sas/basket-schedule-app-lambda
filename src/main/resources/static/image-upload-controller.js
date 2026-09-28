/** 予定画像の選択と S3 アップロードを担当します。 */

const UPLOAD_API_URL = "https://gg5d4xxwdpfjdesh2n5vyxqm5q0mnwii.lambda-url.ap-northeast-1.on.aws/";

const uploadButton = document.getElementById("uploadButton");
const imageInput = document.getElementById("imageFile");
const uploadStatus = document.getElementById("uploadStatus");
const uploadDropzone = document.getElementById("uploadDropzone");
const selectedFileName = document.getElementById("selectedFileName");

if (imageInput && selectedFileName) {
    imageInput.addEventListener("change", () => {
        selectedFileName.textContent = imageInput.files[0]
            ? imageInput.files[0].name
            : "画像を選択、またはここにドロップ";
    });
}

if (uploadDropzone && imageInput) {
    ["dragenter", "dragover"].forEach((type) => {
        uploadDropzone.addEventListener(type, (event) => {
            event.preventDefault();
            uploadDropzone.classList.add("is-dragover");
        });
    });
    ["dragleave", "drop"].forEach((type) => {
        uploadDropzone.addEventListener(type, (event) => {
            event.preventDefault();
            uploadDropzone.classList.remove("is-dragover");
        });
    });
    uploadDropzone.addEventListener("drop", (event) => {
        const file = event.dataTransfer.files[0];
        if (!file || !file.type.startsWith("image/")) return;
        const transfer = new DataTransfer();
        transfer.items.add(file);
        imageInput.files = transfer.files;
        imageInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
}

if (uploadButton) {
    uploadButton.addEventListener("click", async () => {
        const file = imageInput.files[0];
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
            uploadButton.disabled = true;
            uploadStatus.textContent = "アップロード準備中...";

            // API から一時的なアップロード先を取得します。
            const response = await adminFetch(UPLOAD_API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fileName: file.name, contentType: file.type }),
            });
            if (!response.ok) {
                throw new Error("Upload APIエラー: " + response.status);
            }

            const data = await response.json();
            jobId = data.fileName;
            if (window.BasketImageJobs && jobId) {
                window.BasketImageJobs.start(jobId, file.name);
            }

            // 大きな画像データは Lambda を経由せず、S3 へ直接送信します。
            uploadStatus.textContent = "画像をS3へアップロード中...";
            await uploadFileToS3(data.uploadUrl, file, jobId);

            uploadStatus.textContent = "画像を送信しました。解析状況は画面上部に表示されます。";
            if (jobId && window.BasketImageJobs) {
                window.BasketImageJobs.uploaded(jobId);
            }
            imageInput.value = "";
            selectedFileName.textContent = "画像を選択、またはここにドロップ";
        } catch (error) {
            if (jobId && window.BasketImageJobs) {
                window.BasketImageJobs.failed(jobId, error.message);
            }
            console.error("画像アップロードエラー:", error);
            uploadStatus.textContent = "アップロードに失敗しました。";
            alert("アップロードに失敗しました。\n" + error.message);
        } finally {
            uploadButton.disabled = false;
        }
    });
}

/** 署名付きURLを使い、進捗を画面へ伝えながら画像をS3へ送信します。 */
function uploadFileToS3(uploadUrl, file, jobId) {
    return new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("PUT", uploadUrl);
        request.setRequestHeader("Content-Type", file.type || "image/jpeg");
        request.upload.addEventListener("progress", (event) => {
            if (event.lengthComputable && jobId && window.BasketImageJobs) {
                window.BasketImageJobs.uploadProgress(jobId, (event.loaded / event.total) * 100);
            }
        });
        request.addEventListener("load", () => {
            if (request.status >= 200 && request.status < 300) {
                resolve();
            } else {
                reject(new Error("S3アップロードエラー: " + request.status));
            }
        });
        request.addEventListener("error", () => reject(new Error("S3への接続に失敗しました")));
        request.addEventListener("abort", () => reject(new Error("アップロードを中断しました")));
        request.send(file);
    });
}
