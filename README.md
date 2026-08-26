# まちこえ MVP

「誰が」ではなく「どこで、何が起きたか」を主役にした地域情報マップです。React / TypeScript / Vite / Leaflet / Supabaseで構成しています。

## ローカル起動

```powershell
pnpm install
Copy-Item .env.example .env.local
pnpm dev
```

環境変数を設定していない場合も白画面にはならず、飯田市のデモデータを表示します。この状態では投稿を保存できません。

## Supabaseセットアップ

### 1. プロジェクトを作る

1. [Supabase Dashboard](https://supabase.com/dashboard)へログインします。
2. `New project`を押します。
3. Organization、プロジェクト名、データベースパスワード、Regionを設定して作成します。
4. 準備完了まで数分待ちます。

### 2. データベースを作る

1. 左メニューの`SQL Editor`を開きます。
2. `New query`を押します。
3. [supabase/schema.sql](supabase/schema.sql)の内容をすべてコピーして貼り付けます。
4. `Run`を押します。
5. `Success`になったことを確認します。

このSQLは`places`、`posts`、`reports`、index、RLS policy、Storageバケットを作ります。新規地点と最初の投稿はDB関数内の1トランザクションで保存されます。

### 3. Project URLと公開キーを取得する

Supabase Dashboard上部の`Connect`ダイアログ、または`Project Settings` → `API Keys`を開きます。

- Project URL：`https://xxxxx.supabase.co`形式
- Publishable key：`sb_publishable_...`形式。ブラウザアプリ用として推奨
- Legacy anon key：JWT形式。これも使用可能

`secret`、`service_role`キーはRLSを回避する強い秘密鍵なので、`.env.local`やブラウザコードへ絶対に入れないでください。

### 4. `.env.local`を書く

プロジェクト直下の`.env.local`へ記載します。変数名は互換性のため`ANON_KEY`ですが、値にはPublishable keyを入れられます。

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxxxxxxxx
```

`NEXT_PUBLIC_SUPABASE_URL`と`NEXT_PUBLIC_SUPABASE_ANON_KEY`も読み込み可能ですが、このViteプロジェクトでは`VITE_`形式を推奨します。`.env.local`は`.gitignore`済みです。

### 5. 開発サーバーを再起動する

環境変数は起動時に読み込まれます。実行中なら`Ctrl+C`で止め、再び起動します。

```powershell
pnpm dev
```

画面下の「Supabaseの環境変数が設定されていません」が消えれば接続設定を読み込めています。

### 6. 共有保存を確認する

1. PCで地図上の地点を選び、15文字以上の投稿を公開します。
2. Supabaseの`Table Editor` → `posts`で行が増えたことを確認します。新規地点なら`places`にも行が増えます。
3. PCでページを再読み込みし、同じピンと投稿が残ることを確認します。
4. 同じ公開URLをiPhoneまたは別ブラウザで開き、同じピンと投稿が見えることを確認します。
5. 同じピンの「情報を追加」から投稿し、ピンが増えず投稿件数だけ増えることを確認します。

`localhost`はPC自身でしか開けません。iPhone確認には、後述のデプロイで得た公開URLを使用してください。

## データ保存の仕様

- 投稿の正本はSupabaseです。投稿データをlocalStorageへ保存しません。
- 起動時に公開中の`posts`と、それらに紐づく`places`を取得します。
- 既存ピンへの投稿は同じ`place_id`へ追加されます。
- 新規地点では`create_place_with_post` RPCにより地点と投稿を原子的に作成します。
- 新規地点の80m以内に既存地点がある場合、投稿フォームで候補を表示します。
- 発生時期と投稿日は別カラムです。
- 現在はanon roleで匿名投稿できます。ログイン必須化するときはSQL内のanon insert policyを削除します。
- 写真入力UIは残していますが、Storageへのアップロード接続は次工程です。

## 検証とビルド

```powershell
pnpm install
pnpm run typecheck
pnpm run build
pnpm run preview
```

現時点ではlintスクリプトは未導入です。TypeScriptのstrict型チェックとVite本番ビルドを必須検証にしています。

## デプロイ

Vercel、Netlify、Cloudflare Pagesなどで次を設定します。

- Build command：`pnpm run build`
- Output directory：`dist`
- Environment variables：`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`

デプロイし直した後、発行されたHTTPS URLをPCとiPhoneの両方で開いて共有を確認します。

### Vercel推奨設定

リポジトリには`vercel.json`を含めています。Vercel側の設定は次のとおりです。

- Framework Preset：Vite
- Install Command：`pnpm install --frozen-lockfile`
- Build Command：`pnpm run build`
- Output Directory：`dist`
- Root Directory：リポジトリ直下

VercelのProject Settings → Environment Variablesへ、`VITE_SUPABASE_URL`と`VITE_SUPABASE_ANON_KEY`を登録します。値は`.env.local`からVercel管理画面へ直接入力し、`.env.local`自体はpushしません。

公開URLはHTTPSになるため現在地取得を利用できます。利用者が位置情報を拒否した場合も、住所検索・地図移動・地点選択は引き続き利用できます。

## セキュリティ上の注意

RLSは全テーブルで有効です。未ログイン利用者は公開中の投稿だけ閲覧でき、投稿は指定カラムを持つ公開投稿だけ許可されます。匿名投稿は荒らし対策が限定的なため、公開試験後はSupabase Auth、レート制限、サーバー側モデレーションを追加してください。
