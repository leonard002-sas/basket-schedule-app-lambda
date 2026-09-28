# Claude Code 引き継ぎ資料

更新日: 2026-09-28
対象リポジトリ: `leonard002-sas/basket-schedule-app-lambda`
作業ブランチ: `test-branch`

## Claude Codeへの依頼

この資料とリポジトリの実コードを読んでから作業を始めてください。現在、バスケットボール記録機能の画面分割・複数チーム対応を追加した直後で、チームや選手の取得がHTTP 500になる問題を調査中です。まずAWSのCodePipeline実行結果と`basket-schedule-get` LambdaのCloudWatchログを確認し、根本原因を特定してください。コード変更やpushの前に、ローカルGit履歴とGitHubのブランチがずれている点を確認してください。

## システム概要

個人開発のバスケットボール予定・施設管理アプリです。フロントエンドは静的なHTML/CSS/JavaScript、APIはJava 25のAWS Lambda、データはDynamoDBに保存します。予定画像はS3にアップロードし、LambdaからGemini APIで予定を抽出します。

### 主なAWSリソース

- AWSリージョン: `ap-northeast-1`
- Webサイト: S3バケット `basket-schedule-web` に静的ファイルを配置し、CloudFrontで配信
- CloudFront URL: `https://d13o4oynf3jxlu.cloudfront.net/`
- CloudFront distribution ID: `EMBH1RVLQTXDG`
- 予定・スコアAPI: Lambda `basket-schedule-get` のFunction URL
    - `https://7yxh3p2c5swyx6ajv45ldmiswe0tirop.lambda-url.ap-northeast-1.on.aws/`
- 施設API: Lambda `FacilityApi`
- 画像アップロードAPI: Lambda `basket-schedule-upload`
- 画像解析Lambda: `basket-schedule-image-processor`
- 予定登録Lambda: `ScheduleRegisterApi`
- DynamoDBテーブル:
    - `BasketSchedule`: 予定
    - `BasketFacility`: 施設
    - `BasketballData`: チーム・選手・試合・試合スタッツ・ランキング
- Cognito User Pool: `ap-northeast-1_Cd5fxLwj3`
- Cognito App Client: `3mr9ep2rosop9ratlg1l3bta70`

## 認証と権限

フロントエンドはCognitoの認証コードフローを利用し、IDトークンを`localStorage`の`id_token`に保持します。各API呼び出しで`Authorization: Bearer <ID token>`を送ります。

`CognitoAuth.java`が署名・issuer・audience・有効期限などを検証します。GETはログイン済みユーザー、PUTなどの更新はCognitoグループ`admins`のメンバーに限定しています。ブラウザー側の表示制御だけに頼らず、APIでも管理者権限を検証しています。

CodeBuildの実行ロールとLambdaの実行ロールは別物です。CodeBuildロールにはFunction URL設定更新などのデプロイ権限が必要です。`BasketballData`へのDynamoDB読み書きポリシーは`basket-schedule-get` Lambdaの実行ロールに付けます。

## Git・デプロイ連携

- Git remote: `https://github.com/leonard002-sas/basket-schedule-app-lambda.git`
- 主な作業ブランチ: `test-branch`
- CodePipelineがブランチへのpushを検知し、CodeBuildでビルド・デプロイする構成です。
- `buildspec.yml`はGradle buildの後、Function URLのCORS設定、複数Lambdaへのjar配置、S3への静的ファイル同期、CloudFront invalidationを実行します。
- 通常のデプロイ先は上記CloudFrontサイトです。ブランチのCodePipeline実行結果を確認してからサイトを確認してください。

### Git状態の注意

引き継ぎ時点でGitHubの`test-branch`最新コミットは`dcc82a0abeb2e2d89122c4dc7bbad73c9bc07b15`（`Log basketball API internal errors`）です。一方、この作業フォルダのローカルHEADは`7c26d46`で、ローカルbranch表示は`origin/test-branch [ahead 6]`です。過去の変更はCodexのGitHub連携から直接GitHubにコミットしたため、ローカルGit履歴・remote-tracking refがGitHubの実際の履歴と同期していません。

このフォルダではさらに複数の実装ファイルがmodified/untrackedと表示されますが、GitHub側にはすでにコミット済みの内容を含みます。**`git reset --hard`、強制push、ローカルHEADをそのままpushしないでください。** 最新GitHubの`test-branch`を確認し、作業ツリーの差分をファイル単位で比較してから同期方法を決めてください。`gradle-home-fresh/`はGradleキャッシュで、コミット対象ではありません。

## 現在の機能

### 予定アプリ

- カレンダーを初期表示し、ログインユーザー向けに予定・施設を取得します。
- 管理者は予定表画像をアップロードし、バックグラウンドの画像解析処理で予定を登録できます。
- S3に画像を置き、画像解析LambdaがGemini APIを呼び出し、予定データをDynamoDBへ保存する構成です。
- 施設の登録・編集と備考、試合予定からスコア記録画面への導線があります。
- Google Calendarへの取り込み用ICSを生成する機能があります。

### バスケットボールスコアブック

`basketball.html`を`view`クエリで切り替える単一ページ構成です。

- `?view=teams`: チーム登録・選択、チームメンバー登録
- `?view=games`: 試合登録、試合一覧、詳細、ライブスコア記録
- `?view=rankings`: シーズンランキング
- URLに日付情報がある場合は試合管理を開きます。カレンダーの試合詳細から遷移します。
- 現状、試合は対戦相手・日付・1Qの時間を登録します。ライブ記録は4Q、時計、コート上の5人、2P/3P/FT、REB、AST、STL、BLK、TO、PF、undo、試合確定を扱います。
- 確定後に選手別シーズン累計と勝敗・各種率/EFFをランキング表示します。
- チーム選択は画面共通で、選手・試合・ランキングをチームごとに分離しています。

### スコアデータのキー構成

テーブル`BasketballData`はパーティションキー`pk`（String）、ソートキー`sk`（String）、オンデマンド課金です。GSIは使いません。

- チーム一覧: `pk=BASKETBALL`, `sk=TEAM#<teamId>`
- チームプロフィール・メンバー・試合一覧: `pk=TEAM#<teamId>`、sort keyは`PROFILE`、`PLAYER#...`、`GAME#...`
- 試合メタ・選手別試合スタッツ・イベント: `pk=GAME#<gameId>`、sort keyは`META`、`PLAYER#...`、`EVENT#...`
- チーム別シーズン集計: `pk=SEASON#<year>#TEAM#<teamId>`、`sk=PLAYER#...`
- 旧単一チームの`TEAM#MAIN`と`SEASON#<year>`を読む互換処理があります。

## 主要ファイル

- `src/main/java/com/basketschedule/ScheduleApi.java`: 予定API。認証とルーティングを行い、予定・施設のDB操作は`ScheduleRepository`へ委譲します。`feature=basketball`は`BasketballApi`へルーティングします。
- `src/main/java/com/basketschedule/LambdaRequestParser.java`: Lambda/API GatewayイベントからHTTPメソッド、クエリ、本文を取り出します。
- `src/main/java/com/basketschedule/BasketballApi.java`: スコアブックのREST風GET/PUT、DynamoDB処理、Cognito認可、スタッツ集計。
- `src/main/java/com/basketschedule/CognitoAuth.java`: Cognito ID token検証と`admins`グループ検証。
- `src/main/resources/static/index.html`, `app.js`, `app.css`: カレンダー画面、認証UI、予定登録・施設・ICS。
- `src/main/resources/static/basketball.html`, `basketball.js`, `basketball.css`: チーム、試合、ライブスコア、ランキング。
- `src/main/resources/static/image-jobs.js`: 画像解析ジョブの進捗表示。
- `src/main/java/com/basketschedule/ImageProcessor.java`: S3画像を取得しGeminiで予定解析。
- `src/main/java/com/basketschedule/UploadApi.java`: 画像アップロード処理。
- `src/main/java/com/basketschedule/ScheduleRegisterApi.java`: 解析結果の予定登録。
- `src/main/java/com/basketschedule/FacilityApi.java`: 施設API。
- `src/main/java/com/basketschedule/DynamoDbService.java`: DynamoDBアクセス関連。
- `buildspec.yml`: AWS CodeBuildのbuild/deploy手順。
- `AWS_BASKETBALL_SETUP.md`: スコアブック用テーブルとLambdaロールポリシーの設定手順。

## スコアブックAPIのHTTP 500: 原因特定・修正済み、デプロイ確認待ち

ユーザーが報告したブラウザーエラー:

```text
GET ...?feature=basketball&resource=players&teamId=MAIN 500 (Internal Server Error)
スコア情報を保存できませんでした
```

チーム作成・試合作成でも失敗するとのことですが、最初に失敗しているのは`GET players`です。画面の`loadEverything()`がチーム・選手・試合・ランキング取得を並列に行い、その一つが失敗すると画面の初期読み込みが失敗します。

CloudWatchログで原因を特定しました。`GET players`と`GET team`がDynamoDBの`AttributeValue`を含むMap/ListをそのままJSONシリアライズし、Jacksonの`InvalidDefinitionException`になっていました。`read()`で`team`は`plain()`、`players`/`games`/`leaderboard`は`plainList()`を通すよう修正し、コミット`9540ff8`を`test-branch`へpushしました。CodePipelineの実行成功と、サイトでの登録・一覧表示を確認してください。

ログ上はフォームPUT後の一覧更新GETでエラーが出ていました。PUTが成功した後の再取得で画面が失敗していた可能性があります。修正版のデプロイ後、チーム・試合が既に一覧に存在するか確認してから再登録してください。試合を再送すると重複作成になる可能性があります。

予期しない例外はCloudWatchに次の形式で記録されるようにしてあります:

```text
Basketball API error [GET players]: <例外クラス>: <AWS SDKエラーメッセージ>
```

もし修正版デプロイ後も500が出る場合は、AWS Lambda `basket-schedule-get`のCloudWatch log groupで失敗時刻のログを確認し、次を切り分けます。

1. `ResourceNotFoundException`: DynamoDBテーブル名・リージョン・作成状態
2. `AccessDeniedException`: `basket-schedule-get`のLambda実行ロールに付けた`BasketballDataDynamoDBAccess`とResource ARN
3. `ValidationException`: テーブルのキー名/型が`pk`/`sk` Stringか、Query条件と一致するか
4. `teams`リクエストと`players`リクエストで違うテーブル/コードが実行されていないか

Lambda環境は`BasketballData`を`ap-northeast-1`で参照します。ポリシーは少なくともテーブル`arn:aws:dynamodb:ap-northeast-1:605419152870:table/BasketballData`に対する`GetItem, PutItem, UpdateItem, DeleteItem, Query, TransactWriteItems`を必要とします。CloudWatchの例外メッセージを見ずに、IAMやテーブルを推測で変更しないでください。

## CORSで注意すること

Function URLのCORS設定は`buildspec.yml`にあり、CloudFront originと`GET, PUT, DELETE`、`authorization, content-type`を許可します。以前、Function URL側と`BasketballApi`の両方が`Access-Control-Allow-Origin`を返して、ブラウザーから「multiple values」と拒否されました。現在は`BasketballApi.response()`からそのヘッダーを取り除き、Function URLのCORS設定だけが付与する形です。再度コード側で`Access-Control-Allow-Origin`を追加しないでください。

## ビルド・確認の状況

- `node --check`で`basketball.js`と`app.js`の構文確認を実施済みです。
- `git diff --check`は通っています（Windowsの改行コードに関する警告は出ます）。
- GradleのJavaコンパイルはローカルGradleキャッシュの`checker-qual-3.43.0.jar`に対する`AccessDeniedException`で止まりました。Javaコードがコンパイル済みであることはローカルでは確認できていません。
- CodeBuildの最新実行結果はまだ確認していません。AWSコンソールで`test-branch`のpipeline実行とbuildログを確認してください。
- 自動テストは実行していません。
