# kosukequiz-battle

[kosukequiz](https://github.com/nambanamba/kosukequiz) の問題データを使った、1対1のリアルタイム早押しクイズ対戦アプリです。GitHub Pagesでホストする静的サイトで、対戦相手同士の通信は [Trystero](https://trystero.dev/)（サーバーレスWebRTC）でブラウザ間を直接つなぎます。バックエンドサーバーやアカウント登録は不要です。

## 遊び方

1. 一方が「部屋をつくる」で出題する単元・問題数を選び、発行された4桁のコードをもう一方に伝える
2. もう一方が「部屋に入る」でそのコードを入力して参加
3. 出題された問題に早押しボタンで解答権を取り合い、答え合わせは口頭で行い、押さなかった側が〇✕を判定する
4. 全問終了で結果画面が表示される

## data.js の更新方法

このリポジトリの `data.js` と `images/` は、kosukequiz本体（`G:\マイドライブ\四谷大塚\kosukequiz`）からのコピーです。kosukequiz側の問題データが更新されたら、以下をそのままこちらにもコピーして反映してください（自動連携はしていません）。

```
kosukequiz/data.js       → kosukequiz-battle/data.js
kosukequiz/images/*      → kosukequiz-battle/images/
```

## 通信のしくみ

- `index.html` 内で `https://esm.run/trystero` から Trystero をESM importして使用（ビルド不要）
- 部屋作成時に発行される4桁の数字コードが、そのままTrystero上の部屋IDになる。コードとアプリ固有のappIdの組み合わせで部屋が識別されるため、通常の利用では他の利用者と部屋がぶつかることはない
- 早押しの勝敗判定は「部屋をつくった側（ホスト）」が一元的に決定し、両者に結果を通知することで、双方の端末の時計のずれに影響されず一意に決まるようにしている
- 通信キャリアの回線状況によっては、まれにP2P接続が確立できない場合がある。問題が頻発する場合はFirebaseなど別のシグナリング手段への切り替えを検討する
