# セットアップ手順

このファイルは初回セットアップ用のクイックガイドです。

## 1. Cesium Ion トークンを取得

1. [https://ion.cesium.com/](https://ion.cesium.com/) にアクセス
2. 無料アカウントを作成（Googleアカウントでサインアップ可能）
3. ログイン後、左メニューの「Access Tokens」をクリック
4. 「Default」トークンの値をコピー

## 2. トークンを設定

`js/app.js` ファイルを開き、9行目を編集：

```javascript
this.cesiumToken = 'ここにコピーしたトークンを貼り付け';
```

## 3. FFmpegをインストール（動画エクスポート用）

### Ubuntu/Debian:
```bash
sudo apt update
sudo apt install ffmpeg
```

### macOS:
```bash
brew install ffmpeg
```

### Windows:
[FFmpeg公式サイト](https://ffmpeg.org/download.html)からダウンロード

## 4. 依存関係をインストール

```bash
npm install
```

## 5. サーバーを起動

```bash
npm start
```

## 6. ブラウザでアクセス

```
http://localhost:3000
```

これで完了です！3D地球が表示され、キーフレームアニメーションを作成できます。
