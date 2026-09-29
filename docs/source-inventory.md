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

## ブラウザー画面

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
- 予定データ: `ScheduleApi.java`、`ScheduleRegisterApi.java`、`app.js`、`register.js`、`image-upload-controller.js`。
- 施設: `FacilityApi.java`、`ScheduleApi.java`、`app.js`、`register.js`。
- 画像解析: `UploadApi.java`、`ImageProcessor.java`、`DynamoDbService.java`、`image-jobs.js`。
- バスケットボール: `BasketballApi.java`、`basketball.js`、`basketball.html`、`basketball.css`。
- 共通見た目: `app.css`、`theme.css`、`visual-system.css`、ページ HTML。
