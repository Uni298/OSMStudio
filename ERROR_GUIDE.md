# エラー解決ガイド

## よくあるエラーと解決方法

### 1. ❌ favicon.ico: 404エラー

**エラーメッセージ:**
```
Failed to load resource: the server responded with a status of 404 (Not Found)
localhost:3000/favicon.ico
```

**原因:** ブラウザが自動的にファビコンを探していますが、ファイルが存在しません。

**影響:** 軽微 - アプリケーションの機能には影響しません。

**解決済み:** HTMLにSVGファビコンを追加しました。

---

### 2. ❌ Cesium Ion API: 401エラー（重要）

**エラーメッセージ:**
```
Failed to load resource: the server responded with a status of 401 ()
api.cesium.com/v1/assets/1/endpoint?access_token=...example
```

**原因:** `js/app.js`に設定されているトークンがプレースホルダー（`.example`）のため、Cesium Ion APIの認証に失敗しています。

**影響:** **重大** - 3D地球ビューアが表示されず、アプリケーションが正しく動作しません。

**解決方法:**

#### ステップ1: Cesium Ionアカウントを作成

1. [https://ion.cesium.com/](https://ion.cesium.com/) にアクセス
2. 「Sign Up」をクリックして無料アカウントを作成
3. Googleアカウントまたはメールアドレスで登録

#### ステップ2: アクセストークンを取得

1. ログイン後、左メニューの「Access Tokens」をクリック
2. 「Default」という名前のトークンが表示されます
3. トークンの値（長い文字列）をコピー

#### ステップ3: トークンを設定

`js/app.js`ファイルを開き、**11行目**を編集：

**変更前:**
```javascript
this.cesiumToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI5N2VhOGM4MS1jOGZkLTRkZGMtYTg2Yi0xNjE4MmE0NzMxNjQiLCJpZCI6MjI1NDQsImlhdCI6MTcwNjc5NzYwNH0.example';
```

**変更後:**
```javascript
this.cesiumToken = 'あなたのトークンをここに貼り付け';
```

#### ステップ4: ページをリロード

ブラウザでページをリロード（F5またはCmd+R）すると、3D地球が表示されます。

---

### 3. ❌ Initialization error: w7

**エラーメッセージ:**
```
app.js:59 Initialization error: w7
```

**原因:** 上記の401エラーが原因で、CesiumJSビューアの初期化に失敗しています。

**影響:** アプリケーションが正しく動作しません。

**解決方法:** 上記の「Cesium Ion API: 401エラー」を解決すれば、このエラーも自動的に解消されます。

---

## エラー解決後の確認事項

トークンを正しく設定した後、以下が表示されるはずです：

✅ 3D地球ビューア（東京周辺）  
✅ 左側のプロパティパネル  
✅ 下部のタイムラインエディタ  
✅ タイムライン上の4つのキーフレームマーカー  
✅ コンソールに「Application initialized successfully」

---

## その他のトラブルシューティング

### サーバーが起動しない

```bash
# ポート3000が使用中の場合
# server/server.js の4行目を編集
const PORT = 3001; // 別のポートに変更
```

### FFmpegが見つからない（動画エクスポート時）

```bash
# FFmpegがインストールされているか確認
ffmpeg -version

# Ubuntu/Debian
sudo apt install ffmpeg

# macOS
brew install ffmpeg
```

### ブラウザコンソールの開き方

- **Chrome/Edge:** F12 または Ctrl+Shift+I (Windows/Linux) / Cmd+Option+I (Mac)
- **Firefox:** F12 または Ctrl+Shift+K (Windows/Linux) / Cmd+Option+K (Mac)

---

## サポート

問題が解決しない場合は、以下を確認してください：

1. Node.jsのバージョン（v14以上が必要）
2. ブラウザのバージョン（最新版を推奨）
3. インターネット接続（CesiumJSはCDNから読み込まれます）
