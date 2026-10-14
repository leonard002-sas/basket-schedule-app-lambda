# 外部設計書

## 1. システム概要

Flight Penguins Official Site は、バスケットボールチームの予定、施設、周知事項、練習動画、チーム名簿、試合結果をブラウザーから管理・閲覧する Web アプリケーションです。フロントエンドは静的ファイルとして配信し、データ操作は Java の AWS Lambda API を通じて行います。

## 2. 利用者と権限

| 利用者                                 | 閲覧                                                                 | 登録・編集・削除                                                   |
| -------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| ゲスト（Cognito 認証済み）             | 予定、施設、公開中のお知らせ、チーム、メンバー、試合結果、ランキング | 不可                                                               |
| 管理者（`admins` グループ）            | ゲストと同じ                                                         | 予定、施設、お知らせ、動画リンク、チーム、メンバー、試合、スタッツ |
| ルート管理者（`root-admins` グループ） | 管理者と同じ                                                         | Cognito ユーザー一覧、管理者の昇格・降格、アカウントの停止・削除   |

画面上の表示制御は操作を分かりやすくするためのものです。書き込み API は Cognito の署名済み ID トークンを検証し、管理者向け操作では `admins`、ユーザー管理では `root-admins` グループをサーバー側でも確認します。

## 3. 画面一覧

| 画面                       | URL                    | 主な機能                                                       |
| -------------------------- | ---------------------- | -------------------------------------------------------------- |
| 公開トップ／ダッシュボード | `/app/#/`              | ログイン導線。認証後は今日・今週の予定、周知、主要機能への導線 |
| 参加申請                   | `/app/#/join`          | 表示名付き登録、確認コード、Google登録、管理者承認待ち         |
| 予定表                     | `/app/#/calendar`      | 月カレンダー、予定詳細、出欠・参加者、一括回答、ICS・共有文面  |
| 予定登録                   | `/app/#/schedules/new` | 複数・繰り返し予定、試合情報、画像解析ジョブ                   |
| 施設管理                   | `/app/#/facilities`    | 施設名、住所、URL、備考の登録・編集・無効化                    |
| 周知事項                   | `/app/#/announcements` | 緊急度と掲載期限を持つ周知の登録・編集・削除                   |
| 練習動画                   | `/app/#/videos`        | 予定に紐づく動画リンクの閲覧                                   |
| チーム管理                 | `/app/#/teams`         | チームとメンバーの管理                                         |
| 試合管理                   | `/app/#/games`         | 試合作成・編集、出場者、予定紐付け、CSV移行、試合一覧          |
| ライブスコア               | `/app/#/games/:gameId` | 出場5人、時計、プレー入力、Undo、ボックススコア、試合終了      |
| ランキング                 | `/app/#/rankings`      | シーズン別合計・平均、EFF、選手推移、CSV出力                   |
| アカウント                 | `/app/#/account`       | 表示名・通知、Google連携、ログアウト、Cognito自己削除          |
| ユーザー管理               | `/app/#/users`         | 参加承認、管理者権限、利用停止、アカウント管理                 |

画面間の移動は共通サイドナビゲーションに集約します。現在地は背景と枠線で強調し、管理者向け項目は認証済みロールに応じて表示します。

## 4. 主要な処理

### 4.1 ログインと閲覧

1. ブラウザーから Cognito マネージドログインを開きます。
2. 認証コードを受け取り、フロントエンドが ID トークンとアクセストークンを取得します。
3. 認証済み利用者は API に Bearer ID トークンを付けて読み取りを行います。
4. 管理者でない場合、登録・編集導線を隠し、登録画面への直接アクセスも拒否します。

```mermaid
sequenceDiagram
    actor User as 利用者
    participant UI as CloudFront 上のブラウザー画面
    participant IdP as Cognito
    participant API as Lambda API
    participant DB as DynamoDB
    User->>UI: ログインを選択
    UI->>IdP: 認証コードフローを開始
    IdP-->>UI: 認証コードを返す
    UI->>IdP: コードをトークンに交換
    IdP-->>UI: ID / Access / Refresh token
    UI->>API: Bearer ID token 付き読み取り
    API->>IdP: 公開 JWKS で署名検証
    API->>DB: 認証済みユーザーのデータを取得
    DB-->>API: 対象データ
    API-->>UI: JSON 応答
    UI-->>User: 予定・試合情報を表示
```

### 4.2 予定画像の登録

1. 管理者が画像アップロード API から期限付き S3 PUT URL を取得します。
2. ブラウザーが画像を S3 に直接アップロードします。
3. S3 イベントが画像処理 Lambda を起動します。
4. Lambda が Gemini に画像を送り、抽出したイベントを検証して DynamoDB に保存します。
5. ブラウザーは S3 オブジェクトの処理状態を定期確認し、完了または失敗を表示します。

### 4.3 試合とスタッツ

1. 管理者がチームとメンバーを登録します。
2. 試合を作成するときに今回出場予定のメンバーを選び、必要なら予定表上の試合予定と関連付けます。出場予定外の選手はその試合の出場数や平均に含まれません。
3. 試合中にコート上の選手を選択し、得点・リバウンド等のアクションを記録します。
4. API が試合状態を DynamoDB に保存し、一覧・ランキング・個人推移に反映します。

## 5. 外部インターフェース

| 接続先                       | 用途                                                       | 認証・通信                                       |
| ---------------------------- | ---------------------------------------------------------- | ------------------------------------------------ |
| Amazon Cognito               | サインイン、トークン発行、ユーザー管理、自己アカウント削除 | OAuth 認証コードフロー、Lambda 実行ロール、HTTPS |
| Amazon CloudFront / S3       | 静的画面配信                                               | HTTPS                                            |
| AWS Lambda Function URL      | 予定、施設、チーム、試合の API                             | HTTPS、Bearer ID トークン、CORS                  |
| Amazon DynamoDB              | 予定・施設・バスケットボールデータ                         | Lambda 実行ロール                                |
| Amazon S3                    | 予定画像と処理状態                                         | 期限付きアップロード URL、S3 イベント            |
| Gemini API                   | 予定画像の読み取り                                         | Lambda 環境変数の API キー                       |
| YouTube                      | 練習動画の再生                                             | 限定公開 URL を予定データに保存                  |
| Google Calendar / Outlook 等 | 月単位の予定取り込み                                       | ブラウザーで ICS ファイルを書き出し              |

## 6. データの主要概念

- **予定**: 開始・終了日時、種別、施設、任意の大会名・ラウンド・動画 URL を持ちます。
- **施設**: 名前、住所、URL、備考、表示状態を持ちます。
- **お知らせ**: 見出し、本文、緊急度、有効期限を持ちます。
- **チーム／メンバー**: チームにメンバーを紐付け、ポジション・背番号等を管理します。
- **試合／スタッツ**: 試合情報と選手ごとのプレー記録を保持し、ランキング値を集計します。
- **ユーザー／権限**: Cognito の `admins` はチーム運営、`root-admins` はアカウント管理を担当します。試合ごとに出場予定の選手 ID を保存します。
- **画像処理ジョブ**: S3 オブジェクトキーを識別子として状態・エラー概要を参照します。

DynamoDB の正確なキー名、インデックス、保持期間は実環境のテーブル定義を正とします。データモデルを変更する場合は `docs/architecture.md` とこの設計書も一緒に更新してください。

```mermaid
erDiagram
    FACILITY ||--o{ SCHEDULE : "会場として参照"
    SCHEDULE ||--o| GAME : "試合予定に関連付け"
    TEAM ||--o{ PLAYER : "メンバーを持つ"
    TEAM ||--o{ GAME : "試合を持つ"
    GAME ||--o{ PLAYER_GAME_STATS : "選手記録を持つ"
    PLAYER ||--o{ PLAYER_GAME_STATS : "個人成績を持つ"
    SCHEDULE {
        string scheduleMonth
        string startDateTime
        string endDateTime
        string eventType
        string facilityId
        string videoUrl
    }
    FACILITY {
        string facilityId
        string facilityName
        string address
        string url
        string note
    }
    TEAM {
        string teamId
        string name
    }
    PLAYER {
        string playerId
        string teamId
        string name
        string position
        number number
    }
    GAME {
        string gameId
        string teamId
        string date
        string opponent
        string status
        string scheduleMonth
        string startDateTime
    }
    PLAYER_GAME_STATS {
        string gameId
        string playerId
        number points
        number rebounds
        number assists
    }
```

この図は業務上の関連を表します。現在の実装では DynamoDB の複数テーブル／キーに分かれて保存されるため、物理構造を示すものではありません。

## 7. 非機能要件と制約

- 通信は HTTPS を使用します。
- 認証トークン、個人情報、秘密鍵をログに出力しません。
- ブラウザーの権限判定だけで API 操作を許可しません。
- ファイルアップロードは署名付き URL を利用し、Lambda を経由してファイル本体を転送しません。
- 動画は外部 URL を保存し、動画本体を本システムで保管しません。
- ICS は月ごとの手動取り込みで、Google Calendar との自動同期は行いません。

## 8. 運用と変更の影響範囲

画面項目や導線の変更は `frontend/src/` と本設計書を更新します。API の認可やデータ形状を変える場合は Java Lambda、型定義、フロントエンド API 呼び出し、権限テスト、AWS IAM 設定、アーキテクチャ資料を同時に確認します。デプロイは Git の接続ブランチへの push を契機に CodePipeline / CodeBuild が実行する構成です。
