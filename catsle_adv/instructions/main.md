# 石の城と光の泉 実装仕様書

## 1. 概要

本プロジェクトは、石の城を舞台にした 3D アドベンチャーゲームである。プレイヤーは正門前からスタートし、鉄の門を開けて中庭へ進み、3 つの光の宝玉を集めて宝箱を開くことでゲームをクリアする。

実装の基本方針は、ゲームの表示・入力・進行管理・データ定義を責務ごとに分離し、イベント駆動で状態遷移を管理することである。特に、世界構成とクエスト進行は固定コードではなく、定義データと状態管理を軸に扱う。

---

## 2. 実装済みの基本構造

### 2.1 ルート構成

- index.html
  - ゲーム画面の DOM と起動処理の土台
  - Three.js、Tone.js、UI、ゲーム初期化の読み込みを担う
- js/core/
  - アプリの本体状態管理とイベント基盤
- js/input/
  - 入力の正規化
- js/player/
  - プレイヤー移動とカメラの制御
- js/world/
  - オブジェクトの生成とインタラクション管理
- js/quests/
  - クエスト進行と目標更新
- js/ui/
  - HUD とダイアログの更新
- js/data/
  - シーンとクエストの定義データ

---

## 3. 実装済みのアーキテクチャ

### 3.1 Core 層

#### GameState
- ゲーム全体の状態を一元管理する
- player, camera, world, ui, inventory, input, progression を保持する
- get(path) と set(path, value) で状態の読み書きを行う
- mode を START / PLAYING / CLEAR で管理する

#### EventBus
- モジュール間の連携に pub/sub を採用する
- 代表的なイベント:
  - gate.opened
  - orb.collected
  - chest.opened
  - quest.completed

#### Config
- 移動速度、境界、インタラクト距離、宝玉名などの定数を管理する
- 生成や判定ロジックのハードコード化を避ける役割を持つ

#### GameApp
- アプリの起動と update loop の開始を担う
- bindWindow() で入力イベントを結びつける
- updateFrame() でプレイヤー処理とカメラ更新を実行する

---

### 3.2 Input / Player 層

#### InputManager
- キーボード、マウス、タッチの入力を正規化する
- snapshot() によりゲームループ側で使いやすい入力状態を返す
- モバイルとデスクトップの操作差を吸収する

#### PlayerController
- プレイヤーの移動とカメラの向き更新を担う
- canMoveTo() を踏まえた前進・回転処理を行う
- 実際の座標と視線に応じて player.x / player.z / yaw / pitch を更新する

---

### 3.3 World 層

#### WorldLoader
- ゲーム世界の基本構造を生成する
- gate, fountain, gin, orb, chest を生成し、シーンに配置する
- bindRegistry() で interactable 収集と検索用レジストリを接続する

#### InteractableRegistry
- 近距離にある対象の取得と、操作プロンプトの生成を担う
- findNearby() で対象を特定する
- getPromptText() で [E] 表示や状態に応じた説明文を返す

---

### 3.4 Quest 層

#### QuestManager
- クエストの進行状態を管理する
- handleGateOpened(), handleOrbCollected(), handleChestOpened() で状態更新を行う
- syncUI() により HUD と目的テキストを反映する

#### QuestDefinitions
- open_gate
- collect_orbs
- open_chest

の 3 つの定義を持ち、predicate で条件を判断する。

---

### 3.5 UI 層

#### UIController
- 位置名と目的文の表示更新を担当する
- ダイアログ表示やインタラクションプロンプトを制御する
- 画面上のゲーム状態を一貫して更新する

---

## 4. 取り扱うゲームデータ

### 4.1 Scene Definitions

js/data/SceneDefinitions.js には、シーンごとの定義を持つ。

- front_gate
- courtyard

各シーンは以下を保持する。

- id
- name
- spawn
- interactables

これにより、マップの生成情報をデータとして定義できるようになっている。

### 4.2 Quest Definitions

js/data/QuestDefinitions.js には、クエスト定義を持つ。

- id
- locationName
- objectiveText
- predicate
- nextQuestId

predicate は GameState を受け取り、現在の進行段階を判断する。

---

## 5. ゲームフロー

1. ゲーム開始時、初期位置は正門前に設定される
2. プレイヤーは鉄の門に近づき、インタラクションで門を開ける
3. gate.opened イベントが発火し、world.gateOpened が true になる
4. 目的テキストが中庭探索へ切り替わる
5. 3 つの宝玉を収集する
6. 宝箱を開け、ゲームクリアとする

---

## 6. 現在の状態と仕様の整合

### 6.1 実装済みの仕様
- ゲームは GameState を中心とした状態管理を採用している
- UI、イベント、クエスト、世界生成の責務が分離されている
- シーンとクエストの定義データは JS ファイルとして分離されている
- gate の開放状態は world.gateOpened で保持される
- QuestManager はイベントを受けて目標更新を行う

### 6.2 重要な運用ルール
- 画面表示やイベント発火は state を起点に更新する
- 直接の if 分岐ではなく、state と定義データで判断する
- 追加コンテンツは scene / quest の定義ファイルへの追記が基本となる

---

## 7. 現在の責務分離

### Core
- GameState
- EventBus
- Config
- GameApp

### Input
- InputManager

### Player
- PlayerController

### World
- WorldLoader
- InteractableRegistry

### Quest
- QuestManager
- QuestDefinitions

### UI
- UIController

### Data
- SceneDefinitions
- QuestDefinitions

---

## 8. 既知の制約と今後の整理対象

現在の実装は機能しているが、以下の整理が残っている。

- index.html の旧来のロジックを完全に分離しきれていない
- WorldLoader と SceneDefinitions の接続をさらに強化する必要がある
- QuestManager の判定を完全に定義ベースへ寄せる必要がある
- 管理画面の編集ツール群は未実装である
- 永続化と保存機能は未実装である

これらは todo.md に分離して、今後の作業対象として管理する。

---

## 9. 実装に関する基本方針

- 見た目の変更を避けながら責務を分離する
- 実行中のゲーム動作を壊さずに、定義データへ置き換える
- すべてのゲーム進行は GameState と EventBus を通す
- 新しいシーンやクエストは定義ファイルに追加するだけで増やせるようにする

---

## 10. まとめ

現在の実装では、ゲームの本体が「モジュール化された state-driven architecture」へ移行している。特に、GameState と EventBus を中心として、入力、移動、世界、クエスト、UI が分離されている。さらに、SceneDefinitions と QuestDefinitions によりデータ側の構造も定義されており、今後のコンテンツ拡張に向けた基盤が整っている。

本書は実装仕様書として扱い、未実施項目は todo.md に分離して管理する。
