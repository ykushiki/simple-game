// --- ゲームの状態管理 ---
let stage = 1;
let MAP_SIZE = 15;
let score = 0;
let isGameOverProcessing = false;
let enemyTurnId = 0;
let suppressEnemyAttackThisTurn = false;
const SCORE_ENEMY = 50;
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
let upButtonPressedTimer = null;

// 3D モデル関連
let playerMixer = null;
let playerAnimations = {};
let playerClock = new THREE.Clock();
const gltfLoader = new THREE.GLTFLoader();
const occlusionRaycaster = new THREE.Raycaster();
const occludedOccluderMeshes = new Set();
const explosions = [];
const flashingTrapTiles = new Set(); // 赤発光中の罠座標を追跡

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
    const size = 512; // テクスチャサイズを拡大
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    if (type === 'grass') {
        // 複雑なノイズレイヤーで自然な草地を生成
        const baseColor = { r: 124, g: 198, b: 109 };
        
        // ベースカラーで塗りつぶし
        for (let i = 0; i < data.length; i += 4) {
            data[i] = baseColor.r;
            data[i + 1] = baseColor.g;
            data[i + 2] = baseColor.b;
            data[i + 3] = 255;
        }
        
        // 複数レイヤーのノイズを追加
        for (let layer = 0; layer < 3; layer++) {
            const scale = Math.pow(2, layer);
            const intensity = (3 - layer) * 0.3;
            
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    // シンプルなパーリンノイズのような効果
                    const nx = (x * scale) % 256;
                    const ny = (y * scale) % 256;
                    const noise = Math.sin(nx * 0.1) * Math.cos(ny * 0.1) * 0.5 + 0.5;
                    
                    if (Math.random() < noise * intensity) {
                        const idx = (y * size + x) * 4;
                        const variation = (Math.random() - 0.5) * 40;
                        data[idx] = Math.max(0, Math.min(255, baseColor.r + variation * 0.8));
                        data[idx + 1] = Math.max(0, Math.min(255, baseColor.g + variation));
                        data[idx + 2] = Math.max(0, Math.min(255, baseColor.b + variation * 0.6));
                    }
                }
            }
        }
        
        // より詳細なストロークを追加（草っぽい線）
        for (let i = 0; i < 800; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            const angle = Math.random() * Math.PI * 2;
            const length = 3 + Math.random() * 8;
            
            ctx.globalAlpha = 0.3 + Math.random() * 0.4;
            ctx.strokeStyle = `rgba(${60 + Math.random() * 30}, ${100 + Math.random() * 60}, ${50 + Math.random() * 20}, 0.6)`;
            ctx.lineWidth = 1 + Math.random() * 1.5;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
            ctx.stroke();
        }
        
        ctx.putImageData(imageData, 0, 0);
    } else {
        // 砂地テクスチャ
        const baseColor = { r: 231, g: 216, b: 168 };
        
        for (let i = 0; i < data.length; i += 4) {
            data[i] = baseColor.r;
            data[i + 1] = baseColor.g;
            data[i + 2] = baseColor.b;
            data[i + 3] = 255;
        }
        
        // 砂粒テクスチャを複数レイヤーで追加
        for (let layer = 0; layer < 2; layer++) {
            const density = layer === 0 ? 0.15 : 0.08;
            
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    if (Math.random() < density) {
                        const idx = (y * size + x) * 4;
                        const grain = Math.random();
                        const variation = (grain - 0.5) * 50;
                        data[idx] = Math.max(0, Math.min(255, baseColor.r + variation * 0.9));
                        data[idx + 1] = Math.max(0, Math.min(255, baseColor.g + variation * 0.7));
                        data[idx + 2] = Math.max(0, Math.min(255, baseColor.b + variation * 0.8));
                    }
                }
            }
        }
        
        ctx.putImageData(imageData, 0, 0);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1);
    texture.encoding = THREE.sRGBEncoding;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
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
                else mapData[x][z] = 0; 
            }
        }
    }

    // 回復アイテムは各フィールドで1つだけ配置する
    const itemCandidates = [];
    for (let x = 1; x < MAP_SIZE - 1; x++) {
        for (let z = 1; z < MAP_SIZE - 1; z++) {
            if (mapData[x][z] === 0 && !(x === 1 && z === 1) && !(x === goal.x && z === goal.z)) {
                itemCandidates.push({ x, z });
            }
        }
    }
    if (itemCandidates.length > 0) {
        const itemPos = itemCandidates[Math.floor(Math.random() * itemCandidates.length)];
        mapData[itemPos.x][itemPos.z] = 3;
    }

    const enemyCount = 3 + Math.floor(stage * 1.2);
    for (let i = 0; i < enemyCount; i++) {
        let rx, rz;
        do {
            rx = Math.floor(Math.random() * (MAP_SIZE - 2)) + 1;
            rz = Math.floor(Math.random() * (MAP_SIZE - 2)) + 1;
        } while (mapData[rx][rz] !== 0 || (rx === 1 && rz === 1) || (rx === goal.x && rz === goal.z));
        
        enemies.push({ x: rx, z: rz, targetX: rx, targetZ: rz, mesh: null, angle: 0, targetAngle: 0, mixer: null, animations: {}, isMoving: false, isDying: false, movedOnTurn: 0 });
    }

    const tileGeo = new THREE.BoxGeometry(0.95, 0.2, 0.95);
    const wallGeo = new THREE.BoxGeometry(0.95, 0.9, 0.95);
    const trapGeo = new THREE.ConeGeometry(0.25, 0.5, 4);

    const trapPlacements = [];
    const attackableBlockPlacements = [];
    const boundaryRockPlacements = [];
    const boundaryPalmPlacements = [];

    const grassTexture = createGroundTexture('grass');
    const sandTexture = createGroundTexture('sand');

    const tileMat = new THREE.MeshPhongMaterial({ color: 0xffffff, map: grassTexture });
    const wallMat = new THREE.MeshPhongMaterial({ color: 0xdfcda3, flatShading: true });
    const trapMat = new THREE.MeshPhongMaterial({ color: 0xcc4444, flatShading: true });
    
    // 赤いリンゴを作成する関数
    function createAppleItem() {
        const appleGroup = new THREE.Group();
        
        // リンゴ本体（赤い球体）
        const appleBody = new THREE.Mesh(
            new THREE.SphereGeometry(0.15, 16, 16),
            new THREE.MeshPhongMaterial({ color: 0xcc3333, shininess: 100 })
        );
        appleBody.position.y = 0;
        appleGroup.add(appleBody);
        
        // 茎（茶色の円柱）
        const stem = new THREE.Mesh(
            new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8),
            new THREE.MeshPhongMaterial({ color: 0x8b5a00 })
        );
        stem.position.y = 0.12;
        stem.position.z = 0.05;
        appleGroup.add(stem);
        
        // 葉（緑色）
        const leaf = new THREE.Mesh(
            new THREE.ConeGeometry(0.08, 0.1, 8),
            new THREE.MeshPhongMaterial({ color: 0x228b22 })
        );
        leaf.position.set(0.06, 0.08, 0.05);
        leaf.rotation.z = Math.PI / 4;
        leaf.scale.set(0.7, 1, 1);
        appleGroup.add(leaf);
        
        return appleGroup;
    }

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
                const itemMesh = createAppleItem();
                itemMesh.position.set(x, 0.25, z);
                gameGroup.add(itemMesh);
                itemMeshes[x][z] = itemMesh;
            }
        }
    }


    // 罠: Prop_Bomb / 攻撃可能ブロック: Prop_Barrel / 外周: Environment_Rock_1-5
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
            gltfLoader.load('../models/Prop_Barrel.gltf', (gltf) => {
                const baseBarrel = prepareLoadedModel(gltf.scene, { scale: 1.0, y: 0, rotationY: 0 });
                normalizeAndCenterModel(baseBarrel);

                attackableBlockPlacements.forEach(({ x, z, fallback }) => {
                    const barrel = baseBarrel.clone(true);
                    cloneObjectMaterials(barrel);
                    markAsPlayerOccluder(barrel);
                    barrel.position.set(x, 0, z);
                    if (fallback) gameGroup.remove(fallback);
                    gameGroup.add(barrel);
                    mapMeshes[x][z] = barrel;
                });
            }, undefined, (error) => {
                console.error('Prop_Barrel 読み込み失敗:', error);
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

        // ゴール外側の海に大型船を配置
        gltfLoader.load('../models/Ship_Large.gltf', (gltf) => {
            const ship = prepareLoadedModel(gltf.scene, { scale: 1.0, y: 0, rotationY: 0 });
            normalizeAndCenterModel(ship);
            cloneObjectMaterials(ship);

            // ゴール位置から海側（フィールド外）へ配置
            const shipX = goal.x + 2;
            const shipZ = goal.z + 2;
            ship.position.set(shipX, -0.14, shipZ);

            // 船首をゴール方向に向ける
            const toGoalX = goal.x - shipX;
            const toGoalZ = goal.z - shipZ;
            ship.rotation.y = Math.atan2(toGoalX, toGoalZ);

            gameGroup.add(ship);
        }, undefined, (error) => {
            console.error('Ship_Large 読み込み失敗:', error);
        });
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

    const scoreText = document.getElementById('score-text');
    if (scoreText) scoreText.innerText = `${score}`;
}

function addScore(points) {
    if (points <= 0) return;
    score += points;
    updateUI();
}

function showGameOverScore() {
    const panel = document.getElementById('gameover-score');
    const value = document.getElementById('gameover-score-value');
    if (!panel || !value) return;
    value.innerText = `${score}`;
    panel.classList.remove('hidden-overlay');
}

function hideGameOverScore() {
    const panel = document.getElementById('gameover-score');
    if (panel) panel.classList.add('hidden-overlay');
}

function handleGameOver(message) {
    if (isGameOverProcessing) return;
    isGameOverProcessing = true;
    showGameOverScore();
    if (message) console.log(message);

    setTimeout(() => {
        stage = 1;
        player.hp = player.maxHp;
        score = 0;
        hideGameOverScore();
        updateUI();
        initStage();
        isGameOverProcessing = false;
    }, 1400);
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
    // 赤発光中フラグを立てる
    enemy.isFlashing = true;
    flashModelDamageRed(enemy.mesh, durationMs);
    // フラッシュ終了後にフラグを解除
    setTimeout(() => {
        enemy.isFlashing = false;
    }, durationMs);
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

function faceEnemyToPlayer(enemy) {
    if (!enemy) return;
    const dx = player.x - enemy.x;
    const dz = player.z - enemy.z;
    if (dx === 0 && dz === 0) return;

    const angleToPlayer = Math.atan2(dx, dz);
    enemy.targetAngle = angleToPlayer;
    enemy.angle = angleToPlayer;
    if (enemy.mesh) enemy.mesh.rotation.y = angleToPlayer;
}

function findEnemyRespawnTile(excludeEnemy) {
    const candidates = [];
    for (let x = 1; x < MAP_SIZE - 1; x++) {
        for (let z = 1; z < MAP_SIZE - 1; z++) {
            if (mapData[x][z] !== 0) continue;
            if ((x === player.x && z === player.z) || (x === goal.x && z === goal.z)) continue;
            const manhattanDistanceToPlayer = Math.abs(x - player.x) + Math.abs(z - player.z);
            if (manhattanDistanceToPlayer < 3) continue;
            const occupied = enemies.some((e) => e !== excludeEnemy && e.x === x && e.z === z);
            if (!occupied) candidates.push({ x, z });
        }
    }
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
}

function respawnEnemy(enemy) {
    if (!enemy) return;
    const tile = findEnemyRespawnTile(enemy);
    if (!tile) return;

    enemy.x = tile.x;
    enemy.z = tile.z;
    enemy.targetX = tile.x;
    enemy.targetZ = tile.z;
    enemy.isMoving = false;
    enemy.isDying = false;
    enemy.isFlashing = false;
    enemy.shouldActOnce = false;
    enemy.skipCounterOnce = false;
    enemy.hasCountered = false;
    enemy.movedOnTurn = 0;
    enemy.targetAngle = 0;
    enemy.angle = 0;

    if (enemy.mesh) {
        enemy.mesh.visible = true;
        enemy.mesh.position.set(enemy.x, 0, enemy.z);
        enemy.mesh.rotation.y = enemy.angle;
    }

    if (enemy.mixer && enemy.animations && enemy.animations['Idle']) {
        playEnemyAnim(enemy, 'Idle');
    }
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

    // 敵は攻撃前にプレイヤー方向を向き、Sword を行う
    faceEnemyToPlayer(clashEnemy);
    const swordAction = playEnemyAnim(clashEnemy, 'Sword');
    if (swordAction) {
        const swordDuration = swordAction.getClip().duration * 1000;
        setTimeout(() => {
            if (clashEnemy.mesh) playEnemyAnim(clashEnemy, 'Idle');
        }, swordDuration);
    }

    applyDamage(3);
    reactToDamage();
    if (player.hp <= 0) {
        handleGameOver("敵に敗北してしまった…");
    }
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

function handleBlockedByEnemyCollision(stepX, stepZ) {
    // 進行方向の逆側へノックバック先を作る
    const knockbackX = player.x - stepX;
    const knockbackZ = player.z - stepZ;

    const canKnockback = mapData[knockbackX]
        && mapData[knockbackX][knockbackZ] !== 1
        && !isEnemyOccupied(knockbackX, knockbackZ)
        && !(knockbackX === player.x && knockbackZ === player.z);

    if (canKnockback) {
        player.prevX = knockbackX;
        player.prevZ = knockbackZ;
    }

    applyDamage(3);
    reactToDamage();
    if (player.hp <= 0) {
        handleGameOver("敵に敗北してしまった…");
    }
}

function executeGridMove(moveStep) {
    const nextX = player.x + player.dirX * moveStep;
    const nextZ = player.z + player.dirZ * moveStep;
    if (!mapData[nextX] || mapData[nextX][nextZ] === 1) return;

    if (isEnemyOccupied(nextX, nextZ)) {
        handleBlockedByEnemyCollision(player.dirX * moveStep, player.dirZ * moveStep);
        return;
    }

    {
        // 攻撃せず移動する場合、移動開始時に隣接敵がいればそのターンの敵攻撃を無効化
        const hadAdjacentEnemy = enemies.some((enemy) => {
            if (enemy.isDying || enemy.isFlashing) return false;
            return (Math.abs(enemy.x - player.x) + Math.abs(enemy.z - player.z)) === 1;
        });
        suppressEnemyAttackThisTurn = hadAdjacentEnemy;

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
        // 被弾時はプレイヤー方向を向く
        faceEnemyToPlayer(hitEnemy);

        // 敵は消さずに赤発光し、1回の行動機会を与える
        hitEnemy.shouldActOnce = true;
        // 被弾した敵はこの行動中の反撃のみキャンセルする
        hitEnemy.skipCounterOnce = true;
        hitEnemy.targetX = hitEnemy.x;
        hitEnemy.targetZ = hitEnemy.z;

        // Sword の中間タイミングで敵の赤発光
        setTimeout(() => {
            flashEnemyDamageRed(hitEnemy);
        }, halfSword);
        
        // 敵の行動後にDeath アニメーションを開始（赤発光終了 + 少し待機）
        setTimeout(() => {
            const deadAction = (hitEnemy.animations && (hitEnemy.animations['Death'] || hitEnemy.animations['death'])) || null;
            if (hitEnemy.mixer && deadAction) {
                hitEnemy.isDying = true;
                deadAction.loop = THREE.LoopOnce;
                deadAction.clampWhenFinished = true;
                Object.values(hitEnemy.animations).forEach(a => { if (a !== deadAction) a.fadeOut(0.15); });
                deadAction.reset().fadeIn(0.15).play();

                // Dead 終了後にメッシュを削除する
                const deadDuration = deadAction.getClip().duration * 1000;
                setTimeout(() => {
                    addScore(SCORE_ENEMY);
                    respawnEnemy(hitEnemy);
                }, deadDuration);
            } else {
                // Dead アニメーションがない場合はすぐ消す
                addScore(SCORE_ENEMY);
                respawnEnemy(hitEnemy);
            }
        }, halfSword + 260 + 300);
        moveEnemies();
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
        return;
    }

}

function executeJump() {
    const landX = player.x + player.dirX * 2;
    const landZ = player.z + player.dirZ * 2;
    if (!mapData[landX] || mapData[landX][landZ] === 1) return;

    if (isEnemyOccupied(landX, landZ)) {
        handleBlockedByEnemyCollision(player.dirX, player.dirZ);
        return;
    }

    {
        // 攻撃せず移動する場合、移動開始時に隣接敵がいればそのターンの敵攻撃を無効化
        const hadAdjacentEnemy = enemies.some((enemy) => {
            if (enemy.isDying || enemy.isFlashing) return false;
            return (Math.abs(enemy.x - player.x) + Math.abs(enemy.z - player.z)) === 1;
        });
        suppressEnemyAttackThisTurn = hadAdjacentEnemy;

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
    enemyTurnId += 1;
    const currentEnemyTurn = enemyTurnId;
    const suppressAttack = suppressEnemyAttackThisTurn;
    suppressEnemyAttackThisTurn = false;

    // 1) 移動フェーズ: キャンセル敵は行動しない
    enemies.forEach(enemy => {
        if (enemy.isDying) return;
        if (enemy.skipCounterOnce) return;

        const dx = Math.sign(player.x - enemy.x);
        const dz = Math.sign(player.z - enemy.z);
        const preferX = Math.abs(player.x - enemy.x) >= Math.abs(player.z - enemy.z);

        const candidateMoves = preferX
            ? [
                { x: enemy.x + dx, z: enemy.z },
                { x: enemy.x, z: enemy.z + dz },
                { x: enemy.x, z: enemy.z + 1 },
                { x: enemy.x, z: enemy.z - 1 },
                { x: enemy.x + 1, z: enemy.z },
                { x: enemy.x - 1, z: enemy.z }
            ]
            : [
                { x: enemy.x, z: enemy.z + dz },
                { x: enemy.x + dx, z: enemy.z },
                { x: enemy.x + 1, z: enemy.z },
                { x: enemy.x - 1, z: enemy.z },
                { x: enemy.x, z: enemy.z + 1 },
                { x: enemy.x, z: enemy.z - 1 }
            ];

        const canMoveTo = (tx, tz) => {
            if (!mapData[tx] || mapData[tx][tz] === 1) return false;
            if (tx === goal.x && tz === goal.z) return false;
            if (tx === player.x && tz === player.z) return false;
            if (tx === enemy.x && tz === enemy.z) return false;
            const occupiedByOtherEnemy = enemies.some((e) => e !== enemy && ((e.x === tx && e.z === tz) || (e.targetX === tx && e.targetZ === tz)));
            return !occupiedByOtherEnemy;
        };

        const next = candidateMoves.find((m) => canMoveTo(m.x, m.z));
        if (next) {
            const nextX = next.x;
            const nextZ = next.z;
            enemy.targetX = nextX;
            enemy.targetZ = nextZ;
            enemy.isMoving = true;
            enemy.movedOnTurn = currentEnemyTurn;

            const mdx = nextX - enemy.x;
            const mdz = nextZ - enemy.z;
            if (mdx !== 0 || mdz !== 0) {
                enemy.targetAngle = Math.atan2(mdx, mdz);
            }

            if (enemy.mixer && enemy.animations && enemy.animations['Run']) {
                playEnemyAnim(enemy, 'Run');
            }
        } else if (enemy.shouldActOnce) {
            enemy.shouldActOnce = false;
        }
    });

    // 2) 攻撃フェーズ: 隣接敵のみ攻撃、ただし同ターンに移動した敵は攻撃しない
    enemies.forEach(enemy => {
        if (suppressAttack) return;
        if (enemy.isDying || enemy.isFlashing) return;
        if (enemy.movedOnTurn === currentEnemyTurn) return;

        const dx = Math.abs(enemy.x - player.x);
        const dz = Math.abs(enemy.z - player.z);
        if (dx + dz !== 1) return;

        if (enemy.skipCounterOnce) {
            enemy.skipCounterOnce = false;
            enemy.shouldActOnce = false;
            return;
        }

        if (!enemy.hasCountered) {
            enemy.hasCountered = true;
            faceEnemyToPlayer(enemy);
            const swordAction = playEnemyAnim(enemy, 'Sword');
            if (swordAction) {
                const swordDuration = swordAction.getClip().duration * 1000;
                setTimeout(() => {
                    if (!enemy.isDying && enemy.mesh) playEnemyAnim(enemy, 'Idle');
                    enemy.hasCountered = false;
                }, swordDuration);
            }
            applyDamage(3);
            reactToDamage();
            if (player.hp <= 0) { handleGameOver("敵に敗北してしまった…"); }
        }
    });

    // 3) 非隣接で消費しきれなかったキャンセルフラグをターン終端で消費
    enemies.forEach(enemy => {
        if (enemy.skipCounterOnce) {
            enemy.skipCounterOnce = false;
            enemy.shouldActOnce = false;
        }
    });

    // 敵の行動後に shouldActOnce フラグをクリア
    enemies.forEach(enemy => {
        if (enemy.shouldActOnce && !enemy.isMoving) {
            enemy.shouldActOnce = false;
        }
    });
}

function isEnemyAt(x, z) { 
    // 現在位置と目標位置の両方をチェック（重複防止）
    return enemies.some(e => (e.x === x && e.z === z) || (e.targetX === x && e.targetZ === z)); 
}

function isEnemyOccupied(x, z) {
    // 死亡中の敵は占有扱いしない
    return enemies.some((e) => !e.isDying && e.x === x && e.z === z);
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
    // 赤発光中の罠は当たり判定なし
    if (mapData[player.x][player.z] === 2 && !flashingTrapTiles.has(`${player.x},${player.z}`)) {
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
            // 赤発光中フラグを立てる
            const trapKey = `${trapX},${trapZ}`;
            flashingTrapTiles.add(trapKey);
            flashModelDamageRed(mapMeshes[trapX][trapZ], 260);
            // 赤発光終了後にメッシュを削除してから爆発エフェクト開始
            setTimeout(() => {
                if (mapMeshes[trapX][trapZ]) {
                    const pos = new THREE.Vector3();
                    mapMeshes[trapX][trapZ].getWorldPosition(pos);
                    gameGroup.remove(mapMeshes[trapX][trapZ]);
                    mapMeshes[trapX][trapZ] = null;
                    mapData[trapX][trapZ] = 0;
                    flashingTrapTiles.delete(trapKey);
                    createExplosion(pos);
                }
            }, 260);
        }
        
        if (player.hp <= 0) { handleGameOver("罠にかかって倒れてしまった…"); return; }
    }
    enemies.forEach(enemy => {
        // Death 中または赤発光中の敵は当たり判定なし
        if (enemy.x === player.x && enemy.z === player.z && !enemy.isDying && !enemy.isFlashing && enemy.movedOnTurn !== enemyTurnId) {
            applyDamage(3);
            reactToDamage();

            const swordAction = playEnemyAnim(enemy, 'Sword');
            if (swordAction) {
                const swordDuration = swordAction.getClip().duration * 1000;
                setTimeout(() => {
                    if (!enemy.isDying && enemy.mesh) playEnemyAnim(enemy, 'Idle');
                }, swordDuration);
            }

            if (player.hp <= 0) { handleGameOver("敵に敗北してしまった…"); }
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
            if (direction === 'up') {
                // 上ボタン：長押し対応
                if (!upButtonPressedTimer) {
                    executeGridMove(1);
                    upButtonPressedTimer = setInterval(() => {
                        if (canInput()) executeGridMove(1);
                    }, 220);
                }
            }
            if (direction === 'down') executeGridMove(-1);
            if (direction === 'left') { player.targetAngle += Math.PI / 2; updateDirectionVectors(); }
            if (direction === 'right') { player.targetAngle -= Math.PI / 2; updateDirectionVectors(); }
        };
        const handleRelease = (e) => {
            if (direction === 'up') {
                if (upButtonPressedTimer) {
                    clearInterval(upButtonPressedTimer);
                    upButtonPressedTimer = null;
                }
            }
        };
        button.addEventListener('touchstart', handlePress, { passive: false });
        button.addEventListener('touchend', handleRelease, { passive: false });
        button.addEventListener('mousedown', handlePress);
        button.addEventListener('mouseup', handleRelease);
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

        if (enemy.mesh && (player.isMoving || enemy.isMoving)) {
            enemy.mesh.position.x += (enemy.targetX - enemy.mesh.position.x) * MOVE_SPEED;
            enemy.mesh.position.z += (enemy.targetZ - enemy.mesh.position.z) * MOVE_SPEED;
            // 敵が実際に移動中の場合のみ、わずかなY変動を加える
            if (enemy.isMoving) {
                enemy.mesh.position.y = 0.3 + Math.abs(Math.sin(playerGroup.position.x * 4)) * 0.1;
            } else {
                enemy.mesh.position.y = 0;
            }
            // 移動方向へ滑らかに回転（lerp）
            enemy.angle += (enemy.targetAngle - enemy.angle) * 0.15;
            enemy.mesh.rotation.y = enemy.angle;

            // プレイヤー移動の有無に関係なく、敵自身で移動完了を確定する
            if (enemy.isMoving &&
                Math.abs(enemy.mesh.position.x - enemy.targetX) < 0.05 &&
                Math.abs(enemy.mesh.position.z - enemy.targetZ) < 0.05) {
                enemy.x = enemy.targetX;
                enemy.z = enemy.targetZ;
                enemy.mesh.position.set(enemy.x, 0, enemy.z);
                enemy.isMoving = false;
                enemy.shouldActOnce = false;

                if (enemy.mixer && enemy.animations && enemy.animations['Idle']) {
                    const idleAction = enemy.animations['Idle'];
                    Object.values(enemy.animations).forEach(a => { if (a !== idleAction) a.fadeOut(0.15); });
                    idleAction.reset().fadeIn(0.15).play();
                }
            }
        } else if (enemy.mesh) {
            // プレイヤーが移動していない場合は敵のY位置を確実に0にする
            enemy.mesh.position.y = 0;
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
                itemMeshes[x][z].rotation.y += 0.03; // リンゴを回転させる
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