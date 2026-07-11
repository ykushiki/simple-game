// --- ゲームの状態管理 ---
let stage = 1;
let MAP_SIZE = 15;
let player = { 
    x: 1, z: 1, 
    targetX: 1, targetZ: 1, 
    visualY: 0,
    dirX: 0, dirZ: 1, // 初期は南（Zプラス方向）を向いている
    angle: 0,         // 現在の物理的な回転角度
    targetAngle: 0,   // 目標の回転角度
    hp: 15, maxHp: 15, 
    isMoving: false,
    isJumping: false,
    jumpTimer: 0
};
let goal = { x: 13, z: 13 };

let mapData = []; // 0: 床, 1: 壁, 2: トゲ, 3: アイテム
let mapMeshes = []; 
let itemMeshes = []; 
let enemies = []; 

// Three.jsのセットアップ
const scene = new THREE.Scene();

// ★ 背景を「青空と白い雲（地平線）」をイメージした爽快なグラデーションに変更
scene.background = new THREE.Color(0x4ca6ff); 
scene.fog = new THREE.FogExp2(0xd6ebff, 0.015); // 遠くを少し白く霞ませて空気感を出す

// ★ カメラの視野角(FOV)を少し広げ、より広い視野を確保
const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// ライト（南国らしい強い日差しを意識）
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xfffaed, 1.0);
dirLight.position.set(20, 40, 20);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048; // シャドウマップを高解像度化して綺麗に
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 100;
const d = 20; // 影の描画範囲を広げる
dirLight.shadow.camera.left = -d;
dirLight.shadow.camera.right = d;
dirLight.shadow.camera.top = d;
dirLight.shadow.camera.bottom = -d;
scene.add(dirLight);

let gameGroup = new THREE.Group();
scene.add(gameGroup);

let playerGroup, goalMesh; 
const MOVE_SPEED = 0.15; 

// --- ステージ初期化 ---
function initStage() {
    while(gameGroup.children.length > 0){
        gameGroup.remove(gameGroup.children[0]);
    }
    enemies = []; mapData = []; mapMeshes = []; itemMeshes = [];

    MAP_SIZE = 15 + (stage - 1) * 2;
    goal = { x: MAP_SIZE - 2, z: MAP_SIZE - 2 };

    document.getElementById('stage-display').innerText = `STAGE: ${stage} (サイズ: ${MAP_SIZE}x${MAP_SIZE})`;
    updateUI();

    // プレイヤー初期位置と向き
    player.x = 1; player.z = 1;
    player.targetX = 1; player.targetZ = 1;
    player.dirX = 0; player.dirZ = 1;
    player.angle = 0; player.targetAngle = 0;
    player.isMoving = false; player.isJumping = false;

    // マップデータ生成
    for (let x = 0; x < MAP_SIZE; x++) {
        mapData[x] = []; mapMeshes[x] = []; itemMeshes[x] = [];
        for (let z = 0; z < MAP_SIZE; z++) {
            if (x === 0 || x === MAP_SIZE - 1 || z === 0 || z === MAP_SIZE - 1) {
                mapData[x][z] = 1; // 外周の壁
            } else if ((x === 1 && z === 1) || (x === goal.x && z === goal.z)) {
                mapData[x][z] = 0; 
            } else {
                const rand = Math.random();
                if (rand < 0.18) mapData[x][z] = 1;     // 壁
                else if (rand < 0.24) mapData[x][z] = 2; // トゲ
                else if (rand < 0.27) mapData[x][z] = 3; // アイテム
                else mapData[x][z] = 0; 
            }
        }
    }

    // 敵配置
    const enemyCount = 3 + Math.floor(stage * 1.2);
    for (let i = 0; i < enemyCount; i++) {
        let rx, rz;
        do {
            rx = Math.floor(Math.random() * (MAP_SIZE - 2)) + 1;
            rz = Math.floor(Math.random() * (MAP_SIZE - 2)) + 1;
        } while (mapData[rx][rz] !== 0 || (rx === 1 && rz === 1) || (rx === goal.x && rz === goal.z));
        
        enemies.push({ x: rx, z: rz, targetX: rx, targetZ: rz, mesh: null });
    }

    // マテリアル定義（南国リゾート風）
    const tileGeo = new THREE.BoxGeometry(0.95, 0.2, 0.95);
    const wallGeo = new THREE.BoxGeometry(0.95, 0.9, 0.95);
    const trapGeo = new THREE.ConeGeometry(0.25, 0.5, 4);
    const itemGeo = new THREE.SphereGeometry(0.2, 8, 8);

    const tileMat = new THREE.MeshLambertMaterial({ color: 0x55b85d, flatShading: true }); // 明るい芝生の緑
    const wallMat = new THREE.MeshLambertMaterial({ color: 0xdfcda3, flatShading: true }); // 古びた遺跡の石灰岩風
    const trapMat = new THREE.MeshLambertMaterial({ color: 0xcc4444, flatShading: true }); 
    const itemMat = new THREE.MeshStandardMaterial({ color: 0x33ffcc, roughness: 0.1 });

    // 1. マップ（島本体）の描画
    for (let x = 0; x < MAP_SIZE; x++) {
        for (let z = 0; z < MAP_SIZE; z++) {
            const tile = new THREE.Mesh(tileGeo, tileMat);
            tile.position.set(x, -0.1, z);
            tile.receiveShadow = true;
            gameGroup.add(tile);

            if (mapData[x][z] === 1) {
                const wall = new THREE.Mesh(wallGeo, wallMat);
                wall.position.set(x, 0.45, z);
                wall.castShadow = true; wall.receiveShadow = true;
                gameGroup.add(wall);
                mapMeshes[x][z] = wall;
            } else if (mapData[x][z] === 2) {
                const trap = new THREE.Mesh(trapGeo, trapMat);
                trap.position.set(x, 0.25, z);
                trap.castShadow = true;
                gameGroup.add(trap);
                mapMeshes[x][z] = trap;
            } else if (mapData[x][z] === 3) {
                const item = new THREE.Mesh(itemGeo, itemMat);
                item.position.set(x, 0.25, z);
                gameGroup.add(item);
                itemMeshes[x][z] = item;
            }
        }
    }

    // 2. ★ マップの外周をさらに囲む「砂浜（ビーチ）」を自動生成
    const beachMat = new THREE.MeshLambertMaterial({ color: 0xeedd99, flatShading: true }); // 綺麗な砂浜色
    const beachThickness = 3; // 砂浜の幅
    for (let x = -beachThickness; x < MAP_SIZE + beachThickness; x++) {
        for (let z = -beachThickness; z < MAP_SIZE + beachThickness; z++) {
            // 元のマップの範囲外の時だけ砂浜の床を置く
            if (x < 0 || x >= MAP_SIZE || z < 0 || z >= MAP_SIZE) {
                const beachTile = new THREE.Mesh(tileGeo, beachMat);
                // 砂浜は芝生よりほんの少しだけ低くして段差を作る
                beachTile.position.set(x, -0.15, z);
                beachTile.receiveShadow = true;
                gameGroup.add(beachTile);
            }
        }
    }

    // 3. ★ 遥か彼方まで広がる「海」のプレーン
    const oceanGeo = new THREE.PlaneGeometry(1000, 1000);
    const oceanMat = new THREE.MeshStandardMaterial({ 
        color: 0x0077be, // 美しいコバルトブルー
        roughness: 0.2,
        metalness: 0.1,
        transparent: true,
        opacity: 0.9
    });
    const ocean = new THREE.Mesh(oceanGeo, oceanMat);
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(MAP_SIZE / 2, -0.22, MAP_SIZE / 2); // 砂浜よりさらに少し低く
    ocean.receiveShadow = true;
    gameGroup.add(ocean);

    // プレイヤー生成
    playerGroup = new THREE.Group();
    const bodyGeo = new THREE.BoxGeometry(0.5, 0.8, 0.5);
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x2277ff, flatShading: true });
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.position.y = 0.4;
    bodyMesh.castShadow = true;
    playerGroup.add(bodyMesh);

    // 正面の目
    const eyeGeo = new THREE.BoxGeometry(0.3, 0.15, 0.15);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffdd00 });
    const eyeMesh = new THREE.Mesh(eyeGeo, eyeMat);
    eyeMesh.position.set(0, 0.6, 0.25);
    playerGroup.add(eyeMesh);

    playerGroup.position.set(player.x, 0, player.z);
    gameGroup.add(playerGroup);

    // ゴール生成
    const goalGeo = new THREE.TorusGeometry(0.3, 0.1, 8, 16);
    const goalMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, metalness: 0.5 });
    goalMesh = new THREE.Mesh(goalGeo, goalMat);
    goalMesh.position.set(goal.x, 0.5, goal.z);
    gameGroup.add(goalMesh);

    // 敵生成
    const enemyGeo = new THREE.ConeGeometry(0.3, 0.6, 4);
    const enemyMat = new THREE.MeshLambertMaterial({ color: 0xdd2222, flatShading: true });
    enemies.forEach(enemy => {
        enemy.mesh = new THREE.Mesh(enemyGeo, enemyMat);
        enemy.mesh.position.set(enemy.x, 0.3, enemy.z);
        enemy.mesh.castShadow = true;
        gameGroup.add(enemy.mesh);
    });

    updateCameraImmediate();
}

function updateUI() {
    document.getElementById('hp-text').innerText = `${player.hp} / ${player.maxHp}`;
    const hpPercent = (player.hp / player.maxHp) * 100;
    document.getElementById('hp-bar').style.width = `${Math.max(0, hpPercent)}%`;
}

// ラジコン操作式の入力処理
window.addEventListener('keydown', (e) => {
    if (player.isMoving || player.hp <= 0) return;

    if (e.key === ' ') { executeAttack(); return; }
    if (e.key === 'e' || e.key === 'E') { executeJump(); return; }

    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        player.targetAngle += Math.PI / 2;
        updateDirectionVectors();
        return;
    }
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        player.targetAngle -= Math.PI / 2;
        updateDirectionVectors();
        return;
    }

    let moveStep = 0;
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') moveStep = 1;
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') moveStep = -1;

    if (moveStep !== 0) {
        const nextX = player.x + player.dirX * moveStep;
        const nextZ = player.z + player.dirZ * moveStep;

        if (mapData[nextX] && mapData[nextX][nextZ] !== 1) {
            player.targetX = nextX;
            player.targetZ = nextZ;
            player.isMoving = true;
            moveEnemies();
        }
    }
});

function updateDirectionVectors() {
    player.dirX = Math.round(Math.sin(player.targetAngle));
    player.dirZ = Math.round(Math.cos(player.targetAngle));
}

function executeAttack() {
    const targetX = player.x + player.dirX;
    const targetZ = player.z + player.dirZ;

    const hitEnemy = enemies.find(e => e.x === targetX && e.z === targetZ);
    if (hitEnemy) {
        gameGroup.remove(hitEnemy.mesh);
        enemies = enemies.filter(e => e !== hitEnemy);
        moveEnemies(); return;
    }

    if (mapData[targetX] && mapData[targetX][targetZ] === 1) {
        if (targetX > 0 && targetX < MAP_SIZE - 1 && targetZ > 0 && targetZ < MAP_SIZE - 1) {
            gameGroup.remove(mapMeshes[targetX][targetZ]);
            mapData[targetX][targetZ] = 0; 
            moveEnemies();
        }
    }
}

function executeJump() {
    const landX = player.x + player.dirX * 2;
    const landZ = player.z + player.dirZ * 2;

    if (mapData[landX] && mapData[landX][landZ] !== 1) {
        player.targetX = landX; player.targetZ = landZ;
        player.isMoving = true; player.isJumping = true; player.jumpTimer = 0;
        moveEnemies();
    }
}

function moveEnemies() {
    enemies.forEach(enemy => {
        let dx = Math.sign(player.x - enemy.x);
        let dz = Math.sign(player.z - enemy.z);
        let nextX = enemy.x + dx;
        let nextZ = enemy.z;

        if (mapData[nextX][nextZ] === 1 || isEnemyAt(nextX, nextZ)) {
            nextX = enemy.x; nextZ = enemy.z + dz;
        }
        if (mapData[nextX][nextZ] !== 1 && !isEnemyAt(nextX, nextZ) && !(nextX === goal.x && nextZ === goal.z)) {
            enemy.targetX = nextX; enemy.targetZ = nextZ;
        }
    });
}

function isEnemyAt(x, z) { return enemies.some(e => e.x === x && e.z === z); }

function updateCameraImmediate() {
    const px = player.x;
    const pz = player.z;
    // 初期配置も少し引き気味に
    camera.position.set(px - player.dirX * 3.5, 4.5, pz - player.dirZ * 3.5);
    camera.lookAt(px + player.dirX * 2, 0.5, pz + player.dirZ * 2);
}

function handleTileEvents() {
    if (mapData[player.x][player.z] === 3) {
        player.hp = Math.min(player.hp + 5, player.maxHp); updateUI();
        gameGroup.remove(itemMeshes[player.x][player.z]); mapData[player.x][player.z] = 0;
    }
    if (mapData[player.x][player.z] === 2) {
        player.hp -= 2; updateUI();
        if (player.hp <= 0) { alert("罠にかかって倒れてしまった…"); stage = 1; player.hp = player.maxHp; initStage(); return; }
    }
    enemies.forEach(enemy => {
        if (enemy.x === player.x && enemy.z === player.z) {
            player.hp -= 3; updateUI();
            gameGroup.remove(enemy.mesh); enemies = enemies.filter(e => e !== enemy);
            if (player.hp <= 0) { alert("敵に敗北してしまった…"); stage = 1; player.hp = player.maxHp; initStage(); }
        }
    });
    if (player.x === goal.x && player.z === goal.z) {
        alert(`島を制覇！ステージ ${stage} クリア。次の島へ。`);
        stage++; player.hp = Math.min(player.hp + 5, player.maxHp); initStage();
    }
}

// --- メインループ ---
function animate() {
    requestAnimationFrame(animate);

    if (playerGroup) {
        player.angle += (player.targetAngle - player.angle) * 0.2;
        playerGroup.rotation.y = player.angle;
    }

    if (player.isMoving) {
        playerGroup.position.x += (player.targetX - playerGroup.position.x) * MOVE_SPEED;
        playerGroup.position.z += (player.targetZ - playerGroup.position.z) * MOVE_SPEED;

        if (player.isJumping) {
            player.jumpTimer += 0.08;
            player.visualY = Math.sin(Math.PI * player.jumpTimer) * 1.2;
            playerGroup.position.y = player.visualY;
            if (player.jumpTimer >= 1.0) { player.isJumping = false; playerGroup.position.y = 0; }
        }

        if (Math.abs(playerGroup.position.x - player.targetX) < 0.05 && Math.abs(playerGroup.position.z - player.targetZ) < 0.05) {
            player.x = player.targetX; player.z = player.targetZ;
            playerGroup.position.set(player.x, 0, player.z);
            player.isMoving = false; player.isJumping = false;
            
            enemies.forEach(enemy => {
                enemy.x = enemy.targetX; enemy.z = enemy.targetZ;
                if (enemy.mesh) enemy.mesh.position.set(enemy.x, 0.3, enemy.z);
            });
            handleTileEvents();
        }
    }

    enemies.forEach(enemy => {
        if (enemy.mesh && player.isMoving) {
            enemy.mesh.position.x += (enemy.targetX - enemy.mesh.position.x) * MOVE_SPEED;
            enemy.mesh.position.z += (enemy.targetZ - enemy.mesh.position.z) * MOVE_SPEED;
            enemy.mesh.position.y = 0.3 + Math.abs(Math.sin(playerGroup.position.x * 4)) * 0.1;
        }
    });

    // ★ カメラを「より後ろ・より高く」に引き、視野を広く確保する調整
    if (playerGroup) {
        // プレイヤーの背後3.5マス、高さ4.0の位置（前回より後ろ＆高めに設定）
        const targetCamX = playerGroup.position.x - Math.sin(player.angle) * 3.5;
        const targetCamZ = playerGroup.position.z - Math.cos(player.angle) * 3.5;
        const targetCamY = 4.0; 

        camera.position.x += (targetCamX - camera.position.x) * 0.06; // 少しだけカメラの粘りを強くして広大さを演出
        camera.position.z += (targetCamZ - camera.position.z) * 0.06;
        camera.position.y += (targetCamY - camera.position.y) * 0.06;

        // プレイヤーの3マス先を見据えることで、前方の視界を大きく確保
        const lookTargetX = playerGroup.position.x + Math.sin(player.angle) * 3.0;
        const lookTargetZ = playerGroup.position.z + Math.cos(player.angle) * 3.0;
        camera.lookAt(lookTargetX, 0.8, lookTargetZ);
    }

    if (goalMesh) goalMesh.rotation.y += 0.02;
    for (let x = 0; x < MAP_SIZE; x++) {
        for (let z = 0; z < MAP_SIZE; z++) {
            if (itemMeshes[x] && itemMeshes[x][z]) {
                itemMeshes[x][z].position.y = 0.25 + Math.sin(Date.now() * 0.003 + x) * 0.05;
            }
        }
    }

    renderer.render(scene, camera);
}

initStage();
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});