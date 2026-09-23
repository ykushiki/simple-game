To Do リストを更新しました

実装順をそのまま着手できる粒度まで落とし込みます。まずは現行の責務分解を踏まえて、最小単位のモジュール構成と編集順を具体化します。

## 実装に落とし込んだ設計案

今回の方針は、index.html を「ゲーム本体の土台」として残しつつ、ロジックを責務ごとに分割することです。  
最初の目標は、見た目を変えずに、コードを 1 つの巨大スクリプトから、7〜10 個の小さなモジュールに分けることです。

---

## 1. モジュール分割案

### A. Core 層
この層は、ゲーム全体を動かす骨格です。

- GameApp
  - 画面起動、Three.js 初期化、更新ループ開始
  - scene / renderer / camera / clock を保持
  - 他モジュールを組み立てて接続する

- EventBus
  - player:move, interaction:trigger, quest:progress, ui:showDialog などのイベントを配信
  - モジュール間を直接参照しない設計にする

- GameState
  - player position, inventory, current map, quest state
  - 現在のゲーム状態 START / PLAYING / CLEAR を保持

- Config
  - 移動速度、判定距離、オブジェクト ID、宝玉名、位置座標などの定数

役割:
- 「どのモジュールが何をしているか」を明確にする
- 将来のマップ追加やイベント追加をしやすくする

---

### B. Input / Player 層
プレイヤー操作を分離します。

- InputManager
  - キーボード / マウス / タッチ入力を正規化
  - moveX, moveZ, lookYaw, lookPitch, interact を生成
  - PC とモバイル両方で同じ入力イベントに変換する

- PlayerController
  - 位置更新、衝突判定、カメラ位置反映
  - 現在の player.x / player.z / yaw / pitch を更新
  - canMoveTo のような移動判定をここにまとめる

- CameraRig
  - 視点の回転
  - カメラの pitch 制限
  - 第1人称視点の更新

- PlayerState
  - 固定データと実行時データの分離
  - orbs, currentArea, facing, speed

役割:
- 「入力の受け取り」と「プレイヤーの移動」などを分離し、UI・世界生成に依存しないようにする

---

### C. World / Scene 層
フィールドとインタラクションの責任を分けます。

- WorldLoader
  - 3D の地形、噴水、門、宝玉、宝箱、ギンを生成
  - オブジェクト ID と座標を定義
  - セットアップ順番を安全に管理

- InteractableRegistry
  - gate, fountain, orb, chest, gin などのインタラクティブ対象を登録
  - オブジェクト取得時の近接判定をまとめる
  - 近くにあるものを選ぶ処理を一本化する

- AreaManager
  - 正門前 / 花の中庭 / 城の内部 などの区画管理
  - 不可視の領域や進入制限を持つ

- Collisions
  - canMoveTo のような境界判定を独立化
  - 将来の障害物や壁の追加に対応できる

役割:
- フィールドの生成と「ゲーム状態との接続」を切り分ける
- 新しいマップやイベントを追加しやすくする

---

### D. Quest / Progression 層
現在の if 文の連鎖を、QuestManager に集約します。

- QuestDefinition
  - id, name, description, conditions
  - 例: gate_opened, fountain_drunk, orb_collected_all

- QuestManager
  - クエストの開始 / 進行 / 完了を管理
  - eventBus を購読して progress を更新
  - UI の目的表示もここから出す

- ProgressTracker
  - 宝玉の取得状況、宝箱の状態、解放済みイベントを保存
  - 構成要素ごとに「完了フラグ」を持つ

- TriggerSystem
  - Interact, zoneEnter, itemPickUp, NPCTalk の発火を統合管理

役割:
- 「宝玉を3個集めたら宝箱を開けられる」のような条件を、データとして持てるようにする

---

### E. UI / Presentation 層
表示系はロジックと切り離します。

- UIController
  - start-screen, hud, story-dialog, clear-screen を制御
  - 表示状態の切り替え

- ObjectiveView
  - location-name と objective-text を更新
  - クエストの文章を反映

- InventoryView
  - 宝玉表示を ON / OFF で更新

- DialogView
  - 発話内容、話者名、アイコンを描画

- Toast / Prompt
  - [E] を押す表示を制御

役割:
- ゲーム状態の変更が UI に直接影響しすぎないようにする

---

### F. Audio / Save / Data 層
小さな補助モジュールとして分離します。

- AudioManager
  - 効果音、音量、Tone.js ラッパー

- SaveManager
  - 進行状況を localStorage などに保存
  - ゲーム再開時に復元

- DataFiles
  - マップ定義
  - クエスト定義
  - オブジェクト名とテキスト定義

役割:
- ロジックとデータを分け、将来のコンテンツ追加を簡単にする

---

## 2. どのファイルから着手するべきか

最初に着手するのは、次の 3 つです。

### 優先度 1: index.html
このファイルを、仮の土台ページとして残すのがよいです。

役割:
- 画面の DOM 構造
- モジュール読み込み
- アプリ起動コード

ここから分離するときは、まず「HTML をそのまま表示させたまま、script の読み込みだけ分ける」のが安全です。

---

### 優先度 2: 新規作成する core 系ファイル
よく使う基盤を先に独立させます。

おすすめ順:
1. catsle_adv/js/core/GameState.js
2. catsle_adv/js/core/EventBus.js
3. catsle_adv/js/core/Config.js
4. catsle_adv/js/core/GameApp.js

この 4 つを作ると、後続のモジュールが依存しやすくなります。

---

### 優先度 3: Input と Player
次に動かすのは操作系です。

- catsle_adv/js/input/InputManager.js
- catsle_adv/js/player/PlayerController.js
- catsle_adv/js/player/CameraRig.js

理由:
- 今の実装で最も複雑なのが入力と移動
- ここをきれいに分けると、次の world/quest 側の変更がしやすい

---

### 優先度 4: WorldLoader と InteractableRegistry
次は世界生成です。

- catsle_adv/js/world/WorldLoader.js
- catsle_adv/js/world/InteractableRegistry.js
- catsle_adv/js/world/AreaManager.js

ここで、buildWorld の中身を分解します。

---

### 優先度 5: QuestManager
クエスト系は最初ほど大変ではありませんが、イベントの導線が必要なので、world 系の後に着手するのが安定します。

- catsle_adv/js/quests/QuestDefinition.js
- catsle_adv/js/quests/QuestManager.js
- catsle_adv/js/quests/ProgressTracker.js

---

### 優先度 6: UI と Save
最後に UI と永続化です。

- catsle_adv/js/ui/UIController.js
- catsle_adv/js/ui/ObjectiveView.js
- catsle_adv/js/audio/AudioManager.js
- catsle_adv/js/save/SaveManager.js

---

## 3. 実装順の詳細

### Phase 1: 基盤の整理
1. index.html から定数を追い出す
2. GameState と EventBus を作る
3. Config に定数を寄せる
4. GameApp で初期化だけを管理する

最重要ポイント:
- ここでは動作を変えない
- 既存のロジックを壊さない
- まずは「状態とイベントを持つ基盤」をつくる

---

### Phase 2: 入力と移動を切り離す
1. InputManager を作って keyboard / touch を正規化
2. PlayerController に move と collision 判定を持たせる
3. CameraRig に look 制御を移す
4. index.html の keydown / mousemove / touchmove を削減する

ここでやること:
- player.x / player.z の更新
- mouseYaw / mousePitch の管理
- canMoveTo の責務を PlayerController に移す

---

### Phase 3: 世界生成をデータ駆動にする
1. FieldDefinition を作る
2. WorldLoader に 3D オブジェクト生成を切り出す
3. InteractableRegistry に gate / fountain / orb / chest / gin の登録
4. buildWorld が呼ぶのは「データ読み込み」だけにする

注意点:
- 今の createOrb や createTreasureChest はそのままではなく、ObjectFactory に寄せる
- 座標や型は config から持つようにする

---

### Phase 4: クエストを切り出す
1. QuestDefinition を持つ
2. QuestManager がイベントを受ける
3. 宝玉取得時、門開放時、宝箱開放時をイベント化する
4. objective-text は quest manager から更新する

例:
- gate.opened → quest step: enterCourtyard
- orb.collected:sun → quest step: collectSunOrb
- all orbs obtained → quest step: unlockChest

---

### Phase 5: UI を分離する
1. UIController を作る
2. story-dialog と interaction-prompt を制御
3. HUD 更新を QuestManager と同期する
4. start / clear の表示切り替えを module 化する

ここで行う修正:
- promptText の生成を UI 層へ移す
- 表示文言をハードコードから quest データへ分離する

---

### Phase 6: セーブ機能と将来拡張
1. SaveManager を追加
2. inventory と quest progress を保存
3. マップ遷移時の状態復帰を可能にする
4. 将来のシナリオ追加に向けて JSON ベースを検討

---

## 4. 実際に最初に分割すべき小さい塊

ここが一番重要です。

最初の切り出しは、この 5 つを先に別ファイルにしてしまうのが安全です。

1. GameState
2. EventBus
3. Config
4. InputManager
5. PlayerController

この 5 つを作ってから、残りの World / Quest / UI を分離すると、将来の restructure が安定します。

---

## 5. 実務上の編集戦略

### ルール
- まずはファイルを新規作成して、既存のコードを少しずつ移す
- 一度に 1 つの責務だけ切り出す
- 既存の動作を壊したら、戻してやり直す
- UI と game logic は同時に触らない

### 実際の作業順
1. index.html に script tag の整理
2. GameState と EventBus を導入
3. InputManager にイベントを吸収
4. PlayerController に movement ロジックを移す
5. WorldLoader に生成処理を移す
6. QuestManager に条件ロジックを移す
7. UIController に表示を切り出す
8. SaveManager を追加

---

## 6. 期待できる効果

- ゲームロジックと表示ロジックが分離される
- マップ追加が簡単になる
- 新しい宝玉やイベントの追加が、既存コードの大改修なしで可能になる
- クエストが「条件の並列管理」になる
- 今後のシナリオ数増加にも耐える

---

## 7. 次の一手

この設計を実装に進めるなら、次はこの順番で着手します。

1. catsle_adv/js/core/Config.js を作る
2. catsle_adv/js/core/GameState.js を作る
3. catsle_adv/js/core/EventBus.js を作る
4. catsle_adv/js/input/InputManager.js を作る
5. catsle_adv/js/player/PlayerController.js を作る

この 5 つができれば、残りの World / Quest / UI は自然に繋げられます。

必要なら次に、実際のファイル構成と、各モジュールの責務をもっと具体化した 「初期リファクタの差分作成手順」 まで続けて書きます。


To Do リストを更新しました

初期リファクタの差分を実務的に作れる粒度まで、ファイル構成と責務を具体化して整理します。

## 初期リファクタの差分作成手順

ここからは、実際に差分を作る前提で、最小変更で安全にリファクタする手順を示します。  
前提として、index.html を「起動ページ」として残し、ロジックだけをモジュールへ移す流れにします。

---

## 1. 最初の構成案

初期の分割は、次の 6 層で十分です。

- Core
  - ゲーム状態、イベント、定数、起動
- Input
  - キーボード / タッチ / マウス入力
- Player
  - 位置、向き、移動、カメラ
- World
  - マップ生成、オブジェクト定義、触れられる対象
- Quest
  - 現在の目標、進捗、完了判定
- UI
  - HUD、ダイアログ、開始画面、クリア画面

必要最小限の分離として、これで実装の見通しがかなり良くなります。

---

## 2. 各モジュールの責務を明確化する

### Core 層
責務:
- アプリ起動
- ループ開始
- scene / camera / renderer の保持
- ゲーム状態の初期化
- グローバル定数の管理

持つもの:
- GameState
- EventBus
- Config
- GameApp

ここは「どのモジュールが何をしているか」を定義する層です。  
この層ができてから、他の層が依存しやすくなります。

---

### Input 層
責務:
- キーボード入力
- マウス視点操作
- タッチ移動
- E キーのインタラクト
- スティック入力の正規化

持つもの:
- InputManager

役割の境界:
- 入力イベントの解釈はここ
- 実際の移動処理は PlayerController 側

これを分けると、モバイル用 UI と PC 操作が一致します。

---

### Player 層
責務:
- 位置更新
- 向き更新
- camera.position の反映
- 衝突判定
- プレイヤー状態の保持

持つもの:
- PlayerController
- PlayerState
- CameraRig

ここは最も重要な移動ロジックの塊です。  
今の player オブジェクトと mouseYaw / mousePitch / canMoveTo をここに集約させます。

---

### World 層
責務:
- マップ生成
- オブジェクト生成
- 近接判定
- インタラクティブ対象の登録
- エリア境界の管理

持つもの:
- WorldLoader
- InteractableRegistry
- AreaManager

現在の buildWorld は、景観生成とゲームロジックが同居しているので、ここを最後に分離します。  
最初の段階では、オブジェクトの生成だけを移し、ゲーム条件はまだ残すのが安全です。

---

### Quest 層
責務:
- 目的テキストの更新
- 宝玉取得進捗
- ゲート開放の条件
- 宝箱の解放判定
- クリア判定

持つもの:
- QuestManager
- QuestDefinition
- ProgressTracker

ここで「if 文の連鎖」をなくします。  
宝玉取得時に quest manager がイベントを受け取り、進捗を更新するようにします。

---

### UI 層
責務:
- HUD 更新
- ダイアログ表示
- 画面遷移
- インタラクションプロンプト表示
- クリア画面制御

持つもの:
- UIController
- DialogView
- ObjectiveView
- InventoryView

UI はロジックと切り離して、状態変化を受けて表示だけを更新させます。

---

## 3. 初期リファクタで実際に作るべき順番

### Step 1: 既存のコードを確認して、移動対象を決める
先にやること:
- player 周りの変数を特定する
- gate / fountain / orb / chest / gin を interactables として扱う
- objective-text と location-name の更新箇所を特定する
- buildWorld 関連の生成コードを箇条書きにする

この時点で、差分は「移動対象一覧」を作るだけでよいです。

---

### Step 2: Core から作る
先に作るべき最小構成:
- GameState
- EventBus
- Config
- GameApp

この 4 つを先に作ると、他のモジュールが共通のインターフェースを持てます。

差分の意図:
- グローバル変数を削減する
- 大域変数で管理していた状態を state に寄せる

例:
- player の直接参照を state.player に分離
- mouseYaw / mousePitch を state.camera に寄せる
- gateIsOpen を state.world.gateOpened に寄せる

---

### Step 3: InputManager を作る
この段階での対象:
- keydown / keyup
- mousemove
- touchstart / touchmove / touchend
- turn button events
- E キーアクション

入力系は最初に独立させると、後の PlayerController が楽になります。  
差分のルールは「入力イベントの解釈を InputManager に寄せる」です。

例:
- InputManager が moveX, moveZ, lookDeltaX, lookDeltaY, interact を発火
- PlayerController がその値を使って動く

これで、ゲームループから input 周りを追う必要がなくなります。

---

### Step 4: PlayerController を作る
移動対象:
- updatePlayer 関数
- camera.position 更新
- collision 判定
- player.x / player.z 更新
- gin の追従位置更新

ここで残すべきもの:
- 物理演算の処理
- 移動に関するロジック

削るもの:
- UI 表示
- 会話
- 宝箱条件判定
- 進行状況

これができると、Input と Player の責務が明確になります。

---

### Step 5: WorldLoader を作る
移動対象:
- buildWorld
- createOrb
- createTreasureChest
- gate 作成
- fountain 作成
- 実際の Three.js mesh 作成

差分の方針:
- buildWorld は「世界生成の orchestrator」
- createOrb のような生成メソッドは、WorldLoader または factory 系へ寄せる
- オブジェクト生成を struct で管理する

例:
- world.registry.add("orb-sun", { type: "orb", id: "sun", x: ..., z: ... })
- world.spawnInteractable("orb", ...)

この時点で、ゲームロジックがすべて世界生成コード中に埋もれないようにします。

---

### Step 6: InteractableRegistry を作る
ここで責務を整理します。

対象:
- gate
- fountain
- gin
- orb
- chest

役割:
- 近くにあるものを取得する
- どのインタラクションの種類かを返す
- 実際の処理を QuestManager/UI へ委譲する

ポイント:
- triggerInteraction は現状の if 文が多いので、ここで分離する
- 近接判定だけを registry に寄せる

---

### Step 7: QuestManager を作る
今の triggerInteraction の中核がここに入ります。

移動対象:
- 宝玉取得判定
- gate 開放フラグ
- 宝箱開放判定
- クリア判定
- objective-text 更新

この時点で、下記のようなイベント化を行います。

- "orb.collected"
- "gate.opened"
- "quest.objective.changed"
- "game.clear"

QuestManager が受け取るイベント:
- 物を拾った
- エリアへ入った
- 会話した
- 宝箱に触れた

これにより、UI とロジックの接続が一貫します。

---

### Step 8: UIController を作る
対象:
- dialog
- interaction prompt
- HUD
- start-screen
- clear-screen

責務:
- 表示状態の切り替え
- 要素の更新
- 画面遷移

ここで大切なのは、UI はイベントを受けて描画するだけにして、商談や条件判定を持たないことです。  
実際には GameApp が eventBus を監視し、UIController が仕上げる形がよいです。

---

### Step 9: SaveManager を後付け
最初はなくてもよいですが、クエストや宝玉状態を保存したいならここからです。

保存対象:
- 取得済み宝玉
- 進行中クエスト
- 地域開放状態
- 最終座標

ここは後回しでも構いませんが、将来の拡張性のために早めに作ると良いです。

---

## 4. 具体的な差分方針

差分を作るとき、次の形で進めると安全です。

### 変更 1: 変数の移動
- グローバル変数を state に移す
- 例:
  - player を state.player に置換
  - gateIsOpen を state.world.gateOpened に置換
  - player.orbs を state.inventory.orbs に置換

### 変更 2: 関数の移動
- updatePlayer を PlayerController に移す
- buildWorld を WorldLoader に移す
- triggerInteraction を QuestManager / InteractableRegistry に分割する

### 変更 3: ドメインの責務分離
- 画面表示ロジックを UIController に移す
- 生成ロジックを WorldLoader に移す
- 状態遷移を QuestManager に移す

### 変更 4: 依存方向を整理
- UI は state を直接読むのではなく、イベントを受け取る
- World は player を直接触らず、state かイベント経由で更新する
- Quest は world の変化をイベントで受け取る

この順で進めると、型としてかなり整理されます。

---

## 5. 初期リファクタでの実際の差分順

最初の実装順は次の通りです。

1. Core の土台を作る
   - state
   - event bus
   - config
   - app bootstrap
2. InputManager を作る
3. PlayerController を作る
4. WorldLoader を作る
5. InteractableRegistry を作る
6. QuestManager を作る
7. UIController を作る
8. SaveManager を作る

これが最も自然です。  
逆順にやると、UI や quest が先に分離されて、後から状態管理が追いつかなくなるので避けます。

---

## 6. 実際の作業時の注意点

### 注意点 1: 1 回に複数の責務を動かさない
たとえば:
- Input と Player を同時にいじる
- Quests と UI を同時にいじる

これは避けます。  
1 回につき 1 責務ずつ、差分で小さくします。

---

### 注意点 2: 既存の見た目は維持する
UI の見た目やゲームの体験は変更しない。  
最初のリファクタの目的は「設計の整理」であり、ゲームデザイン変更ではありません。

---

### 注意点 3: まずは機能を残す
この時点では「よりきれいにしたい」だけで、劇的な仕様変更はしません。  
最初の目標は動いているものを不破壊で整理することです。

---

## 7. まとめ

初期リファクタの差分を作るなら、次の流れが最も安全です。

- Core を先に作る
- Input を切り出す
- Player を切り出す
- World を切り出す
- Quest を切り出す
- UI を切り出す
- Save を追加する

この順で進めると、index.html の巨大スクリプトを、最小限の破壊で分離できます。  
特に最初の 3 つ、state / input / player を切り出すだけでも、後続がかなり整理しやすくなります。

次に続けて、実際に「この 3 つをどう分けるか」のコード格好まで、最小実装例として具体化できます。

To Do リストを更新しました

シナリオとシーン編集を管理する管理画面を、ゲーム本体の拡張としてどう設計するかを、実装可能な粒度で整理します。

## 管理画面を追加するなら、ゲーム本体と分離した「コンテンツ編集モード」を作るのが正解

管理系ツールは、ゲーム本体の実行ロジックと切り分けて、“データを作るための編集モード”として扱うのが最も安全です。  
その方針で設計すると、シーン編集、シナリオ編集、検証、公開まで一貫して管理できます。

---

## 1. 目標

管理ツールでやるべきことを整理すると次のようになります。

- シーンを配置して、マップの境界やオブジェクトを作る
- 地点ごとのイベントやギミックを設定する
- クエストの開始条件・達成条件・報酬を作る
- NPC、宝玉、会話文をカード形式で管理する
- 完成したデータをゲーム本体に取り込み、動作確認する
- ルール違反や未設定の項目をバリデーションする

つまり、管理ツールは「ゲームを動かすコード」ではなく、「ゲーム用データを作るための編集インターフェース」です。

---

## 2. 設計の基本方針

### A. 実行時と編集時を分離する
設計の最重要点は、ゲーム実行時のロジックと編集時のロジックを分けることです。

- 実行時
  - WorldLoader
  - QuestManager
  - PlayerController
  - UIController

- 編集時
  - SceneEditor
  - ScenarioEditor
  - QuestGraphEditor
  - TriggerConfigPanel
  - ValidationPanel

この分離により、管理画面で間違えた値がゲーム本体へそのまま流れ込まなくなります。

---

### B. 管理画面は“データを作るツール”として設計する
管理画面では実際の3Dゲームを動かすのではなく、次のような編集画面を持たせます。

- シーン編集タブ
  - 地図領域
  - オブジェクト配置
  - フィールド境界
  - 触れられる対象の設定

- シナリオ編集タブ
  - クエスト一覧
  - 会話テキスト
  - 条件と遷移
  - 進捗依存の分岐

- 連携編集タブ
  - 地点 A でのイベント
  - 宝玉取得時の遷移
  - NPCとイベントの紐付け

- プレビュータブ
  - シーンを軽く再生
  - 一部のイベントだけテスト
  - バリデーション結果を表示

---

## 3. モジュール構成

管理系ツールは「ゲーム本体」と並列に持つ設計が自然です。

### Core
- EditorApp
- EditorState
- EditorEventBus
- DataSchema

### Data layer
- ScenarioRepository
- SceneRepository
- Validator
- Importer / Exporter

### Editor UI
- SceneCanvasPanel
- ObjectPalette
- PropertyInspector
- QuestListPanel
- DialogueEditor
- TriggerEditor
- ValidationPanel

### Runtime adapter
- SceneDataAdapter
- QuestDataAdapter
- SaveDataAdapter

この層があると、管理画面で作ったデータを、ゲーム本体の WorldLoader と QuestManager がそのまま読める形式に変換できます。

---

## 4. 管理画面の具体的な画面構成

### 画面 1: シーン編集
目的:
- マップの構造を作る

機能:
- 地面や壁のレイアウト
- 宝玉や門や噴水の配置
- 座標を数値で修正
- 3D のプレビューを表示
- オブジェクト ID を割り当てる

例:
- 入口エリア
- 中庭
- 城内部
- 宝箱付近

---

### 画面 2: シナリオ編集
目的:
- 物語の分岐と進行を作る

機能:
- クエスト一覧表示
- クエストの依存関係
- 条件設定
- 会話テキスト編集
- 達成条件の確認

例:
- 1: 正門を開ける
- 2: 噴水で休む
- 3: 宝玉を3つ集める
- 4: 宝箱を開ける
- 5: クリア

---

### 画面 3: イベント/トリガー編集
目的:
- どのオブジェクトが何を起こすかを明示する

機能:
- objectId と action の紐付け
- condition trigger
- result effect
- next state

例:
- gate を開く → areaFlag: courtyardUnlocked
- orb を拾う → inventory.sun = true
- chest を触る → if count === 3 then clear

---

### 画面 4: データ検証
目的:
- 遊べるデータかをチェックする

機能:
- 未定義オブジェクトの検出
- 未解決のクエスト依存
- 未設定の会話文
- フィールドに存在しないイベント参照
- 進行不能の条件を警告

この画面があると、管理者が簡単に壊れたシナリオを作らなくなります。

---

## 5. データモデル

管理画面の中核は、データの形を決めることです。

### シーンデータ
- sceneId
- name
- areaId
- spawnPoint
- bounds
- interactables[]
- lights[]
- triggers[]

### オブジェクト定義
- id
- type
- label
- position
- rotation
- radius
- relatedQuest
- stateFlags

### クエストデータ
- questId
- title
- description
- prerequisites[]
- steps[]
- rewards[]
- completionCondition

### 会話データ
- dialogueId
- speaker
- text
- triggerType
- targetId

### トリガーデータ
- triggerId
- type
- targetId
- condition
- result

ここまで整理しておくと、ゲーム本体の QuestManager と WorldLoader がそのまま扱いやすくなります。

---

## 6. 管理画面のアーキテクチャ

### 基本設計
管理画面は次の 3 つを持つのが良いです。

1. エディタ本体
   - 画面切り替え
   - 左メニュー
   - 右詳細設定
   - 下部ログ

2. データモデル
   - すべてのコンテンツがここを通る
   - JSON 形式で保存

3. 実行プレビュー
   - 作ったデータを軽く読み込み
   - 一部だけテストプレイ

---

### 編集の流れ
1. シーンを選択
2. オブジェクトを配置
3. フィールドの状態を設定
4. クエストを定義
5. 条件とイベントを紐付け
6. 検証
7. 保存
8. 実行時データとして適用

この流れが非常に重要です。  
管理画面は「何を作るか」よりも「どの順番で保存するか」を定義しておくと、一貫性が出ます。

---

## 7. 実装の優先順

### Phase 1: 最低限の管理ツール
最初に必要なのは次の 3 つです。

- シーン一覧
- オブジェクト配置
- クエスト一覧

この 3 つがあれば、まず最小の管理機能が成立します。

---

### Phase 2: 条件とイベントを追加
- trigger editor
- dialogue editor
- quest condition editor

ここから管理機能が本格的になります。

---

### Phase 3: 検証と公開
- バリデーション
- JSON export
- runtime import
- プレビュー

ここまでできると、実際にゲーム本体に反映できる状態になります。

---

## 8. 実運用の考え方

### 管理画面は「ゲームのデータの編集」領域
本体のゲーム実行ロジックは編集の対象ではなく、データを受け取るだけにします。

- ゲーム本体: 実行
- 管理画面: データ作成
- 共通データ層: 読み書き対象

この分離が一番大事です。

---

### 最も現実的な実装パターン
ブラウザゲームなので、最初は次の方式が最も簡単です。

- 管理画面は別画面またはモーダル
- JSON で保存
- localStorage かブラウザ内ファイルとして保存
- 変更したデータをゲーム本体へ読み込む

この方式で十分にまずは開発が進められます。  
将来的にバックエンドが必要になったら、そこから API 化すればよいです。

---

## 9. まとめ

管理系ツールを入れるなら、「ゲーム本体」と「コンテンツ編集画面」を分けて設計するのが最適です。

- 実行時: WorldLoader, QuestManager, PlayerController
- 編集時: SceneEditor, ScenarioEditor, TriggerEditor, Validator
- 共通データ: Scene / Quest / Dialogue / Trigger
- 反映方式: JSON export / import

これにすると、今後の拡張が非常にしやすくなります。

特に重要なのは、管理画面で作った内容が “ゲームのルール” ではなく “データ” であることを明確にすることです。  
そうしておくと、シナリオやシーンの追加が、ゲーム本体のコード修正に直結しなくなります。

必要なら次に、管理画面の UI のレイアウト案と、実際のコンポーネント構成まで続けて具体化できます。


To Do リストを更新しました

管理画面の見た目と内部構成を、実装しやすい UI パターンとして具体化します。ゲーム本体と管理画面を分離し、編集しやすいレイアウトに落とし込みます。

## 管理画面 UI レイアウト案

管理画面は、ゲーム本体のプレイ画面とは分離した「編集モード」で運用するのが最も扱いやすいです。  
index.html のプレイ画面に「管理画面を開く」ボタンを置き、別のレイアウトに切り替える形が実務的です。

---

### 1. 全体レイアウト

管理画面は次の 4 領域で構成します。

> 画面上部: ツールバー  
> 左側: メニュー / タブ  
> 中央: 編集ビュー  
> 右側: プロパティパネル  
> 下部: バリデーション / ログ

イメージは次の通りです。

- 上部バー
  - プロジェクト名
  - モード切り替え: Scene / Quest / Trigger / Validation
  - 保存
  - プレビュー再生
  - 公開/エクスポート

- 左サイドバー
  - シーン一覧
  - クエスト一覧
  - NPC一覧
  - 宝玉一覧
  - イベント一覧

- 中央編集領域
  - 3D プレビュー
  - シナリオ一覧
  - 条件のツリー
  - 会話テキスト入力

- 右プロパティパネル
  - 選択中オブジェクトの位置
  - タイプ
  - 連携イベント
  - 条件設定
  - 会話と遷移

- 下部ステータスバー
  - バリデーション警告
  - エラーログ
  - 実行中のアラート

---

## 2. 画面別レイアウト案

### A. シーン編集画面
目的: 地形とオブジェクトを配置する

レイアウト:
- 左: オブジェクトパレット
  - gate
  - fountain
  - orb
  - chest
  - npc
  - area
- 中央: 3D ビューポート
  - オブジェクトをドラッグで配置
  - 位置・回転・スケール編集
- 右: 詳細設定
  - ID
  - 座標
  - radius
  - 関連クエスト
  - トリガー種別

使いやすさ:
- ドラッグで配置しやすい
- 数値入力で正確に再調整できる
- バインドされているシーン要素がすぐ見える

---

### B. クエスト編集画面
目的: シナリオと進行条件を作る

レイアウト:
- 左: クエスト一覧
  - quest id
  - タイトル
  - 状態
- 中央: ステップ一覧
  - 開始
  - 収集
  - 会話
  - 条件達成
- 右: 選択中タスクの詳細
  - 対象オブジェクト
  - 必要条件
  - 進捗
  - 次のイベント

例:
- 正門を開ける
- 噴水で休む
- 宝玉3個取得
- 宝箱を開く
- クリア

これが管理画面の中心になるべきです。

---

### C. トリガー編集画面
目的: オブジェクトとイベントを紐付ける

レイアウト:
- 左: トリガー一覧
- 中央: 条件エディタ
- 右: 実行結果
  - setFlag
  - unlockArea
  - showDialogue
  - updateQuest
  - completeQuest

設計の意図:
- クエストそのものはデータ
- トリガーがイベントを実行する
- ゲーム状態はトリガーから更新される

---

### D. バリデーション画面
目的: データが壊れていないか確認する

表示内容:
- 未定義オブジェクト
- 参照されていない quest
- 会話が空の状態
- 進行不能な条件
- 地図境界の不整合

これは管理画面の品質保証として重要です。

---

## 3. コンポーネント構成

管理画面は、プレイ画面のモジュールと同じように、レイアウトを小さなコンポーネントとして組み立てます。

### AppShell
- 画面全体の骨格
- タブ切り替え
- 高さ/幅のレイアウト制御
- 状態の保持

### TopBar
- プロジェクト切り替え
- 保存
- プレビュー
- エクスポート
- 実行モード切替

### Sidebar
- list of scenes
- list of quests
- list of NPCs
- list of triggers

### MainViewport
- シーンプレビュー
- クエストツリー
- コンテンツ編集ビュー

### ObjectPalette
- 追加可能オブジェクトの一覧
- クリックして配置

### PropertyInspector
- 選択中アイテムの設定
- position
- type
- trigger
- dialogue
- quest linkage

### QuestTreeEditor
- quest / section / step の階層表示
- ドラッグドロップで並び替え
- 条件と結果の接続

### DialogueEditor
- speaker
- text
- timing
- next action

### TriggerEditor
- condition
- target
- result
- requirement
- next state

### ValidationPanel
- error list
- warning list
- summary
- fix suggestion

### FooterBar
- save status
- last changed
- event log
- validation status

---

## 4. コンポーネント間の責務分離

管理画面の本質は、変数をどこに置くかではなく、責務をどう分けるかです。

### UIController
- 画面表示切り替え
- タブ切替
- パネルの開閉
- モーダル表示

### EditorStateStore
- 現在選択中の scene
- 現在選択中の quest
- 現在選択中の object
- 編集中の property

### SchemaValidator
- 必須項目チェック
- 型チェック
- 依存チェック
- 進行不能判定

### DataSerializer
- JSON への保存
- 読み込み
- import / export

### SceneAdapter
- 3D で見えるオブジェクトに変換
- 右側の入力フォームを scene state に反映

### QuestAdapter
- クエストの編集データを実行データへ変換
- QuestManager が読める形式に整形

---

## 5. 実際の状態遷移

管理画面を使ってデータを作る一連の流れは次の通りです。

1. シーンを選ぶ
2. オブジェクトを配置する
3. オブジェクトに ID と種別を設定する
4. クエストを作る
5. クエストに条件を付ける
6. イベントを紐付ける
7. 会話文を入力する
8. バリデーションでチェックする
9. JSON として保存する
10. ゲーム本体がそれを読み込む

この流れが明確になると、後から新しいイベントやマップを追加しやすくなります。

---

## 6. UI の設計思想

設計の軸は次の 3 つです。

- 直感的
  - 3D 配置がすぐ分かる
  - 右側にプロパティが並ぶ
- 関連が近い
  - 選択中オブジェクトのプロパティとトリガーが隣接
  - クエストと会話が同じ画面内で見える
- 失敗を見逃さない
  - バリデーションを常時表示
  - 未設定状態が目立つ

---

## 7. 実装時の推奨構成

この UI は、1 つの巨大コンポーネントではなく、少なくとも次の形に分けるのがよいです。

- AppShell
- TopBar
- Sidebar
- SceneViewport
- ObjectPalette
- PropertyInspector
- QuestEditor
- TriggerEditor
- DialogueEditor
- ValidationPanel
- FooterBar

この単位で分けると、管理画面自体も拡張しやすくなります。

---

## 8. まとめ

管理画面の UI は、ゲームのプレイ画面ではなく「データ制作ツール」として設計するのが正解です。  
特に最初の v1 では、次の 3 つをしっかり持たせると良いです。

- シーン編集
- クエスト編集
- トリガーとバリデーション

これだけ揃えば、ゲーム本体のコードを大きく壊さずに、シナリオとシーンの拡張が行えます。

必要なら次に、これをそのまま実装するための「管理画面のコンポーネント定義一覧」と、実際の DOM 構造の最小例まで具体化できます。


To Do リストを更新しました

データ制作ツールの構造を、実装にすぐ使えるコンポーネント一覧と最小 DOM 構造まで具体化します。

## データ制作ツールのコンポーネント定義一覧

データ制作ツールは、ゲーム本体の実行ロジックとは分離し、以下の責務を持つ UI コンポーネント群で構成します。

### 1. AppShell
- 役割: 全体のレイアウトと画面切り替えを管理
- 持つ機能:
  - 左メニュー切替
  - 中央コンテンツ切替
  - 右プロパティパネル
  - 上部ツールバー
  - 下部ステータスバー
- 依存:
  - EditorStateStore
  - NavigationManager
  - ToastController

### 2. TopBar
- 役割: ツールバーの主要操作を提供
- 操作:
  - 保存
  - プレビュー
  - エクスポート
  - 再読み込み
  - モード切替
- 表示項目:
  - プロジェクト名
  - シーン切替
  - クエスト切替
  - バリデーション状態

### 3. Sidebar
- 役割: データ一覧を管理
- 種別:
  - SceneList
  - QuestList
  - TriggerList
  - NPCList
  - ObjectList
- 共有機能:
  - 選択状態管理
  - フィルタ
  - 新規作成
  - 削除

### 4. SceneViewport
- 役割: シーンの可視化と配置編集
- 機能:
  - 3D プレビュー
  - オブジェクト配置
  - 選択状態のハイライト
  - 拡大縮小
  - 位置・回転変更
- 依存:
  - SceneAdapter
  - ObjectPalette
  - TransformController

### 5. ObjectPalette
- 役割: 追加可能オブジェクトの一覧
- 例:
  - gate
  - fountain
  - orb
  - chest
  - npc
  - area
- 役割:
  - クリックで追加
  - ドラッグで配置
  - 種別ごとのアイコン表示

### 6. PropertyInspector
- 役割: 選択中データの詳細設定
- 対応項目:
  - id
  - type
  - position
  - rotation
  - radius
  - relatedQuest
  - flags
  - trigger
- UI:
  - テキスト入力
  - 数値入力
  - セレクトボックス
  - トグル

### 7. QuestEditor
- 役割: クエストの定義と進行条件を編集
- 機能:
  - クエスト一覧
  - フェーズ一覧
  - ステップ一覧
  - 条件編集
  - reward 設定
- 例:
  - 開始条件
  - 進行条件
  - 完了条件
  - 次の遷移

### 8. TriggerEditor
- 役割: オブジェクトとイベントの結びつきを定義
- 例:
  - object: gate
  - condition: doorOpenFlag === false
  - action: openGate
  - result: unlockArea: courtyard
- 機能:
  - 条件の追加
  - オブジェクト紐付け
  - 実行結果の定義

### 9. DialogueEditor
- 役割: 会話文と話者を編集
- 項目:
  - speaker
  - text
  - timing
  - target object
  - next dialogue id
- 目的:
  - 会話とクエスト進行の紐付けを簡単にする

### 10. ValidationPanel
- 役割: 入力内容の整合性チェック
- 監視項目:
  - 未定義の object id
  - 未定義 quest id
  - 参照先が存在しない trigger
  - 進行不能条件
  - 空の dialogue
- 表示:
  - warning
  - error
  - info

### 11. FooterBar
- 役割: 状態表示とログ
- 表示:
  - 保存状態
  - 直近の変更
  - バリデーション結果
  - 実行ログ

### 12. EditorStateStore
- 役割: 現在編集中の状態を保持
- 例:
  - selectedScene
  - selectedQuest
  - selectedObject
  - activeTab
  - dirtyState

### 13. DataSerializer
- 役割: JSON 形式への保存と読み込み
- 対応:
  - scene data
  - quest data
  - trigger data
  - dialogue data

---

## 実際の DOM 構造の最小例

以下は、最小構成として使いやすい構造です。  
プレイ画面と完全に分離した状態を想定し、ルートに editor-shell を置きます。

    <div id="data-editor-app" class="data-editor-app">
      <header class="topbar">
        <div class="topbar__brand">石の城データ制作ツール</div>
        <nav class="topbar__nav">
          <button>Scene</button>
          <button>Quest</button>
          <button>Trigger</button>
          <button>Validation</button>
        </nav>
        <div class="topbar__actions">
          <button>保存</button>
          <button>プレビュー</button>
          <button>エクスポート</button>
        </div>
      </header>

      <div class="editor-layout">
        <aside class="sidebar">
          <section class="sidebar__group">
            <h3>シーン</h3>
            <ul class="list">
              <li class="list__item active">正門前</li>
              <li class="list__item">花の中庭</li>
              <li class="list__item">城の内部</li>
            </ul>
          </section>

          <section class="sidebar__group">
            <h3>クエスト</h3>
            <ul class="list">
              <li class="list__item">q01_門を開ける</li>
              <li class="list__item">q02_宝玉を集める</li>
              <li class="list__item">q03_宝箱を開く</li>
            </ul>
          </section>
        </aside>

        <main class="workspace">
          <section class="viewport">
            <div class="viewport__canvas">3Dプレビュー領域</div>
          </section>

          <section class="editor-panel">
            <div class="editor-panel__header">オブジェクト詳細</div>
            <div class="property-grid">
              <label>id<input value="gate_main" /></label>
              <label>type<select><option>gate</option></select></label>
              <label>x<input value="0" /></label>
              <label>z<input value="18" /></label>
              <label>radius<input value="4.2" /></label>
            </div>
          </section>
        </main>

        <aside class="inspector">
          <section class="inspector__section">
            <h3>トリガー</h3>
            <div class="trigger-card">
              <p>条件: gate_opened === false</p>
              <p>実行: unlockArea(courtyard)</p>
            </div>
          </section>

          <section class="inspector__section">
            <h3>会話</h3>
            <div class="dialogue-editor">
              <input value="ペトラ" />
              <textarea>重い鉄の門を押し開けた。中庭の風が吹いている。</textarea>
            </div>
          </section>

          <section class="inspector__section">
            <h3>検証</h3>
            <ul class="validation-list">
              <li class="validation-item ok">シーン参照 OK</li>
              <li class="validation-item ok">クエスト依存 OK</li>
              <li class="validation-item warn">宝玉の説明文が未設定</li>
            </ul>
          </section>
        </aside>
      </div>

      <footer class="footerbar">
        <span>保存済み</span>
        <span>最終更新: 2026-09-23</span>
        <span>検証: 2 warnings</span>
      </footer>
    </div>

---

## 実際のコンポーネント分割イメージ

この最小例を前提に、さらに実装するときは次のように分割します。

- AppShell
- TopBar
- Sidebar
- SceneViewport
- ObjectPalette
- PropertyInspector
- QuestEditor
- TriggerEditor
- DialogueEditor
- ValidationPanel
- FooterBar
- EditorStateStore
- DataSerializer

この分割で、データ制作ツールの責務が自然に分かれます。

---

## 最初に作るべき 5 コンポーネント

最初の実装では、この 5 つだけ作れば十分です。

1. AppShell
2. Sidebar
3. SceneViewport
4. PropertyInspector
5. ValidationPanel

ここができれば、クエスト編集やトリガー編集を後から追加しやすくなります。

---

## 実装時のポイント

- 左側には一覧、右側には詳細、中央には編集対象を置く
- シーンの編集とクエストの編集を切り替えるタブを持つ
- すべての変更は EditorStateStore に集約する
- 保存前に ValidationPanel で不整合を検査する
- 画面切替のたびに、再レンダリングの影響が最小になるようにする

---

## まとめ

データ制作ツールは、ゲームの実行ロジックではなく、ゲームデータを編集するための UI として設計するのが最も重要です。  
最小構成は、次の 3 層で成立します。

- 上部ツールバー
- 左の一覧
- 中央と右の詳細編集

この構造にしておくと、シーン編集・クエスト編集・イベント編集・検証を後から自然に追加できます。

必要なら次に、実際にこの DOM をもとにした「HTML + CSS の最小実装雛形」まで作成します。

To Do リストを更新しました

最小実装として、ゲーム本体と独立して動くデータ制作ツールの雛形を、HTML と CSS の形で組み立てます。構成は管理画面の最小構成に寄せて、すぐに拡張できる状態を目指します。

## 最小実装雛形

以下は、先ほどの DOM をそのまま実装しやすいように整理した、最小の HTML + CSS 雛形です。  
このままブラウザで開けば、データ制作ツールの骨格を確認できます。

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Data Editor Tool</title>
  <style>
    :root {
      --bg: #0f172a;
      --bg-soft: #111827;
      --panel: #1f2937;
      --panel-strong: #111827;
      --panel-alt: #0b1220;
      --line: #334155;
      --line-soft: #475569;
      --text: #e5e7eb;
      --muted: #94a3b8;
      --primary: #fbbf24;
      --primary-soft: rgba(251, 191, 36, 0.15);
      --danger: #f87171;
      --warning: #fbbf24;
      --ok: #34d399;
      --shadow: rgba(0, 0, 0, 0.35);
    }

    * { box-sizing: border-box; }

    html, body {
      margin: 0;
      height: 100%;
      background: var(--bg);
      color: var(--text);
      font-family: "Segoe UI", sans-serif;
    }

    body {
      display: flex;
      align-items: stretch;
      justify-content: center;
      min-height: 100vh;
      padding: 16px;
    }

    .data-editor-app {
      width: 100%;
      max-width: 1600px;
      min-height: calc(100vh - 32px);
      background: var(--bg-soft);
      border: 1px solid var(--line);
      box-shadow: 0 16px 40px var(--shadow);
      display: grid;
      grid-template-rows: 64px 1fr 44px;
      overflow: hidden;
    }

    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--panel-strong);
      border-bottom: 1px solid var(--line);
      padding: 0 18px;
    }

    .topbar__brand {
      font-size: 1.05rem;
      font-weight: 700;
      letter-spacing: 0.04em;
    }

    .topbar__nav {
      display: flex;
      gap: 8px;
      align-items: center;
      flex: 1;
      justify-content: center;
    }

    .topbar__nav button,
    .topbar__actions button {
      border: 1px solid var(--line-soft);
      background: var(--panel);
      color: var(--text);
      border-radius: 8px;
      padding: 8px 12px;
      cursor: pointer;
      transition: 0.2s ease;
    }

    .topbar__nav button:hover,
    .topbar__actions button:hover {
      border-color: var(--primary);
      background: rgba(251, 191, 36, 0.08);
    }

    .topbar__actions {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .editor-layout {
      display: grid;
      grid-template-columns: 260px minmax(0, 1fr) 340px;
      min-height: 0;
    }

    .sidebar,
    .inspector {
      background: var(--panel-alt);
      border-right: 1px solid var(--line);
      overflow-y: auto;
      padding: 14px 12px;
    }

    .inspector {
      border-right: none;
      border-left: 1px solid var(--line);
    }

    .sidebar__group {
      margin-bottom: 22px;
    }

    .sidebar__group h3 {
      margin: 0 0 10px;
      font-size: 0.78rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
      font-weight: 700;
    }

    .list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .list__item {
      padding: 10px 12px;
      border: 1px solid transparent;
      border-radius: 8px;
      background: rgba(148, 163, 184, 0.04);
      color: var(--text);
      cursor: pointer;
    }

    .list__item.active {
      border-color: var(--primary);
      background: var(--primary-soft);
      color: #fde68a;
    }

    .list__item:hover {
      border-color: var(--line-soft);
    }

    .workspace {
      display: grid;
      grid-template-rows: minmax(0, 1fr) 220px;
      min-height: 0;
      background: var(--bg);
    }

    .viewport {
      border-bottom: 1px solid var(--line);
      padding: 12px;
      min-height: 0;
    }

    .viewport__canvas {
      height: 100%;
      min-height: 420px;
      border: 1px solid var(--line);
      border-radius: 10px;
      background:
        radial-gradient(circle at 50% 30%, rgba(59, 130, 246, 0.2), transparent 30%),
        linear-gradient(180deg, #0b1220 0%, #111827 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--muted);
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .editor-panel {
      background: var(--panel);
      border-top: 1px solid var(--line);
      padding: 14px 16px;
    }

    .editor-panel__header {
      font-size: 0.8rem;
      text-transform: uppercase;
      color: var(--muted);
      letter-spacing: 0.08em;
      margin-bottom: 14px;
      font-weight: 700;
    }

    .property-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(140px, 1fr));
      gap: 10px 12px;
    }

    .property-grid label {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 0.75rem;
      color: var(--muted);
    }

    .property-grid input,
    .property-grid select,
    .dialogue-editor input,
    .dialogue-editor textarea {
      border: 1px solid var(--line-soft);
      background: rgba(15, 23, 42, 0.9);
      color: var(--text);
      border-radius: 8px;
      padding: 9px 10px;
    }

    .dialogue-editor {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .dialogue-editor textarea {
      min-height: 90px;
      resize: vertical;
    }

    .inspector__section {
      margin-bottom: 20px;
    }

    .inspector__section h3 {
      margin: 0 0 10px;
      font-size: 0.8rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
      font-weight: 700;
    }

    .trigger-card {
      background: rgba(148, 163, 184, 0.06);
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 10px 12px;
      color: var(--text);
      line-height: 1.6;
      font-size: 0.82rem;
    }

    .validation-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .validation-item {
      border-radius: 8px;
      padding: 8px 10px;
      font-size: 0.8rem;
      border: 1px solid var(--line);
      background: rgba(148, 163, 184, 0.04);
    }

    .validation-item.ok {
      border-color: rgba(52, 211, 153, 0.6);
      color: #a7f3d0;
      background: rgba(52, 211, 153, 0.08);
    }

    .validation-item.warn {
      border-color: rgba(251, 191, 36, 0.6);
      color: #fde68a;
      background: rgba(251, 191, 36, 0.08);
    }

    .footerbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      background: var(--panel-strong);
      border-top: 1px solid var(--line);
      padding: 0 16px;
      font-size: 0.78rem;
      color: var(--muted);
    }

    @media (max-width: 1100px) {
      .editor-layout {
        grid-template-columns: 220px 1fr;
      }

      .inspector {
        grid-column: 1 / -1;
        border-left: none;
        border-top: 1px solid var(--line);
      }
    }

    @media (max-width: 760px) {
      body {
        padding: 0;
      }

      .data-editor-app {
        min-height: 100vh;
        border: none;
        border-radius: 0;
      }

      .topbar {
        flex-wrap: wrap;
        height: auto;
        padding: 12px 14px;
        gap: 10px;
      }

      .editor-layout {
        grid-template-columns: 1fr;
      }

      .sidebar,
      .inspector {
        border-right: none;
        border-bottom: 1px solid var(--line);
      }

      .property-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="data-editor-app">
    <header class="topbar">
      <div class="topbar__brand">石の城データ制作ツール</div>

      <nav class="topbar__nav" aria-label="メインメニュー">
        <button type="button">Scene</button>
        <button type="button">Quest</button>
        <button type="button">Trigger</button>
        <button type="button">Validation</button>
      </nav>

      <div class="topbar__actions">
        <button type="button">保存</button>
        <button type="button">プレビュー</button>
        <button type="button">エクスポート</button>
      </div>
    </header>

    <div class="editor-layout">
      <aside class="sidebar">
        <section class="sidebar__group">
          <h3>シーン</h3>
          <ul class="list">
            <li class="list__item active">正門前</li>
            <li class="list__item">花の中庭</li>
            <li class="list__item">城の内部</li>
          </ul>
        </section>

        <section class="sidebar__group">
          <h3>クエスト</h3>
          <ul class="list">
            <li class="list__item">q01_門を開ける</li>
            <li class="list__item active">q02_宝玉を集める</li>
            <li class="list__item">q03_宝箱を開く</li>
          </ul>
        </section>
      </aside>

      <main class="workspace">
        <section class="viewport">
          <div class="viewport__canvas">
            3D プレビュー領域
          </div>
        </section>

        <section class="editor-panel">
          <div class="editor-panel__header">オブジェクト詳細</div>

          <div class="property-grid">
            <label>
              id
              <input type="text" value="gate_main" />
            </label>

            <label>
              type
              <select>
                <option selected>gate</option>
                <option>fountain</option>
                <option>orb</option>
                <option>chest</option>
                <option>npc</option>
              </select>
            </label>

            <label>
              x
              <input type="number" value="0" />
            </label>

            <label>
              z
              <input type="number" value="18" />
            </label>

            <label>
              radius
              <input type="number" step="0.1" value="4.2" />
            </label>

            <label>
              area
              <select>
                <option selected>front_gate</option>
                <option>courtyard</option>
                <option>keep</option>
              </select>
            </label>
          </div>
        </section>
      </main>

      <aside class="inspector">
        <section class="inspector__section">
          <h3>トリガー</h3>
          <div class="trigger-card">
            <div>条件: gate_opened === false</div>
            <div>実行: unlockArea(courtyard)</div>
          </div>
        </section>

        <section class="inspector__section">
          <h3>会話</h3>
          <div class="dialogue-editor">
            <input type="text" value="ペトラ" />
            <textarea>重い鉄の門を押し開けた。中庭の風が吹いている。</textarea>
          </div>
        </section>

        <section class="inspector__section">
          <h3>検証</h3>
          <ul class="validation-list">
            <li class="validation-item ok">シーン参照 OK</li>
            <li class="validation-item ok">クエスト依存 OK</li>
            <li class="validation-item warn">宝玉の説明文が未設定</li>
          </ul>
        </section>
      </aside>
    </div>

    <footer class="footerbar">
      <span>保存済み</span>
      <span>最終更新: 2026-09-23</span>
      <span>検証: 2 warnings</span>
    </footer>
  </div>
</body>
</html>
```

## これが満たしている意味

- 左に一覧、中央に編集領域、右に詳細設定がある
- データ制作ツールとして必要な基本構造を持っている
- 3D プレビュー、オブジェクト詳細、トリガー、会話、検証が分離されている
- 今後の拡張がしやすいレイアウトになっている

次に進めば、以下のどちらかができます。

1. この雛形を使って、実際の JavaScript で動く最小コンポーネント化
2. この HTML をベースに、シーン編集・クエスト編集・トリガー編集の機能を段階追加

必要なら次に、JavaScript で動く「最小のデータ制作ツール実装」まで続けて作成します。

