# Suika Split (Three.js + TypeScript)

Three.js と TypeScript でスイカ割り体験を作るサンプルです。砂浜の上でキャラクターを操作し、スペースキーで一撃フルスイングしてスイカを割りましょう。

## 主な機能

- Three.js ベースのライトウェイトなゲームループ
- HeightMap ベースの砂浜と水面シェーダー
- VRM モデル（void.vrm）を主人公として表示
- VRM の右手にBoxメッシュ製のバットを装備してスイング
- Ammo.js ベースの物理判定でバットとスイカの衝突を検出
- スペースキー1回押しの即スイング、Enter でのリスタート
- 水面やビーチを含むThree.jsシーンとステータスHUD
- watermelon.glb / broken_watermelon.glb を使った一撃スイカ割り表現

## 操作説明

| アクション | 入力 |
| --- | --- |
| 前後移動 | `W` / `S` または `↑` / `↓` |
| 向き変更 | `A` / `D` または `←` / `→` |
| スイング | `Space`（押した瞬間にスイング） |

## 開発

```bash
pnpm install
pnpm dev
```

## 本番ビルド

```bash
pnpm production
pnpm preview
```

`pnpm dev` を起動したらブラウザで `http://localhost:5173` を開き、スタートボタンを押してプレイしてください。
