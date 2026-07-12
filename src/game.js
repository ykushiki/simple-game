// --- ゲームの状態管理 ---
let stage = 1;
let MAP_SIZE = 15;
let player = { 
    x: 1, z: 1, 
    targetX: 1, targetZ: 1, 
    prevX: 1, prevZ: 1,
    visualY: 0,
    dirX: 0, dirZ: 1, 
    angle: 0,         
    targetAngle: 0,   
    hp: 15, maxHp: 15, 
    isMoving: false,
    isJumping: false,
    jumpTimer: 0
};
let goal = { x: 13, z: 13 };

let mapData = []; 
let mapMeshes = []; 
let itemMeshes = []; 
let enemies = []; 
let hasMovedOnce = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x4ca6ff); 
scene.fog = new THREE.FogExp2(0xa7d8f0, 0.010); 

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.88;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.style.position = 'fixed';
renderer.domElement.style.top = '0';
renderer.domElement.style.left = '0';
renderer.domElement.style.width = '100%';
renderer.domElement.style.height = '100%';
renderer.domElement.style.zIndex = '0';
document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xfffaed, 1.0);
dirLight.position.set(20, 40, 20);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048; 
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 100;
const d = 20; 
dirLight.shadow.camera.left = -d;
dirLight.shadow.camera.right = d;
dirLight.shadow.camera.top = d;
dirLight.shadow.camera.bottom = -d;
scene.add(dirLight);

let gameGroup = new THREE.Group();
scene.add(gameGroup);

let playerGroup, goalMesh; 
const MOVE_SPEED = 0.15; 
let joystickInput = { active: false, move: 0, turn: 0 };
let joystickRepeatTimer = null;

// 3D モデル関連
let playerMixer = null;
let playerAnimations = {};
let playerClock = new THREE.Clock();
const gltfLoader = new THREE.GLTFLoader();
const occlusionRaycaster = new THREE.Raycaster();
const occludedOccluderMeshes = new Set();
const explosions = [];

function cloneObjectMaterials(root) {
    if (!root) return;
    root.traverse((child) => {
        if (!child.isMesh || !child.material) return;
        if (Array.isArray(child.material)) {
            child.material = child.material.map((mat) => (mat ? mat.clone() : mat));
        } else {
            child.material = child.material.clone();
        }
    });
}

function markAsPlayerOccluder(root) {
    if (!root) return;
    root.traverse((child) => {
        if (child.isMesh) child.userData.isPlayerOccluder = true;
    });
}

function hideOccluderMesh(mesh) {
    if (!mesh) return;
    mesh.visible = false;
}

function showOccluderMesh(mesh) {
    if (!mesh) return;
    mesh.visible = true;
}

function clearPlayerOccluders() {
    occludedOccluderMeshes.forEach((mesh) => showOccluderMesh(mesh));
    occludedOccluderMeshes.clear();
}

function isDescendantOf(node, parent) {
    let cur = node;
    while (cur) {
        if (cur === parent) return true;
        cur = cur.parent;
    }
    return false;
}

function updatePlayerOcclusionVisibility() {
    clearPlayerOccluders();
    if (!playerGroup) return;

    const playerPos = new THREE.Vector3();
    playerGroup.getWorldPosition(playerPos);
    const rayDir = playerPos.clone().sub(camera.position);
    const distance = rayDir.length();
    if (distance <= 0.001) return;

    occlusionRaycaster.set(camera.position, rayDir.normalize());
    occlusionRaycaster.far = Math.max(0.01, distance - 0.15);

    const hits = occlusionRaycaster.intersectObjects(gameGroup.children, true);
    hits.forEach((hit) => {
        const obj = hit.object;
        if (isDescendantOf(obj, playerGroup)) return;
        if (!obj.userData.isPlayerOccluder) return;
        hideOccluderMesh(obj);
        occludedOccluderMeshes.add(obj);
    });
}

function createExplosion(pos) {
    const particleCount = 30;
    const geometry = new THREE.BufferGeometry();
    const positions = [];
    const velocities = [];

    for (let i = 0; i < particleCount; i++) {
        positions.push(pos.x, pos.y, pos.z);
        velocities.push(
            (Math.random() - 0.5) * 0.5,
            (Math.random() - 0.5) * 0.5 + 0.3,
            (Math.random() - 0.5) * 0.5
        );
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    
    const material = new THREE.PointsMaterial({
        color: 0xffaa00,
        size: 0.3,
        transparent: true,
        opacity: 1.0,
        blending: THREE.AdditiveBlending
    });

    const pSystem = new THREE.Points(geometry, material);
    gameGroup.add(pSystem);

    explosions.push({
        system: pSystem,
        velocities: velocities,
        life: 1.0
    });
}

function updateExplosions(deltaTime) {
    for (let i = explosions.length - 1; i >= 0; i--) {
        const exp = explosions[i];
        exp.life -= deltaTime;

        if (exp.life <= 0) {
            gameGroup.remove(exp.system);
            exp.system.geometry.dispose();
            exp.system.material.dispose();
            explosions.splice(i, 1);
            continue;
        }

        const posAttr = exp.system.geometry.attributes.position;
        for (let j = 0; j < posAttr.count; j++) {
            posAttr.setX(j, posAttr.getX(j) + exp.velocities[j * 3]);
            posAttr.setY(j, posAttr.getY(j) + exp.velocities[j * 3 + 1]);
            posAttr.setZ(j, posAttr.getZ(j) + exp.velocities[j * 3 + 2]);
        }
        posAttr.needsUpdate = true;
        exp.system.material.opacity = exp.life;
    }
}

function createGroundTexture(type) {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    if (type === 'grass') {
        ctx.fillStyle = '#7cc66d';
        ctx.fillRect(0, 0, size, size);
        for (let i = 0; i < 2000; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const g = 110 + Math.floor(Math.random() * 80);
            ctx.fillStyle = `rgb(${40 + Math.floor(Math.random() * 25)}, ${g}, ${45 + Math.floor(Math.random() * 25)})`;
            ctx.fillRect(x, y, 2, 2);
        }
    } else {
        ctx.fillStyle = '#e7d8a8';
        ctx.fillRect(0, 0, size, size);
        for (let i = 0; i < 2500; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const c = 175 + Math.floor(Math.random() * 55);
            ctx.fillStyle = `rgb(${c}, ${c - 15}, ${c - 55})`;
            ctx.fillRect(x, y, 1.5, 1.5);
        }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1);
    texture.encoding = THREE.sRGBEncoding;
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return texture;
}

function prepareLoadedModel(model, { scale = 1, y = 0, rotationY = -Math.PI / 2 } = {}) {
    model.scale.set(scale, scale, scale);
    model.position.set(0, y, 0);
    model.rotation.set(0, rotationY, 0);
    model.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });
    return model;
}

function normalizeAndCenterModel(model) {
    const box = new THREE.Box3().setFromObject(model);
    if (!box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3());
        model.position.x -= center.x;
        model.position.z -= center.z;
        model.position.y -= box.min.y;
    }
}

function playPlayerAnim(name, fadeTime = 0.15) {
    if (!playerMixer || !playerAnimations) return;
    const action = playerAnimations[name];
    if (action) {
        Object.values(playerAnimations).forEach(a => { if (a !== action) a.fadeOut(fadeTime); });
        action.reset().fadeIn(fadeTime).play();
    }
}

function initStage() {
    while(gameGroup.children.length > 0){
        gameGroup.remove(gameGroup.children[0]);
    }
    enemies = []; mapData = []; mapMeshes = []; itemMeshes = [];

    MAP_SIZE = 15 + (stage - 1) * 2;
    goal = { x: MAP_SIZE - 2, z: MAP_SIZE - 2 };

    document.getElementById('stage-display').innerText = `STAGE: ${stage}`;
    updateUI();
    updateOverlayVisibility();

    player.x = 1; player.z = 1;
    player.targetX = 1; player.targetZ = 1;
    player.prevX = 1; player.prevZ = 1;
    player.dirX = 0; player.dirZ = 1;
    player.angle = 0; player.targetAngle = 0;
    player.isMoving = false; player.isJumping = false;

    for (let x = 0; x < MAP_SIZE; x++) {
        mapData[x] = []; mapMeshes[x] = []; itemMeshes[x] = [];
        for (let z = 0; z < MAP_SIZE; z++) {
            if (x === 0 || x === MAP_SIZE - 1 || z === 0 || z === MAP_SIZE - 1) {
                mapData[x][z] = 1; 
            } else if ((x === 1 && z === 1) || (x === goal.x && z === goal.z)) {
                mapData[x][z] = 0; 
            } else {
                const rand = Math.random();
                if (rand < 0.18) mapData[x][z] = 1;     
                else if (rand < 0.24) mapData[x][z] = 2; 
                else if (rand < 0.27) mapData[x][z] = 3; 
                else mapData[x][z] = 0; 
            }
        }
    }

    const enemyCount = 3 + Math.floor(stage * 1.2);
    for (let i = 0; i < enemyCount; i++) {
        let rx, rz;
        do {
            rx = Math.floor(Math.random() * (MAP_SIZE - 2)) + 1;
            rz = Math.floor(Math.random() * (MAP_SIZE - 2)) + 1;
        } while (mapData[rx][rz] !== 0 || (rx === 1 && rz === 1) || (rx === goal.x && rz === goal.z));
        
        enemies.push({ x: rx, z: rz, targetX: rx, targetZ: rz, mesh: null, angle: 0, targetAngle: 0, mixer: null, animations: {}, isMoving: false, isDying: false });
    }

    const tileGeo = new THREE.BoxGeometry(0.95, 0.2, 0.95);
    const wallGeo = new THREE.BoxGeometry(0.95, 0.9, 0.95);
    const trapGeo = new THREE.ConeGeometry(0.25, 0.5, 4);
    const itemGeo = new THREE.SphereGeometry(0.2, 8, 8);

    const trapPlacements = [];
    const attackableBlockPlacements = [];
    const boundaryRockPlacements = [];
    const boundaryPalmPlacements = [];

    const grassTexture = createGroundTexture('grass');
    const sandTexture = createGroundTexture('sand');

    const tileMat = new THREE.MeshPhongMaterial({ color: 0xffffff, map: grassTexture });
    const wallMat = new THREE.MeshPhongMaterial({ color: 0xdfcda3, flatShading: true });
    const trapMat = new THREE.MeshPhongMaterial({ color: 0xcc4444, flatShading: true });
    const itemMat = new THREE.MeshStandardMaterial({ color: 0x33ffcc, roughness: 0.1 });

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

                const isBoundary = (x === 0 || z === 0 || x === MAP_SIZE - 1 || z === MAP_SIZE - 1);
                if (isBoundary) {
                    markAsPlayerOccluder(wall);
                    // 外周は Rock(1-5) と PalmTree(1-3) をランダムに混在させる
                    if (Math.random() < 0.35) {
                        const palmVariant = 1 + Math.floor(Math.random() * 3);
                        boundaryPalmPlacements.push({ x, z, variant: palmVariant, fallback: wall });
                    } else {
                        const rockVariant = 1 + Math.floor(Math.random() * 5);
                        boundaryRockPlacements.push({ x, z, variant: rockVariant, fallback: wall });
                    }
                } else {
                    mapMeshes[x][z] = wall;
                    attackableBlockPlacements.push({ x, z, fallback: wall });
                }
            } else if (mapData[x][z] === 2) {
                const trap = new THREE.Mesh(trapGeo, trapMat);
                trap.position.set(x, 0.25, z);
                trap.castShadow = true;
                gameGroup.add(trap);
                mapMeshes[x][z] = trap;
                trapPlacements.push({ x, z, fallback: trap });
            } else if (mapData[x][z] === 3) {
                const item = new THREE.Mesh(itemGeo, itemMat);
                item.position.set(x, 0.25, z);
                gameGroup.add(item);
                itemMeshes[x][z] = item;
            }
        }
    }

    // 罠: Prop_Bomb / 攻撃可能ブロック: Prop_Bucket / 外周: Environment_Rock_1-5
    if (gltfLoader) {
        if (trapPlacements.length > 0) {
            gltfLoader.load('../models/Prop_Bomb.gltf', (gltf) => {
                const baseBomb = prepareLoadedModel(gltf.scene, { scale: 0.8, y: 0, rotationY: 0 });
                normalizeAndCenterModel(baseBomb);

                trapPlacements.forEach(({ x, z, fallback }) => {
                    const bomb = baseBomb.clone(true);
                    cloneObjectMaterials(bomb);
                    bomb.position.set(x, 0, z);
                    if (fallback) gameGroup.remove(fallback);
                    gameGroup.add(bomb);
                    mapMeshes[x][z] = bomb;
                });
            }, undefined, (error) => {
                console.error('Prop_Bomb 読み込み失敗:', error);
            });
        }

        if (attackableBlockPlacements.length > 0) {
            gltfLoader.load('../models/Prop_Bucket.gltf', (gltf) => {
                const baseBucket = prepareLoadedModel(gltf.scene, { scale: 1.0, y: 0, rotationY: 0 });
                normalizeAndCenterModel(baseBucket);

                attackableBlockPlacements.forEach(({ x, z, fallback }) => {
                    const bucket = baseBucket.clone(true);
                    cloneObjectMaterials(bucket);
                    markAsPlayerOccluder(bucket);
                    bucket.position.set(x, 0, z);
                    if (fallback) gameGroup.remove(fallback);
                    gameGroup.add(bucket);
                    mapMeshes[x][z] = bucket;
                });
            }, undefined, (error) => {
                console.error('Prop_Bucket 読み込み失敗:', error);
            });
        }

        for (let i = 1; i <= 5; i++) {
            const targets = boundaryRockPlacements.filter((p) => p.variant === i);
            if (targets.length === 0) continue;

            gltfLoader.load(`../models/Environment_Rock_${i}.gltf`, (gltf) => {
                const baseRock = prepareLoadedModel(gltf.scene, { scale: 1.0, y: 0, rotationY: 0 });
                normalizeAndCenterModel(baseRock);

                targets.forEach(({ x, z, fallback }) => {
                    const rock = baseRock.clone(true);
                    cloneObjectMaterials(rock);
                    markAsPlayerOccluder(rock);
                    rock.position.set(x, 0, z);
                    rock.rotation.y = Math.random() * Math.PI * 2;
                    if (fallback) gameGroup.remove(fallback);
                    gameGroup.add(rock);
                });
            }, undefined, (error) => {
                console.error(`Environment_Rock_${i} 読み込み失敗:`, error);
            });
        }

        for (let i = 1; i <= 3; i++) {
            const targets = boundaryPalmPlacements.filter((p) => p.variant === i);
            if (targets.length === 0) continue;

            gltfLoader.load(`../models/Environment_PalmTree_${i}.gltf`, (gltf) => {
                const basePalm = prepareLoadedModel(gltf.scene, { scale: 1.0, y: 0, rotationY: 0 });
                normalizeAndCenterModel(basePalm);

                targets.forEach(({ x, z, fallback }) => {
                    const palm = basePalm.clone(true);
                    cloneObjectMaterials(palm);
                    markAsPlayerOccluder(palm);
                    palm.position.set(x, 0, z);
                    palm.rotation.y = Math.random() * Math.PI * 2;
                    if (fallback) gameGroup.remove(fallback);
                    gameGroup.add(palm);
                });
            }, undefined, (error) => {
                console.error(`Environment_PalmTree_${i} 読み込み失敗:`, error);
            });
        }
    }

    const beachMat = new THREE.MeshPhongMaterial({ color: 0xffffff, map: sandTexture }); 
    const beachThickness = 3; 
    for (let x = -beachThickness; x < MAP_SIZE + beachThickness; x++) {
        for (let z = -beachThickness; z < MAP_SIZE + beachThickness; z++) {
            if (x < 0 || x >= MAP_SIZE || z < 0 || z >= MAP_SIZE) {
                const beachTile = new THREE.Mesh(tileGeo, beachMat);
                beachTile.position.set(x, -0.15, z);
                beachTile.receiveShadow = true;
                gameGroup.add(beachTile);
            }
        }
    }

    const oceanGeo = new THREE.PlaneGeometry(1000, 1000);
    const oceanMat = new THREE.MeshStandardMaterial({ 
        color: 0x0077be, 
        roughness: 0.2,
        metalness: 0.1,
        transparent: true,
        opacity: 0.9
    });
    const ocean = new THREE.Mesh(oceanGeo, oceanMat);
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(MAP_SIZE / 2, -0.22, MAP_SIZE / 2); 
    ocean.receiveShadow = true;
    gameGroup.add(ocean);

    playerGroup = new THREE.Group();
    const bodyGeo = new THREE.BoxGeometry(0.5, 0.8, 0.5);
    const bodyMat = new THREE.MeshPhongMaterial({ color: 0x2277ff, flatShading: true });
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.position.y = 0.4;
    bodyMesh.castShadow = true;
    playerGroup.add(bodyMesh);

    const eyeGeo = new THREE.BoxGeometry(0.3, 0.15, 0.15);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffdd00 });
    const eyeMesh = new THREE.Mesh(eyeGeo, eyeMat);
    eyeMesh.position.set(0, 0.6, 0.25);
    playerGroup.add(eyeMesh);

    playerGroup.position.set(player.x, 0, player.z);
    gameGroup.add(playerGroup);

    const goalGeo = new THREE.TorusGeometry(0.3, 0.1, 8, 16);
    const goalMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, metalness: 0.5 });
    goalMesh = new THREE.Mesh(goalGeo, goalMat);
    goalMesh.position.set(goal.x, 0.5, goal.z);
    gameGroup.add(goalMesh);

    const enemyGeo = new THREE.ConeGeometry(0.3, 0.6, 4);
    const enemyMat = new THREE.MeshPhongMaterial({ color: 0xdd2222, flatShading: true });
    enemies.forEach(enemy => {
        enemy.primitiveGroup = new THREE.Group();
        const primitiveEnemyMesh = new THREE.Mesh(enemyGeo, enemyMat);
        primitiveEnemyMesh.position.set(enemy.x, 0, enemy.z);
        primitiveEnemyMesh.castShadow = true;
        enemy.primitiveGroup.add(primitiveEnemyMesh);
        gameGroup.add(enemy.primitiveGroup);
        enemy.mesh = enemy.primitiveGroup;
    });

    // プレイヤーモデルの読み込み
    const playerModelUrl = '../models/Characters_Anne.gltf';
    if (gltfLoader) {
        gltfLoader.load(playerModelUrl, (gltf) => {
            const playerModel = prepareLoadedModel(gltf.scene, { scale: 0.6, y: 0.0, rotationY: 0 });
            normalizeAndCenterModel(playerModel);
            
            // プリミティブメッシュを削除してモデルに置き換え
            while (playerGroup.children.length > 0) {
                playerGroup.remove(playerGroup.children[0]);
            }
            
            playerGroup.add(playerModel);

            if (gltf.animations && gltf.animations.length > 0) {
                playerMixer = new THREE.AnimationMixer(playerModel);
                playerAnimations = {};
                gltf.animations.forEach((clip) => {
                    playerAnimations[clip.name] = playerMixer.clipAction(clip);
                });
                playPlayerAnim('Idle');
            }
        }, undefined, (error) => {
            console.error('プレイヤーモデル読み込み失敗:', error);
        });
    }

    const enemyModelUrl = '../models/Characters_Skeleton.gltf';
    if (gltfLoader) {
        gltfLoader.load(enemyModelUrl, (gltf) => {
            // 1. ここでベースモデルを作成（normalizeAndCenterModelは絶対に適用しない！）
            const baseEnemyModel = prepareLoadedModel(gltf.scene, { scale: 0.7, y: 0, rotationY: Math.PI / 2 });

            enemies.forEach(enemy => {
                // THREE.SkeletonUtils.clone() でスキンメッシュ（骨格付きキャラ）を正しく複製する
                let enemyModel;
                if (typeof THREE !== 'undefined' && THREE.SkeletonUtils && THREE.SkeletonUtils.clone) {
                    enemyModel = THREE.SkeletonUtils.clone(baseEnemyModel);
                } else {
                    console.warn('THREE.SkeletonUtils が利用できません。通常の clone() を使用します。');
                    enemyModel = baseEnemyModel.clone();
                }

                // クローン間でマテリアルが共有されると発光が全敵に波及するため、個体ごとに複製する
                enemyModel.traverse((child) => {
                    if (!child.isMesh || !child.material) return;
                    if (Array.isArray(child.material)) {
                        child.material = child.material.map((mat) => (mat ? mat.clone() : mat));
                    } else {
                        child.material = child.material.clone();
                    }
                });

                // 2. クローンした個々の敵に対して位置と回転を設定
                enemyModel.position.set(enemy.x, 0, enemy.z);
                enemyModel.rotation.set(0, Math.PI / 2, 0);
                
                // プリミティブメッシュを削除してモデルに置き換え
                if (enemy.primitiveGroup) {
                    gameGroup.remove(enemy.primitiveGroup);
                    enemy.primitiveGroup = null;
                }
                
                enemy.mesh = enemyModel;
                gameGroup.add(enemy.mesh);

                // アニメーションの設定
                if (gltf.animations && gltf.animations.length > 0) {
                    enemy.mixer = new THREE.AnimationMixer(enemyModel);
                    enemy.animations = {};
                    gltf.animations.forEach((clip) => {
                        enemy.animations[clip.name] = enemy.mixer.clipAction(clip);
                    });
                    // 敵を Idle で初期化
                    if (enemy.animations['Idle']) {
                        enemy.animations['Idle'].play();
                    }
                }
            });
        }, undefined, (error) => {
            console.error('敵モデルの読み込みに失敗しました:', error);
        });
    }

    updateCameraImmediate();
}

function updateUI() {
    document.getElementById('hp-text').innerText = `${player.hp} / ${player.maxHp}`;
    const hpPercent = (player.hp / player.maxHp) * 100;
    document.getElementById('hp-bar').style.width = `${Math.max(0, hpPercent)}%`;
}

function updateOverlayVisibility() {
    const hide = hasMovedOnce || player.isMoving;
    const status = document.getElementById('status-ui') || document.getElementById('status-container');
    const guide = document.getElementById('guide-ui') || document.getElementById('ui');
    const commit = document.getElementById('commit-info');
    if (status) status.classList.toggle('hidden-overlay', hide);
    if (guide) guide.classList.toggle('hidden-overlay', hide);
    if (commit) commit.classList.toggle('hidden-overlay', hide);
}

function applyDamage(amount) {
    if (amount <= 0) return;
    player.hp = Math.max(0, player.hp - amount);
    updateUI();
}

function flashModelDamageRed(root, durationMs = 220) {
    if (!root) return;

    const touchedMaterials = new Set();

    root.traverse((child) => {
        if (!child.isMesh || !child.material) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];

        materials.forEach((mat) => {
            if (!mat || !mat.emissive || touchedMaterials.has(mat)) return;
            touchedMaterials.add(mat);

            const originalEmissive = mat.emissive.clone();
            const originalIntensity = typeof mat.emissiveIntensity === 'number' ? mat.emissiveIntensity : null;

            mat.emissive.setHex(0xff2222);
            if (typeof mat.emissiveIntensity === 'number') {
                mat.emissiveIntensity = Math.max(1.2, mat.emissiveIntensity);
            }

            setTimeout(() => {
                mat.emissive.copy(originalEmissive);
                if (originalIntensity !== null) mat.emissiveIntensity = originalIntensity;
            }, durationMs);
        });
    });
}

function flashPlayerDamageRed(durationMs = 220) {
    flashModelDamageRed(playerGroup, durationMs);
}

function flashEnemyDamageRed(enemy, durationMs = 260) {
    if (!enemy || !enemy.mesh) return;
    flashModelDamageRed(enemy.mesh, durationMs);
}

function reactToDamage() {
    flashPlayerDamageRed();

    const hitReactAction = playerMixer && playerAnimations ? playerAnimations['HitReact'] : null;
    if (hitReactAction) {
        playPlayerAnim('HitReact');
        const hitDuration = hitReactAction.getClip().duration * 1000;
        setTimeout(() => {
            if (!player.isMoving) playPlayerAnim('Idle');
        }, hitDuration);
    }

    const canKnockback = mapData[player.prevX]
        && mapData[player.prevX][player.prevZ] !== 1
        && (player.prevX !== player.x || player.prevZ !== player.z);

    if (canKnockback) {
        player.targetX = player.prevX;
        player.targetZ = player.prevZ;
        player.isMoving = true;
        player.isJumping = false;
        player.jumpTimer = 0;
    }
}

function playEnemyAnim(enemy, name, fadeTime = 0.15) {
    if (!enemy || !enemy.animations) return null;
    const action = enemy.animations[name];
    if (!action) return null;
    Object.values(enemy.animations).forEach((a) => { if (a !== action) a.fadeOut(fadeTime); });
    action.reset().fadeIn(fadeTime).play();
    return action;
}

function resolveHeadOnClash() {
    const playerFromX = player.x;
    const playerFromZ = player.z;
    const playerToX = player.targetX;
    const playerToZ = player.targetZ;

    const clashEnemy = enemies.find((enemy) => {
        return enemy.targetX === playerFromX
            && enemy.targetZ === playerFromZ
            && enemy.x === playerToX
            && enemy.z === playerToZ;
    });

    if (!clashEnemy) return false;

    // 今フレームの移動をキャンセル
    player.targetX = player.x;
    player.targetZ = player.z;
    player.isMoving = false;
    player.isJumping = false;
    player.jumpTimer = 0;
    if (playerGroup) playerGroup.position.set(player.x, 0, player.z);

    enemies.forEach((enemy) => {
        enemy.targetX = enemy.x;
        enemy.targetZ = enemy.z;
        enemy.isMoving = false;
    });

    // 敵は消さずに Sword、プレイヤーは被ダメリアクション
    const swordAction = playEnemyAnim(clashEnemy, 'Sword');
    if (swordAction) {
        const swordDuration = swordAction.getClip().duration * 1000;
        setTimeout(() => {
            if (clashEnemy.mesh) playEnemyAnim(clashEnemy, 'Idle');
        }, swordDuration);
    }

    applyDamage(3);
    reactToDamage();
    return true;
}

function updateCommitInfo() {
    const commitInfo = document.getElementById('commit-info');
    if (!commitInfo) return;

    const applyInfo = (data) => {
        if (data && data.commit && data.date) {
            commitInfo.innerHTML = `commit: ${data.commit}<br>date: ${data.date}`;
            return true;
        }
        commitInfo.innerHTML = 'commit: unavailable<br>date: unavailable';
        return false;
    };

    fetch('./git-info.json', { cache: 'no-store' })
        .then((response) => response.ok ? response.json() : null)
        .then(applyInfo)
        .catch(() => {
            try {
                const fallback = window.__GIT_INFO__;
                if (fallback) {
                    applyInfo(fallback);
                } else {
                    commitInfo.innerHTML = 'commit: unavailable<br>date: unavailable';
                }
            } catch (error) {
                commitInfo.innerHTML = 'commit: unavailable<br>date: unavailable';
            }
        });
}

// キーボード操作の受付
window.addEventListener('keydown', (e) => {
    if (player.isMoving || player.hp <= 0) return;
    removeStartUI(); // キー入力でも案内UIを消す

    if (e.key === ' ') { executeAttack(); return; }
    if (e.key === 'e' || e.key === 'E') { executeJump(); return; }

    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        player.targetAngle += Math.PI / 2; updateDirectionVectors(); return;
    }
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        player.targetAngle -= Math.PI / 2; updateDirectionVectors(); return;
    }

    let moveStep = 0;
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') moveStep = 1;
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') moveStep = -1;

    if (moveStep !== 0) {
        executeGridMove(moveStep);
    }
});

function updateDirectionVectors() {
    player.dirX = Math.round(Math.sin(player.targetAngle));
    player.dirZ = Math.round(Math.cos(player.targetAngle));
}

function executeGridMove(moveStep) {
    const nextX = player.x + player.dirX * moveStep;
    const nextZ = player.z + player.dirZ * moveStep;
    if (mapData[nextX] && mapData[nextX][nextZ] !== 1) {
        player.prevX = player.x;
        player.prevZ = player.z;
        player.targetX = nextX; player.targetZ = nextZ;
        player.isMoving = true;
        playPlayerAnim('Run');
        hasMovedOnce = true;
        updateOverlayVisibility();
        moveEnemies();
        if (resolveHeadOnClash()) return;
    }
}

function executeAttack() {
    const targetX = player.x + player.dirX;
    const targetZ = player.z + player.dirZ;

    // Sword アニメーションを再生し、終了後 Idle に戻す
    playPlayerAnim('Sword');
    const swordAction = playerMixer && playerAnimations['Sword'] ? playerAnimations['Sword'] : null;
    const swordDuration = swordAction ? swordAction.getClip().duration * 1000 : 500;
    const halfSword = swordDuration / 2;
    setTimeout(() => playPlayerAnim('Idle'), swordDuration);

    const hitEnemy = enemies.find(e => e.x === targetX && e.z === targetZ);
    if (hitEnemy) {
        // 先に死亡中フラグを立てて、移動対象から除外する
        hitEnemy.isDying = true;
        hitEnemy.isMoving = false;
        hitEnemy.targetX = hitEnemy.x;
        hitEnemy.targetZ = hitEnemy.z;
        moveEnemies();

        // Sword の中間タイミングで敵の Dead アニメーションを開始する
        setTimeout(() => {
            flashEnemyDamageRed(hitEnemy);

            const deadAction = (hitEnemy.animations && (hitEnemy.animations['Death'] || hitEnemy.animations['death'])) || null;
            if (hitEnemy.mixer && deadAction) {
                deadAction.loop = THREE.LoopOnce;
                deadAction.clampWhenFinished = true;
                Object.values(hitEnemy.animations).forEach(a => { if (a !== deadAction) a.fadeOut(0.15); });
                deadAction.reset().fadeIn(0.15).play();

                // Dead 終了後にメッシュを削除する
                const deadDuration = deadAction.getClip().duration * 1000;
                setTimeout(() => {
                    if (hitEnemy.mesh) gameGroup.remove(hitEnemy.mesh);
                    enemies = enemies.filter(e => e !== hitEnemy);
                }, deadDuration);
            } else {
                // Dead アニメーションがない場合はすぐ消す
                if (hitEnemy.mesh) gameGroup.remove(hitEnemy.mesh);
                enemies = enemies.filter(e => e !== hitEnemy);
            }
        }, halfSword);
        return;
    }

    if (mapData[targetX] && (mapData[targetX][targetZ] === 1 || mapData[targetX][targetZ] === 2)) {
        if (targetX > 0 && targetX < MAP_SIZE - 1 && targetZ > 0 && targetZ < MAP_SIZE - 1) {
            if (mapMeshes[targetX][targetZ]) {
                // Sword の中間タイミングで赤発光
                setTimeout(() => {
                    if (mapMeshes[targetX][targetZ]) {
                        flashModelDamageRed(mapMeshes[targetX][targetZ], 260);
                    }
                }, halfSword);
                
                // 赤発光終了後にメッシュを削除してから爆発エフェクト開始
                setTimeout(() => {
                    if (mapMeshes[targetX][targetZ]) {
                        const pos = new THREE.Vector3();
                        mapMeshes[targetX][targetZ].getWorldPosition(pos);
                        gameGroup.remove(mapMeshes[targetX][targetZ]);
                        mapMeshes[targetX][targetZ] = null;
                        mapData[targetX][targetZ] = 0;
                        createExplosion(pos);
                        moveEnemies();
                    }
                }, halfSword + 260);
            }
        }
    }
}

function executeJump() {
    const landX = player.x + player.dirX * 2;
    const landZ = player.z + player.dirZ * 2;
    if (mapData[landX] && mapData[landX][landZ] !== 1) {
        player.prevX = player.x;
        player.prevZ = player.z;
        player.targetX = landX; player.targetZ = landZ;
        player.isMoving = true; player.isJumping = true; player.jumpTimer = 0;
        playPlayerAnim('Run');
        hasMovedOnce = true;
        updateOverlayVisibility();
        moveEnemies();
        if (resolveHeadOnClash()) return;
    }
}

function moveEnemies() {
    enemies.forEach(enemy => {
        if (enemy.isDying) return;
        let dx = Math.sign(player.x - enemy.x);
        let dz = Math.sign(player.z - enemy.z);
        let nextX = enemy.x + dx; let nextZ = enemy.z;
        if (mapData[nextX][nextZ] === 1 || isEnemyAt(nextX, nextZ)) {
            nextX = enemy.x; nextZ = enemy.z + dz;
        }
        if (mapData[nextX][nextZ] !== 1 && !isEnemyAt(nextX, nextZ) && !(nextX === goal.x && nextZ === goal.z)) {
            enemy.targetX = nextX; enemy.targetZ = nextZ;
            enemy.isMoving = true;
            // 移動方向を向くよう目標角度を計算する
            const dx = nextX - enemy.x;
            const dz = nextZ - enemy.z;
            if (dx !== 0 || dz !== 0) {
                enemy.targetAngle = Math.atan2(dx, dz);
            }
            // Run アニメーション開始
            if (enemy.mixer && enemy.animations && enemy.animations['Run']) {
                playEnemyAnim(enemy, 'Run');
            }
        }
    });
}

function isEnemyAt(x, z) { 
    // 現在位置と目標位置の両方をチェック（重複防止）
    return enemies.some(e => (e.x === x && e.z === z) || (e.targetX === x && e.targetZ === z)); 
}

function updateCameraImmediate() {
    const px = player.x; const pz = player.z;
    camera.position.set(px - player.dirX * 3.5, 4.5, pz - player.dirZ * 3.5);
    camera.lookAt(px + player.dirX * 3.0, 0.8, pz + player.dirZ * 3.0);
}

function handleTileEvents() {
    if (mapData[player.x][player.z] === 3) {
        player.hp = Math.min(player.hp + 5, player.maxHp); updateUI();
        gameGroup.remove(itemMeshes[player.x][player.z]); mapData[player.x][player.z] = 0;
    }
    if (mapData[player.x][player.z] === 2) {
        const trapX = player.x;
        const trapZ = player.z;
        
        // プレイヤーをバックさせる（敵と同じknockback処理）
        const canKnockback = mapData[player.prevX]
            && mapData[player.prevX][player.prevZ] !== 1
            && (player.prevX !== player.x || player.prevZ !== player.z);
        if (canKnockback) {
            player.targetX = player.prevX;
            player.targetZ = player.prevZ;
            player.isMoving = true;
            player.isJumping = false;
            player.jumpTimer = 0;
        }
        
        // ダメージ処理（赤発光とHitReact）
        applyDamage(2);
        reactToDamage();
        
        // トラップを赤発光させてから爆発エフェクトで消す
        if (mapMeshes[trapX][trapZ]) {
            flashModelDamageRed(mapMeshes[trapX][trapZ], 260);
            // 赤発光終了後にメッシュを削除してから爆発エフェクト開始
            setTimeout(() => {
                if (mapMeshes[trapX][trapZ]) {
                    const pos = new THREE.Vector3();
                    mapMeshes[trapX][trapZ].getWorldPosition(pos);
                    gameGroup.remove(mapMeshes[trapX][trapZ]);
                    mapMeshes[trapX][trapZ] = null;
                    mapData[trapX][trapZ] = 0;
                    createExplosion(pos);
                }
            }, 260);
        }
        
        if (player.hp <= 0) { alert("罠にかかって倒れてしまった…"); stage = 1; player.hp = player.maxHp; initStage(); return; }
    }
    enemies.forEach(enemy => {
        if (enemy.x === player.x && enemy.z === player.z) {
            applyDamage(3);
            reactToDamage();

            const swordAction = playEnemyAnim(enemy, 'Sword');
            if (swordAction) {
                const swordDuration = swordAction.getClip().duration * 1000;
                setTimeout(() => {
                    if (!enemy.isDying && enemy.mesh) playEnemyAnim(enemy, 'Idle');
                }, swordDuration);
            }

            if (player.hp <= 0) { alert("敵に敗北してしまった…"); stage = 1; player.hp = player.maxHp; initStage(); }
        }
    });
    if (player.x === goal.x && player.z === goal.z) {
        alert(`島を制覇！ステージ ${stage} クリア。次の島へ。`);
        stage++; player.hp = Math.min(player.hp + 5, player.maxHp); initStage();
    }
}

// ★ 最初のアクションが起きた時に説明UIを消す処理
function removeStartUI() {
    const uiElement = document.getElementById('ui');
    if (uiElement) {
        uiElement.remove();
    }
}

function stopJoystickRepeat() {
    if (joystickRepeatTimer) {
        clearInterval(joystickRepeatTimer);
        joystickRepeatTimer = null;
    }
}

function applyJoystickInput() {
    if (!joystickInput.active || player.isMoving || player.hp <= 0) return;

    if (joystickInput.turn !== 0) {
        player.targetAngle += joystickInput.turn * Math.PI / 2;
        updateDirectionVectors();
    }

    if (joystickInput.move !== 0) {
        executeGridMove(joystickInput.move);
    }
}

function startJoystickRepeat() {
    stopJoystickRepeat();
    removeStartUI();
    applyJoystickInput();
    joystickRepeatTimer = setInterval(() => {
        if (joystickInput.active) {
            applyJoystickInput();
        }
    }, 220);
}

function setupTouchControls() {
    const btnAttack = document.getElementById('btn-attack');
    const btnJump = document.getElementById('btn-jump');
    const btnUp = document.getElementById('btn-up');
    const btnDown = document.getElementById('btn-down');
    const btnLeft = document.getElementById('btn-left');
    const btnRight = document.getElementById('btn-right');
    const joystickZone = document.getElementById('joystick-zone');

    if (!joystickZone) return;

    const canInput = () => !player.isMoving && player.hp > 0;

    const bindAction = (button, onPress) => {
        const handlePress = (e) => {
            e.preventDefault();
            e.stopPropagation();
            removeStartUI();
            if (canInput()) onPress();
        };

        button.addEventListener('touchstart', handlePress, { passive: false });
        button.addEventListener('mousedown', handlePress);
        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
    };

    if (btnAttack) {
        bindAction(btnAttack, () => executeAttack());
    }

    if (btnJump) {
        bindAction(btnJump, () => executeJump());
    }

    const bindDirection = (button, direction) => {
        if (!button) return;
        const handlePress = (e) => {
            e.preventDefault();
            e.stopPropagation();
            removeStartUI();
            if (!canInput()) return;
            if (direction === 'up') executeGridMove(1);
            if (direction === 'down') executeGridMove(-1);
            if (direction === 'left') { player.targetAngle += Math.PI / 2; updateDirectionVectors(); }
            if (direction === 'right') { player.targetAngle -= Math.PI / 2; updateDirectionVectors(); }
        };
        button.addEventListener('touchstart', handlePress, { passive: false });
        button.addEventListener('mousedown', handlePress);
        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
    };

    bindDirection(btnUp, 'up');
    bindDirection(btnDown, 'down');
    bindDirection(btnLeft, 'left');
    bindDirection(btnRight, 'right');

    const joystick = nipplejs.create({
        zone: joystickZone,
        size: 120,
        color: 'rgba(255,255,255,0.55)',
        multitouch: false,
        restOpacity: 0.8,
        mode: 'dynamic'
    });

    joystick.on('start', () => {
        joystickInput.active = true;
        startJoystickRepeat();
    });

    joystick.on('move', (evt, data) => {
        const x = data.vector.x;
        const y = data.vector.y;

        if (Math.abs(x) > Math.abs(y)) {
            joystickInput.turn = x > 0 ? -1 : 1;
            joystickInput.move = 0;
        } else {
            joystickInput.turn = 0;
            joystickInput.move = y < 0 ? 1 : y > 0 ? -1 : 0;
        }

        if (Math.abs(x) < 0.15 && Math.abs(y) < 0.15) {
            joystickInput.active = false;
            stopJoystickRepeat();
        }
    });

    joystick.on('end', () => {
        joystickInput.active = false;
        joystickInput.move = 0;
        joystickInput.turn = 0;
        stopJoystickRepeat();
    });
}

// ゲーム初期化（スクリプトは index.html の末尾で順序通りに読み込まれる）
(() => {
    if (!THREE.SkeletonUtils || !THREE.SkeletonUtils.clone) {
        console.warn('THREE.SkeletonUtils が見つかりません。通常の clone() を使用します。');
    }

    initStage();
    window.__GIT_INFO__ = {
        commit: 'c5c08ab-fix vkey',
        date: '2026-07-12 09:49'
    };
    updateCommitInfo();
    setupTouchControls();
    animate();
})();

// アニメーションループ
function animate() {
    requestAnimationFrame(animate);
    updateOverlayVisibility();

    const delta = playerClock.getDelta();
    if (playerMixer) playerMixer.update(delta);

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
            playPlayerAnim('Idle');
            
            enemies.forEach(enemy => {
                enemy.x = enemy.targetX; enemy.z = enemy.targetZ;
                if (enemy.mesh) enemy.mesh.position.set(enemy.x, 0, enemy.z);
                // 移動完了時に Idle に戻す
                if (enemy.isMoving) {
                    enemy.isMoving = false;
                    if (enemy.mixer && enemy.animations && enemy.animations['Idle']) {
                        const idleAction = enemy.animations['Idle'];
                        Object.values(enemy.animations).forEach(a => { if (a !== idleAction) a.fadeOut(0.15); });
                        idleAction.reset().fadeIn(0.15).play();
                    }
                }
            });
            handleTileEvents();
        }
    }

    enemies.forEach(enemy => {
        // 敵ごとの AnimationMixer を更新
        if (enemy.mixer) enemy.mixer.update(delta);

        if (enemy.mesh && player.isMoving) {
            enemy.mesh.position.x += (enemy.targetX - enemy.mesh.position.x) * MOVE_SPEED;
            enemy.mesh.position.z += (enemy.targetZ - enemy.mesh.position.z) * MOVE_SPEED;
            enemy.mesh.position.y = 0.3 + Math.abs(Math.sin(playerGroup.position.x * 4)) * 0.1;
            // 移動方向へ滑らかに回転（lerp）
            enemy.angle += (enemy.targetAngle - enemy.angle) * 0.15;
            enemy.mesh.rotation.y = enemy.angle;
        }
    });

    if (playerGroup) {
        const targetCamX = playerGroup.position.x - Math.sin(player.angle) * 3.5;
        const targetCamZ = playerGroup.position.z - Math.cos(player.angle) * 3.5;
        const targetCamY = 4.0; 

        camera.position.x += (targetCamX - camera.position.x) * 0.06; 
        camera.position.z += (targetCamZ - camera.position.z) * 0.06;
        camera.position.y += (targetCamY - camera.position.y) * 0.06;

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

    updatePlayerOcclusionVisibility();
    updateExplosions(delta);

    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});