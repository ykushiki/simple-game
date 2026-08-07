# 3D RPG Instructions Index

3d_rpg の仕様インデックス。実装変更時はまずこのファイルを参照すること。

## 基本要件
- ゲーム形態はウィザードリィ / ダンジョンマスター系の3DダンジョンRPG。
- 日本の子供向けのポップな絵柄を維持する。

## 詳細仕様
- [画面上のMAP表現](./instructions/map-ui-spec.md)
- [地図データ構造](./instructions/map-data-structure-spec.md)
- [3Dダンジョン表現](./instructions/dungeon-3d-visual-spec.md)
- [3D描画・レンダリング・パフォーマンス設計方針](./instructions/rendering-performance-spec.md)
- [コード品質・命名規則](./instructions/coding-style-spec.md)

## 対象実装
- [index.html](./index.html)

## 運用
- 仕様変更は先にこのインデックス、またはリンク先仕様を更新してから実装すること。