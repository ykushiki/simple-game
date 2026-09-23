# Todo

以下は、現時点で未実施または未統合の作業一覧です。

## 1. ルートの完全データ駆動化
- WorldLoader が `SceneDefinitions.js` を実際の生成処理の唯一の情報源として使うように統合する
- InteractableRegistry でシーン定義から取得したオブジェクト群を直接扱うように整理する
- 旧来の `buildWorld()` で残っているハードコードを削減する

## 2. クエスト判定の完全定義化
- `QuestManager` の進行判定を定義ファイル中心に統一する
- `nextQuestId` に基づく遷移と、state ベースの条件判定の境界を明確化する
- 進行中のクエストと完了済みクエストを `progression` で一貫管理する

## 3. 連携の正統化
- `gate.opened` を発火元のイベントと見た目アニメーションの両方で一貫扱いする
- 宝玉取得・門開放・宝箱開放のイベント連携を最終的に 1 系統に揃える
- `world.currentArea` と `ui.locationName` の更新を同期する

## 4. データ制作ツールの実装
- `SceneEditor` を追加し、シーン定義を GUI から編集できるようにする
- `QuestEditor` を追加し、クエスト定義のテキストと条件を編集できるようにする
- `TriggerEditor` と `DialogueEditor` の最小ペインを作る
- `ValidationPanel` に未定義参照と不整合の警告を出す

## 5. 永続化と保存
- `SaveManager` を実装して `localStorage` に進行状況を保存する
- 再読み込み時に `player.orbs` と `world.gateOpened` を復元する
- シーンとクエスト定義の export / import を追加する

## 6. 追加機能とポリッシュ
- BGM / SE の音量制御とオプションを追加する
- 3D モデルや環境の細部調整を行う
- ゲームクリア後の演出とリトライ導線を整える
- モバイル UI のボタン位置や入力感度の最終調整を行う

## 7. 既存の廃止済みロジック整理
- `index.html` の未利用ロジックを削除し、最小構成の bootstrap に整理する
- 画面表示とゲーム動作を分離した完全なモジュール構成に整理する
- 旧来の `interactiveObjects` 生成ロジックと新しい registry ベースの管理を一本化する

## 優先順位
1. クエスト定義と世界定義の完全統合
2. UI と state の同期の最終整理
3. データ制作ツールの最低限の DOM / コンポーネント実装
4. SaveManager と export/import 機能
5. 仕上げと追加演出
