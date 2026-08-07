# 3D Action 実装構造メモ

## 対象ファイル
- game.js: ゲームロジック本体
- index.html: エントリーポイント
- style.css: 表示スタイル
- SkeletonUtils.js: モデル補助ユーティリティ

## 実装上の注意
- game.js を script src で読み込む場合、純粋な JavaScript として解釈可能であること。
- UI の識別子や HUD 仕様は既存挙動と互換を保つこと。
- 戦闘/スコア関連ロジックはコア仕様と矛盾しないよう維持すること。
