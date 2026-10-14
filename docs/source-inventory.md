# ソースコード一覧

この一覧は各ソースの責務と、機能追加時に最初に確認する場所を示します。

## Java / AWS Lambda

| ファイル                                                 | 責務                                                                                    |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `CognitoAuth.java`                                       | Cognito ID トークンの署名、発行元、クライアント、用途、有効期限、グループの検証         |
| `ScheduleApi.java`                                       | 予定・施設・お知らせ・動画などの読み書き API。バスケットボール API のルーティングも担当 |
| `ScheduleRegisterApi.java`                               | 手入力による予定の新規登録                                                              |
| `FacilityApi.java`                                       | 施設一覧と施設マスタの読み書き                                                          |
| `UploadApi.java`                                         | 画像アップロード用 URL の発行と処理状態の参照                                           |
| `ImageProcessor.java`                                    | S3 イベントを受け、Gemini 抽出結果を予定として保存                                      |
| `BasketballApi.java`                                     | チーム、メンバー、試合、試合時計、プレーイベント、ランキングの API                      |
| `BasketballRepository.java`                              | BasketballDataテーブルの読み書き、ページング、トランザクション                          |
| `ScheduleRepository.java`                                | BasketScheduleとBasketFacilityに対する予定・施設の取得、登録、削除                      |
| `LambdaRequestParser.java`                               | Lambda Function URLとAPI GatewayイベントからHTTPメソッド、クエリ、本文を読み取る        |
| `BasketballStatistics.java`                              | スコアブック操作によるスタッツ差分を計算する純粋なルール                                |
| `AnnouncementService.java`                               | お知らせ入力の検証、作成・更新・削除と DynamoDB 保存                                    |
| `DynamoDbService.java`                                   | 画像から抽出した予定レコードの保存                                                      |
| `CalendarConverter.java`                                 | 抽出された日付・時間帯を実際の日時へ変換                                                |
| `CalendarEntry.java`                                     | 画像認識結果の日付・時間帯 DTO                                                          |
| `CalendarResponse.java`                                  | 画像認識結果の対象月・予定一覧 DTO                                                      |
| `CalendarEvent.java`                                     | 変換後の予定開始・終了日時                                                              |
| `src/test/java/.../GeminiImageExtractionSmokeCheck.java` | 明示確認付きGemini接続の手動チェック。通常テストやLambda実行には含めません              |
| `package-info.java`                                      | パッケージ全体の説明                                                                    |

## Vue SPA

| ファイル／ディレクトリ                    | 責務                                                               |
| ----------------------------------------- | ------------------------------------------------------------------ |
| `frontend/src/App.vue`                    | 共通ヘッダー、ロール別ナビゲーション、テーマ、画像処理ジョブ表示   |
| `frontend/src/router.ts`                  | ハッシュルート、認証・管理者ルートガード、画面単位の遅延読み込み   |
| `frontend/src/services/api.ts`            | Bearer トークン付き HTTP 通信、エラー統一、型付き API 関数         |
| `frontend/src/stores/auth.ts`             | Cognito 認証、Googleログイン／連携、トークンとロール               |
| `frontend/src/stores/schedules.ts`        | 予定・施設・周知の共有状態と施設情報の結合                         |
| `frontend/src/stores/uploads.ts`          | 画像解析ジョブの永続化、全画面共通ポーリング、完了・失敗通知       |
| `frontend/src/views/HomeView.vue`         | 今日・今週の予定、周知、クイックアクションを表示するダッシュボード |
| `frontend/src/views/CalendarView.vue`     | 月間予定、祝日、詳細、出欠、一括回答、ICS・共有文面                |
| `frontend/src/views/ScheduleFormView.vue` | 複数予定、繰り返し、複製、試合情報、画像解析による予定登録         |
| `frontend/src/views/FacilitiesView.vue`   | 施設マスタの登録・編集・無効化                                     |
| `frontend/src/views/TeamsView.vue`        | チームと選手の登録・編集・無効化                                   |
| `frontend/src/views/GamesView.vue`        | 試合作成・編集、予定との紐付け、出場者、CSV移行、試合一覧          |
| `frontend/src/views/GameScoreView.vue`    | 出場5人、時計、プレー入力、Undo、ボックススコア、試合終了          |
| `frontend/src/views/RankingsView.vue`     | シーズンランキング、平均・EFF、個人推移、CSV出力                   |
| `frontend/src/views/JoinView.vue`         | 参加申請、Cognito登録、確認コード、Google登録、承認待ち            |
| `frontend/src/views/UsersView.vue`        | 参加承認、権限・利用状態・ユーザー削除                             |
| `frontend/src/views/AccountView.vue`      | 表示名、通知設定、Google連携、ログアウト、自己削除                 |
| `frontend/src/styles/main.css`            | SPA共通デザイン、ライト／ダークテーマ、レスポンシブ表示            |

## 従来ブラウザー画面

`src/main/resources/static/` の従来画面は運用時の互換確認用に残しています。新しい機能は原則として `frontend/` の型付き Vue SPA に追加します。

| ファイル                               | 責務                                                                 |
| -------------------------------------- | -------------------------------------------------------------------- |
| `static/index.html`                    | ログイン、予定表、ホーム情報、お知らせ、動画一覧、予定詳細           |
| `static/app.css`                       | 予定表と共有部品のレイアウト・コンポーネント                         |
| `static/app.js`                        | Cognito認証、API通信、予定データの読み込みと画面初期化               |
| `static/calendar-export.js`            | 予定のICS変換と月間共有テキストの作成                                |
| `static/calendar-view.js`              | 月間カレンダー、日別予定、今日・今週予定、動画一覧の描画             |
| `static/schedule-detail-controller.js` | 予定詳細の表示、施設情報、管理者向け編集・削除                       |
| `static/announcement-controller.js`    | 周知事項の表示と管理者向け登録・編集・削除操作                       |
| `static/register.html`                 | 予定・施設登録画面の構造                                             |
| `static/register.js`                   | 管理者向け施設と手入力予定の登録画面                                 |
| `static/image-upload-controller.js`    | 予定画像の選択、S3への直接アップロード、進捗反映                     |
| `static/image-jobs.js`                 | 画像処理ジョブの進捗表示と解除                                       |
| `static/basketball.html`               | チーム・試合・ランキングの画面構造                                   |
| `static/basketball.css`                | スコアブック画面のレイアウト                                         |
| `static/basketball.js`                 | スコアブック画面、API 呼び出し、CSV、ライブスタッツ                  |
| `static/basketball-data-utils.js`      | CSV 読み込み・移行形式変換とスタッツ表示の純粋関数                   |
| `static/account-menu.js`               | 共通アカウント情報、ログアウト、Cognito 自己削除                     |
| `static/theme.css`                     | ダークテーマ用の上書きスタイル                                       |
| `static/visual-system.css`             | 全画面共通のブランド、レスポンシブ、動き、ダークテーマの最終スタイル |
| `static/members.html` / `members.js`   | root-admin 専用の Cognito ユーザー管理画面                           |
| `static/theme.js`                      | テーマ選択の保存と復元                                               |
| `static/favicon.svg`                   | ブラウザーアイコン                                                   |
| `static/cognito-login-background.svg`  | Cognito ログイン画面の背景素材                                       |

## ビルド・設計・検証

| ファイル                                | 責務                                            |
| --------------------------------------- | ----------------------------------------------- |
| `build.gradle`                          | Java 25、依存関係、JUnit、JAR と Javadoc の設定 |
| `buildspec.yml`                         | CodeBuild のビルド・デプロイ手順                |
| `settings.gradle` / `gradle.properties` | Gradle プロジェクト設定                         |
| `src/test/java/...`                     | 認証、権限、カレンダー変換の JUnit テスト       |
| `docs/architecture.md`                  | AWS サービスとデータフロー                      |
| `docs/screen-flow.md`                   | 画面遷移とロール別の画面利用                    |
| `docs/authorization.md`                 | 認可方針と権限マトリクス                        |
| `docs/external-design.md`               | 外部設計、ユースケース、接続先、運用制約        |
| `docs/development.md`                   | 開発・ビルド・検証方法                          |
| `docs/coding-standards.md`              | Java・JavaScript・HTML・CSS の実装規約          |

## 機能変更時の確認先

- 認証・権限: `CognitoAuth.java`、対象 API ハンドラー、画面側のフォーム表示、認可テスト。
- 予定データ: `ScheduleApi.java`、`ScheduleRegisterApi.java`、`frontend/src/stores/schedules.ts`、`CalendarView.vue`、`ScheduleFormView.vue`。
- 施設: `FacilityApi.java`、`ScheduleApi.java`、`FacilitiesView.vue`、`services/api.ts`。
- 画像解析: `UploadApi.java`、`ImageProcessor.java`、`DynamoDbService.java`、`stores/uploads.ts`。
- バスケットボール: `BasketballApi.java`、`BasketballRepository.java`、チーム・試合・スコア・ランキングの各 Vue view。
- 共通見た目: `App.vue`、`styles/main.css`、共通 Vue component。
