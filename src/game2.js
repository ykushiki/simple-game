/**
 * 3D Grid-Based Action Game (Refactored)
 * Dependencies: Three.js, Three.GLTFLoader, Three.SkeletonUtils, nipplejs
 */

// --- ゲーム全体の共通設定 ---
const CONFIG = {
    INITIAL_MAP_SIZE: 15,
    MAP_SIZE_INCREMENT: 2,
    MOVE_SPEED: 0.15,
    PLAYER_MAX_HP: 15,
    PLAYER_DAMAGE: 3,
    TRAP_DAMAGE: 2,
    SCORE_ENEMY: 50,
    HEAL_AMOUNT: 5,
    CAMERA_LERP_FACTOR: 0.06,
    JOYSTICK_REPEAT_INTERVAL: 220,
    DAMAGE_FLASH_DURATION: 260
};

// --- アセット読み込み・共通ユーティリティ ---
const Utils = {
    cloneObjectMaterials(root) {
        if (!root) return;
        root.traverse((child) => {
            if (!child.isMesh || !child.material) return;
            if (Array.isArray(child.material)) {
                child.material = child.material.map((mat) => (mat ? mat.clone() : mat));
            } else {
                child.material = child.material.clone();
            }
        });
    },

    markAsPlayerOccluder(root) {
        if (!root) return;
        root.traverse((child) => {
            if (child.isMesh) child.userData.isPlayerOccluder = true;
        });
    },

    normalizeAndCenterModel(model) {
        const box = new THREE.Box3().setFromObject(model);
        if (!box.isEmpty()) {
            const center = box.getCenter(new THREE.Vector3());
            model.position.x -= center.x;
            model.position.z -= center.z;
            model.position.y -= box.min.y;
        }
    },

    prepareLoadedModel(model, { scale = 1, y = 0, rotationY = -Math.PI / 2 } = {}) {
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
    },

    flashModelRed(root, durationMs = 220) {
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
};

// --- キャラクターの基底クラス ---
class CharacterBase {
    constructor(x, z) {
        this.x = x;
        this.z = z;
        this.targetX = x;
        this.targetZ = z;
        this.prevX = x;
        this.prevZ = z;
        this.angle = 0;
        this.targetAngle = 0;
        this.mesh = null;
        this.mixer = null;
        this.animations = {};
        this.isMoving = false;
    }

    playAnimation(name, fadeTime = 0.15) {
        if (!this.mixer || !this.animations) return null;
        const action = this.animations[name];
        if (!action) return null;

        Object.values(this.animations).forEach((a) => {
            if (a !== action) a.fadeOut(fadeTime);
        });
        action.reset().fadeIn(fadeTime).play();
        return action;
    }

    updateAnimation(delta) {
        if (this.mixer) {
            this.mixer.update(delta);
        }
    }
}

// --- プレイヤーキャラクタークラス ---
class Player extends CharacterBase {
    constructor(x, z) {
        super(x, z);
        this.hp = CONFIG.PLAYER_MAX_HP;
        this.maxHp = CONFIG.PLAYER_MAX_HP;
        this.dirX = 0;
        this.dirZ = 1;
        this.isJumping = false;
        this.jumpTimer = 0;
        this.visualY = 0;
    }

    reset(x, z) {
        this.x = x;
        this.z = z;
        this.targetX = x;
        this.targetZ = z;
        this.prevX = x;
        this.prevZ = z;
        this.dirX = 0;
        this.dirZ = 1;
        this.angle = 0;
        this.targetAngle = 0;
        this.isMoving = false;
        this.isJumping = false;
        this.jumpTimer = 0;
        this.visualY = 0;
        if (this.mesh) {
            this.mesh.position.set(x, 0, z);
            this.mesh.rotation.y = 0;
        }
        this.playAnimation('Idle');
    }

    updateDirection() {
        this.dirX = Math.round(Math.sin(this.targetAngle));
        this.dirZ = Math.round(Math.cos(this.targetAngle));
    }

    applyDamage(amount) {
        this.hp = Math.max(0, this.hp - amount);
        Utils.flashModelRed(this.mesh, CONFIG.DAMAGE_FLASH_DURATION);

        const hitReactAction = this.animations['HitReact'];
        if (hitReactAction) {
            this.playAnimation('HitReact');
            const duration = hitReactAction.getClip().duration * 1000;
            setTimeout(() => {
                if (!this.isMoving && this.hp > 0) this.playAnimation('Idle');
            }, duration);
        }
    }

    heal(amount) {
        this.hp = Math.min(this.hp + amount, this.maxHp);
    }
}

// --- 敵キャラクタークラス ---
class Enemy extends CharacterBase {
    constructor(x, z) {
        super(x, z);
        this.isDying = false;
        this.isFlashing = false;
        this.shouldActOnce = false;
        this.skipCounterOnce = false;
        this.hasCountered = false;
        this.movedOnTurn = 0;
    }

    resetState(x, z) {
        this.x = x;
        this.z = z;
        this.targetX = x;
        this.targetZ = z;
        this.angle = 0;
        this.targetAngle = 0;
        this.isMoving = false;
        this.isDying = false;
        this.isFlashing = false;
        this.shouldActOnce = false;
        this.skipCounterOnce = false;
        this.hasCountered = false;
        this.movedOnTurn = 0;

        if (this.mesh) {
            this.mesh.visible = true;
            this.mesh.position.set(x, 0, z);
            this.mesh.rotation.y = 0;
        }
        this.playAnimation('Idle');
    }

    flashDamage() {
        this.isFlashing = true;
        Utils.flashModelRed(this.mesh, CONFIG.DAMAGE_FLASH_DURATION);
        setTimeout(() => {
            this.isFlashing = false;
        }, CONFIG.DAMAGE_FLASH_DURATION);
    }

    faceToward(targetX, targetZ) {
        const dx = targetX - this.x;
        const dz = targetZ - this.z;
        if (dx === 0 && dz === 0) return;
        const angle = Math.atan2(dx, dz);
        this.targetAngle = angle;
        this.angle = angle;
        if (this.mesh) this.mesh.rotation.y = angle;
    }
}

// --- マップ・ギミック・エフェクト管理者クラス ---
class MapManager {
    constructor(game) {
        this.game = game;
        this.mapData = [];
        this.mapMeshes = [];
        this.itemMeshes = [];
        this.flashingTrapTiles = new Set();
        this.explosions = [];
        this.goalMesh = null;
    }

    clear() {
        this.mapData = [];
        this.mapMeshes = [];
        this.itemMeshes = [];
        this.flashingTrapTiles.clear();
        this.explosions.forEach((exp) => {
            this.game.gameGroup.remove(exp.system);
            exp.system.geometry.dispose();
            exp.system.material.dispose();
        });
        this.explosions = [];
    }

    createGroundTexture(type) {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(size, size);
        const data = imageData.data;

        if (type === 'grass') {
            const baseColor = { r: 124, g: 198, b: 109 };
            for (let i = 0; i < data.length; i += 4) {
                data[i] = baseColor.r;
                data[i + 1] = baseColor.g;
                data[i + 2] = baseColor.b;
                data[i + 3] = 255;
            }
            for (let layer = 0; layer < 3; layer++) {
                const scale = Math.pow(2, layer);
                const intensity = (3 - layer) * 0.3;
                for (let y = 0; y < size; y++) {
                    for (let x = 0; x < size; x++) {
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
            const baseColor = { r: 231, g: 216, b: 168 };
            for (let i = 0; i < data.length; i += 4) {
                data[i] = baseColor.r;
                data[i + 1] = baseColor.g;
                data[i + 2] = baseColor.b;
                data[i + 3] = 255;
            }
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
        texture.anisotropy = Math.min(8, this.game.renderer.capabilities.getMaxAnisotropy());
        return texture;
    }

    createAppleItem() {
        const appleGroup = new THREE.Group();
        const appleBody = new THREE.Mesh(
            new THREE.SphereGeometry(0.15, 16, 16),
            new THREE.MeshPhongMaterial({ color: 0xcc3333, shininess: 100 })
        );
        appleGroup.add(appleBody);

        const stem = new THREE.Mesh(
            new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8),
            new THREE.MeshPhongMaterial({ color: 0x8b5a00 })
        );
        stem.position.set(0, 0.12, 0.05);
        appleGroup.add(stem);

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

    createExplosion(pos) {
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
        this.game.gameGroup.add(pSystem);

        this.explosions.push({
            system: pSystem,
            velocities: velocities,
            life: 1.0
        });
    }

    updateExplosions(deltaTime) {
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            const exp = this.explosions[i];
            exp.life -= deltaTime;

            if (exp.life <= 0) {
                this.game.gameGroup.remove(exp.system);
                exp.system.geometry.dispose();
                exp.system.material.dispose();
                this.explosions.splice(i, 1);
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

    triggerTrapExplosion(tx, tz) {
        const trapKey = `${tx},${tz}`;
        if (this.flashingTrapTiles.has(trapKey)) return;

        const trapMesh = this.mapMeshes[tx][tz];
        if (!trapMesh) return;

        this.flashingTrapTiles.add(trapKey);
        Utils.flashModelRed(trapMesh, CONFIG.DAMAGE_FLASH_DURATION);

        setTimeout(() => {
            const targetMesh = this.mapMeshes[tx][tz];
            if (targetMesh) {
                const pos = new THREE.Vector3();
                targetMesh.getWorldPosition(pos);
                this.game.gameGroup.remove(targetMesh);
                this.mapMeshes[tx][tz] = null;
                this.mapData[tx][tz] = 0;
                this.flashingTrapTiles.delete(trapKey);
                this.createExplosion(pos);
            }
        }, CONFIG.DAMAGE_FLASH_DURATION);
    }
}

// --- メインゲームクラス ---
class Game {
    constructor() {
        this.stage = 1;
        this.mapSize = CONFIG.INITIAL_MAP_SIZE;
        this.score = 0;
        this.isGameOverProcessing = false;
        this.enemyTurnId = 0;
        this.suppressEnemyAttackThisTurn = false;
        this.hasMovedOnce = false;

        this.enemies = [];
        this.player = null;

        // Three.js 環境初期化
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x4ca6ff);
        this.scene.fog = new THREE.FogExp2(0xa7d8f0, 0.010);

        this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.playerClock = new THREE.Clock();
        this.gltfLoader = new THREE.GLTFLoader();
        
        this.occlusionRaycaster = new THREE.Raycaster();
        this.occludedOccluderMeshes = new Set();

        this.gameGroup = new THREE.Group();
        this.scene.add(this.gameGroup);

        this.mapManager = new MapManager(this);

        this.joystickInput = { active: false, move: 0, turn: 0 };
        this.joystickRepeatTimer = null;
        this.upButtonPressedTimer = null;

        this.initEngine();
    }

    initEngine() {
        // レンダラー設定
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 0.88;
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        const dom = this.renderer.domElement;
        dom.style.position = 'fixed';
        dom.style.top = '0';
        dom.style.left = '0';
        dom.style.width = '100%';
        dom.style.height = '100%';
        dom.style.zIndex = '0';
        document.body.appendChild(dom);

        // ライト設定
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

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
        this.scene.add(dirLight);

        // プレイヤー初期化
        this.player = new Player(1, 1);

        window.addEventListener('resize', () => this.onWindowResize());
    }

    start() {
        this.initStage();
        this.setupGitInfo();
        this.setupTouchControls();
        this.setupKeyboardControls();
        this.animate();
    }

    initStage() {
        // フィールド上のアセットを全てクリア
        while (this.gameGroup.children.length > 0) {
            this.gameGroup.remove(this.gameGroup.children[0]);
        }
        this.enemies = [];
        this.mapManager.clear();

        this.mapSize = CONFIG.INITIAL_MAP_SIZE + (this.stage - 1) * CONFIG.MAP_SIZE_INCREMENT;
        this.goal = { x: this.mapSize - 2, z: this.mapSize - 2 };

        document.getElementById('stage-display').innerText = `STAGE: ${this.stage}`;
        this.updateUI();
        this.updateOverlayVisibility();

        this.player.reset(1, 1);
        this.hasMovedOnce = false;

        // マップデータの生成
        const mapData = this.mapManager.mapData;
        const mapMeshes = this.mapManager.mapMeshes;
        const itemMeshes = this.mapManager.itemMeshes;

        for (let x = 0; x < this.mapSize; x++) {
            mapData[x] = [];
            mapMeshes[x] = [];
            itemMeshes[x] = [];
            for (let z = 0; z < this.mapSize; z++) {
                if (x === 0 || x === this.mapSize - 1 || z === 0 || z === this.mapSize - 1) {
                    mapData[x][z] = 1; // 外周壁
                } else if ((x === 1 && z === 1) || (x === this.goal.x && z === this.goal.z)) {
                    mapData[x][z] = 0; // 開始とゴールは安全地帯
                } else {
                    const rand = Math.random();
                    if (rand < 0.18) mapData[x][z] = 1;      // 壁
                    else if (rand < 0.24) mapData[x][z] = 2; // 罠
                    else mapData[x][z] = 0;                  // 平地
                }
            }
        }

        // 回復用リンゴを1つだけ配置
        const itemCandidates = [];
        for (let x = 1; x < this.mapSize - 1; x++) {
            for (let z = 1; z < this.mapSize - 1; z++) {
                if (mapData[x][z] === 0 && !(x === 1 && z === 1) && !(x === this.goal.x && z === this.goal.z)) {
                    itemCandidates.push({ x, z });
                }
            }
        }
        if (itemCandidates.length > 0) {
            const itemPos = itemCandidates[Math.floor(Math.random() * itemCandidates.length)];
            mapData[itemPos.x][itemPos.z] = 3;
        }

        // 敵の生成
        const enemyCount = 3 + Math.floor(this.stage * 1.2);
        for (let i = 0; i < enemyCount; i++) {
            let rx, rz;
            do {
                rx = Math.floor(Math.random() * (this.mapSize - 2)) + 1;
                rz = Math.floor(Math.random() * (this.mapSize - 2)) + 1;
            } while (mapData[rx][rz] !== 0 || (rx === 1 && rz === 1) || (rx === this.goal.x && rz === this.goal.z));

            this.enemies.push(new Enemy(rx, rz));
        }

        // メッシュ構築
        this.buildMapGraphics();
        this.loadModels();
        this.updateCameraImmediate();
    }

    buildMapGraphics() {
        const tileGeo = new THREE.BoxGeometry(0.95, 0.2, 0.95);
        const wallGeo = new THREE.BoxGeometry(0.95, 0.9, 0.95);
        const trapGeo = new THREE.ConeGeometry(0.25, 0.5, 4);

        const grassTexture = this.mapManager.createGroundTexture('grass');
        const sandTexture = this.mapManager.createGroundTexture('sand');

        const tileMat = new THREE.MeshPhongMaterial({ color: 0xffffff, map: grassTexture });
        const wallMat = new THREE.MeshPhongMaterial({ color: 0xdfcda3, flatShading: true });
        const trapMat = new THREE.MeshPhongMaterial({ color: 0xcc4444, flatShading: true });

        const trapPlacements = [];
        const attackableBlockPlacements = [];
        const boundaryRockPlacements = [];
        const boundaryPalmPlacements = [];

        const mapData = this.mapManager.mapData;
        const mapMeshes = this.mapManager.mapMeshes;
        const itemMeshes = this.mapManager.itemMeshes;

        for (let x = 0; x < this.mapSize; x++) {
            for (let z = 0; z < this.mapSize; z++) {
                // 基本の床配置
                const tile = new THREE.Mesh(tileGeo, tileMat);
                tile.position.set(x, -0.1, z);
                tile.receiveShadow = true;
                this.gameGroup.add(tile);

                if (mapData[x][z] === 1) {
                    const wall = new THREE.Mesh(wallGeo, wallMat);
                    wall.position.set(x, 0.45, z);
                    wall.castShadow = true;
                    wall.receiveShadow = true;
                    this.gameGroup.add(wall);

                    const isBoundary = (x === 0 || z === 0 || x === this.mapSize - 1 || z === this.mapSize - 1);
                    if (isBoundary) {
                        Utils.markAsPlayerOccluder(wall);
                        if (Math.random() < 0.35) {
                            boundaryPalmPlacements.push({ x, z, variant: 1 + Math.floor(Math.random() * 3), fallback: wall });
                        } else {
                            boundaryRockPlacements.push({ x, z, variant: 1 + Math.floor(Math.random() * 5), fallback: wall });
                        }
                    } else {
                        mapMeshes[x][z] = wall;
                        attackableBlockPlacements.push({ x, z, fallback: wall });
                    }
                } else if (mapData[x][z] === 2) {
                    const trap = new THREE.Mesh(trapGeo, trapMat);
                    trap.position.set(x, 0.25, z);
                    trap.castShadow = true;
                    this.gameGroup.add(trap);
                    mapMeshes[x][z] = trap;
                    trapPlacements.push({ x, z, fallback: trap });
                } else if (mapData[x][z] === 3) {
                    const apple = this.mapManager.createAppleItem();
                    apple.position.set(x, 0.25, z);
                    this.gameGroup.add(apple);
                    itemMeshes[x][z] = apple;
                }
            }
        }

        // 外周の砂地と海を構築
        const beachMat = new THREE.MeshPhongMaterial({ color: 0xffffff, map: sandTexture });
        const beachThickness = 3;
        for (let x = -beachThickness; x < this.mapSize + beachThickness; x++) {
            for (let z = -beachThickness; z < this.mapSize + beachThickness; z++) {
                if (x < 0 || x >= this.mapSize || z < 0 || z >= this.mapSize) {
                    const beachTile = new THREE.Mesh(tileGeo, beachMat);
                    beachTile.position.set(x, -0.15, z);
                    beachTile.receiveShadow = true;
                    this.gameGroup.add(beachTile);
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
        ocean.position.set(this.mapSize / 2, -0.22, this.mapSize / 2);
        ocean.receiveShadow = true;
        this.gameGroup.add(ocean);

        // プレイヤー初期化用の簡易メッシュ（後ほど 3D モデルに置換）
        this.playerGroup = new THREE.Group();
        const bodyGeo = new THREE.BoxGeometry(0.5, 0.8, 0.5);
        const bodyMat = new THREE.MeshPhongMaterial({ color: 0x2277ff, flatShading: true });
        const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
        bodyMesh.position.y = 0.4;
        bodyMesh.castShadow = true;
        this.playerGroup.add(bodyMesh);

        const eyeGeo = new THREE.BoxGeometry(0.3, 0.15, 0.15);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffdd00 });
        const eyeMesh = new THREE.Mesh(eyeGeo, eyeMat);
        eyeMesh.position.set(0, 0.6, 0.25);
        this.playerGroup.add(eyeMesh);

        this.playerGroup.position.set(this.player.x, 0, this.player.z);
        this.gameGroup.add(this.playerGroup);
        this.player.mesh = this.playerGroup;

        // ゴールメッシュ
        const goalGeo = new THREE.TorusGeometry(0.3, 0.1, 8, 16);
        const goalMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, metalness: 0.5 });
        this.goalMesh = new THREE.Mesh(goalGeo, goalMat);
        this.goalMesh.position.set(this.goal.x, 0.5, this.goal.z);
        this.gameGroup.add(this.goalMesh);

        // 敵のプリミティブ配置
        const enemyGeo = new THREE.ConeGeometry(0.3, 0.6, 4);
        const enemyMat = new THREE.MeshPhongMaterial({ color: 0xdd2222, flatShading: true });
        this.enemies.forEach((enemy) => {
            enemy.primitiveGroup = new THREE.Group();
            const primitiveMesh = new THREE.Mesh(enemyGeo, enemyMat);
            primitiveMesh.position.set(enemy.x, 0, enemy.z);
            primitiveMesh.castShadow = true;
            enemy.primitiveGroup.add(primitiveMesh);
            this.gameGroup.add(enemy.primitiveGroup);
            enemy.mesh = enemy.primitiveGroup;
        });

        // 3Dモデル読み込み後の差し替えタスク定義
        this.pendingReplacements = {
            traps: trapPlacements,
            blocks: attackableBlockPlacements,
            rocks: boundaryRockPlacements,
            palms: boundaryPalmPlacements
        };
    }

    loadModels() {
        if (!this.gltfLoader) return;

        const mapData = this.mapManager.mapData;
        const mapMeshes = this.mapManager.mapMeshes;

        // Gimmick: トラップ (Prop_Bomb)
        if (this.pendingReplacements.traps.length > 0) {
            this.gltfLoader.load('../models/Prop_Bomb.gltf', (gltf) => {
                const base = Utils.prepareLoadedModel(gltf.scene, { scale: 0.8, y: 0, rotationY: 0 });
                Utils.normalizeAndCenterModel(base);

                this.pendingReplacements.traps.forEach(({ x, z, fallback }) => {
                    const clone = base.clone(true);
                    Utils.cloneObjectMaterials(clone);
                    clone.position.set(x, 0, z);
                    if (fallback) this.gameGroup.remove(fallback);
                    this.gameGroup.add(clone);
                    mapMeshes[x][z] = clone;
                });
            }, undefined, (err) => console.error('Prop_Bomb 読み込み失敗:', err));
        }

        // Gimmick: 攻撃可能ブロック (Prop_Barrel)
        if (this.pendingReplacements.blocks.length > 0) {
            this.gltfLoader.load('../models/Prop_Barrel.gltf', (gltf) => {
                const base = Utils.prepareLoadedModel(gltf.scene, { scale: 1.0, y: 0, rotationY: 0 });
                Utils.normalizeAndCenterModel(base);

                this.pendingReplacements.blocks.forEach(({ x, z, fallback }) => {
                    const clone = base.clone(true);
                    Utils.cloneObjectMaterials(clone);
                    Utils.markAsPlayerOccluder(clone);
                    clone.position.set(x, 0, z);
                    if (fallback) this.gameGroup.remove(fallback);
                    this.gameGroup.add(clone);
                    mapMeshes[x][z] = clone;
                });
            }, undefined, (err) => console.error('Prop_Barrel 読み込み失敗:', err));
        }

        // Environment: 岩
        for (let i = 1; i <= 5; i++) {
            const targets = this.pendingReplacements.rocks.filter((p) => p.variant === i);
            if (targets.length === 0) continue;

            this.gltfLoader.load(`../models/Environment_Rock_${i}.gltf`, (gltf) => {
                const base = Utils.prepareLoadedModel(gltf.scene, { scale: 1.0, y: 0, rotationY: 0 });
                Utils.normalizeAndCenterModel(base);

                targets.forEach(({ x, z, fallback }) => {
                    const clone = base.clone(true);
                    Utils.cloneObjectMaterials(clone);
                    Utils.markAsPlayerOccluder(clone);
                    clone.position.set(x, 0, z);
                    clone.rotation.y = Math.random() * Math.PI * 2;
                    if (fallback) this.gameGroup.remove(fallback);
                    this.gameGroup.add(clone);
                });
            }, undefined, (err) => console.error(`Environment_Rock_${i} 読み込み失敗:`, err));
        }

        // Environment: ヤシの木
        for (let i = 1; i <= 3; i++) {
            const targets = this.pendingReplacements.palms.filter((p) => p.variant === i);
            if (targets.length === 0) continue;

            this.gltfLoader.load(`../models/Environment_PalmTree_${i}.gltf`, (gltf) => {
                const base = Utils.prepareLoadedModel(gltf.scene, { scale: 1.0, y: 0, rotationY: 0 });
                Utils.normalizeAndCenterModel(base);

                targets.forEach(({ x, z, fallback }) => {
                    const clone = base.clone(true);
                    Utils.cloneObjectMaterials(clone);
                    Utils.markAsPlayerOccluder(clone);
                    clone.position.set(x, 0, z);
                    clone.rotation.y = Math.random() * Math.PI * 2;
                    if (fallback) this.gameGroup.remove(fallback);
                    this.gameGroup.add(clone);
                });
            }, undefined, (err) => console.error(`Environment_PalmTree_${i} 読み込み失敗:`, err));
        }

        // 大型船
        this.gltfLoader.load('../models/Ship_Large.gltf', (gltf) => {
            const ship = Utils.prepareLoadedModel(gltf.scene, { scale: 1.0, y: 0, rotationY: 0 });
            Utils.normalizeAndCenterModel(ship);
            Utils.cloneObjectMaterials(ship);

            const shipX = this.goal.x + 2;
            const shipZ = this.goal.z + 2;
            ship.position.set(shipX, -0.14, shipZ);

            const toGoalX = this.goal.x - shipX;
            const toGoalZ = this.goal.z - shipZ;
            ship.rotation.y = Math.atan2(toGoalX, toGoalZ);

            this.gameGroup.add(ship);
        }, undefined, (err) => console.error('Ship_Large 読み込み失敗:', err));

        // プレイヤーモデル
        this.gltfLoader.load('../models/Characters_Anne.gltf', (gltf) => {
            const model = Utils.prepareLoadedModel(gltf.scene, { scale: 0.6, y: 0.0, rotationY: 0 });
            Utils.normalizeAndCenterModel(model);

            while (this.playerGroup.children.length > 0) {
                this.playerGroup.remove(this.playerGroup.children[0]);
            }
            this.playerGroup.add(model);

            if (gltf.animations && gltf.animations.length > 0) {
                this.player.mixer = new THREE.AnimationMixer(model);
                gltf.animations.forEach((clip) => {
                    this.player.animations[clip.name] = this.player.mixer.clipAction(clip);
                });
                this.player.playAnimation('Idle');
            }
        }, undefined, (err) => console.error('Anneモデル読み込み失敗:', err));

        // 敵モデル
        this.gltfLoader.load('../models/Characters_Skeleton.gltf', (gltf) => {
            const baseModel = Utils.prepareLoadedModel(gltf.scene, { scale: 0.7, y: 0, rotationY: Math.PI / 2 });

            this.enemies.forEach((enemy) => {
                let enemyModel;
                if (typeof THREE !== 'undefined' && THREE.SkeletonUtils && THREE.SkeletonUtils.clone) {
                    enemyModel = THREE.SkeletonUtils.clone(baseModel);
                } else {
                    console.warn('THREE.SkeletonUtils 非対応。通常の clone() を試みます。');
                    enemyModel = baseModel.clone();
                }

                // 敵個別のマテリアルクローン
                Utils.cloneObjectMaterials(enemyModel);

                enemyModel.position.set(enemy.x, 0, enemy.z);
                enemyModel.rotation.set(0, Math.PI / 2, 0);

                if (enemy.primitiveGroup) {
                    this.gameGroup.remove(enemy.primitiveGroup);
                    enemy.primitiveGroup = null;
                }

                enemy.mesh = enemyModel;
                this.gameGroup.add(enemyModel);

                if (gltf.animations && gltf.animations.length > 0) {
                    enemy.mixer = new THREE.AnimationMixer(enemyModel);
                    gltf.animations.forEach((clip) => {
                        enemy.animations[clip.name] = enemy.mixer.clipAction(clip);
                    });
                    enemy.playAnimation('Idle');
                }
            });
        }, undefined, (err) => console.error('Skeletonモデル読み込み失敗:', err));
    }

    // --- ゲームUIと状態変化管理 ---
    updateUI() {
        document.getElementById('hp-text').innerText = `${this.player.hp} / ${this.player.maxHp}`;
        const hpPercent = (this.player.hp / this.player.maxHp) * 100;
        document.getElementById('hp-bar').style.width = `${Math.max(0, hpPercent)}%`;

        const scoreText = document.getElementById('score-text');
        if (scoreText) scoreText.innerText = `${this.score}`;
    }

    addScore(points) {
        if (points <= 0) return;
        this.score += points;
        this.updateUI();
    }

    updateOverlayVisibility() {
        const hide = this.hasMovedOnce || this.player.isMoving;
        const status = document.getElementById('status-ui') || document.getElementById('status-container');
        const guide = document.getElementById('guide-ui') || document.getElementById('ui');
        const commit = document.getElementById('commit-info');
        if (status) status.classList.toggle('hidden-overlay', hide);
        if (guide) guide.classList.toggle('hidden-overlay', hide);
        if (commit) commit.classList.toggle('hidden-overlay', hide);
    }

    handleGameOver(message) {
        if (this.isGameOverProcessing) return;
        this.isGameOverProcessing = true;

        const panel = document.getElementById('gameover-score');
        const value = document.getElementById('gameover-score-value');
        if (panel && value) {
            value.innerText = `${this.score}`;
            panel.classList.remove('hidden-overlay');
        }

        if (message) console.log(message);

        setTimeout(() => {
            this.stage = 1;
            this.player.hp = this.player.maxHp;
            this.score = 0;
            if (panel) panel.classList.add('hidden-overlay');
            this.updateUI();
            this.initStage();
            this.isGameOverProcessing = false;
        }, 1400);
    }

    // --- ゲームアクション・進行制御 ---
    executeGridMove(moveStep) {
        if (this.player.isMoving || this.player.hp <= 0) return;

        const nextX = this.player.x + this.player.dirX * moveStep;
        const nextZ = this.player.z + this.player.dirZ * moveStep;
        const mapData = this.mapManager.mapData;

        if (!mapData[nextX] || mapData[nextX][nextZ] === 1) return;

        if (this.isEnemyAt(nextX, nextZ)) {
            this.handleBlockedByEnemy(this.player.dirX * moveStep, this.player.dirZ * moveStep);
            return;
        }

        // 隣接敵がいる場合の攻撃無効化チェック
        const hadAdjacent = this.enemies.some((e) => {
            if (e.isDying || e.isFlashing) return false;
            return (Math.abs(e.x - this.player.x) + Math.abs(e.z - this.player.z)) === 1;
        });
        this.suppressEnemyAttackThisTurn = hadAdjacent;

        this.player.prevX = this.player.x;
        this.player.prevZ = this.player.z;
        this.player.targetX = nextX;
        this.player.targetZ = nextZ;
        this.player.isMoving = true;
        this.player.playAnimation('Run');
        this.hasMovedOnce = true;
        
        this.updateOverlayVisibility();
        this.moveEnemies();

        if (this.resolveHeadOnClash()) return;
    }

    executeJump() {
        if (this.player.isMoving || this.player.hp <= 0) return;

        const landX = this.player.x + this.player.dirX * 2;
        const landZ = this.player.z + this.player.dirZ * 2;
        const mapData = this.mapManager.mapData;

        if (!mapData[landX] || mapData[landX][landZ] === 1) return;

        if (this.isEnemyAt(landX, landZ)) {
            this.handleBlockedByEnemy(this.player.dirX, this.player.dirZ);
            return;
        }

        const hadAdjacent = this.enemies.some((e) => {
            if (e.isDying || e.isFlashing) return false;
            return (Math.abs(e.x - this.player.x) + Math.abs(e.z - this.player.z)) === 1;
        });
        this.suppressEnemyAttackThisTurn = hadAdjacent;

        this.player.prevX = this.player.x;
        this.player.prevZ = this.player.z;
        this.player.targetX = landX;
        this.player.targetZ = landZ;
        this.player.isMoving = true;
        this.player.isJumping = true;
        this.player.jumpTimer = 0;
        this.player.playAnimation('Run');
        this.hasMovedOnce = true;

        this.updateOverlayVisibility();
        this.moveEnemies();

        if (this.resolveHeadOnClash()) return;
    }

    executeAttack() {
        if (this.player.isMoving || this.player.hp <= 0) return;

        const targetX = this.player.x + this.player.dirX;
        const targetZ = this.player.z + this.player.dirZ;

        this.player.playAnimation('Sword');
        const swordAction = this.player.animations['Sword'];
        const duration = swordAction ? swordAction.getClip().duration * 1000 : 500;
        const halfDuration = duration / 2;

        setTimeout(() => {
            if (this.player.hp > 0) this.player.playAnimation('Idle');
        }, duration);

        const hitEnemy = this.enemies.find((e) => e.x === targetX && e.z === targetZ);
        if (hitEnemy) {
            hitEnemy.faceToward(this.player.x, this.player.z);
            hitEnemy.shouldActOnce = true;
            hitEnemy.skipCounterOnce = true;
            hitEnemy.targetX = hitEnemy.x;
            hitEnemy.targetZ = hitEnemy.z;

            // 刀身ヒットの中間タイミング
            setTimeout(() => {
                hitEnemy.flashDamage();
            }, halfDuration);

            // 攻撃による撃破シーケンス
            setTimeout(() => {
                const deadAction = hitEnemy.animations['Death'] || hitEnemy.animations['death'];
                if (hitEnemy.mixer && deadAction) {
                    hitEnemy.isDying = true;
                    deadAction.loop = THREE.LoopOnce;
                    deadAction.clampWhenFinished = true;
                    
                    hitEnemy.playAnimation(deadAction._clip.name);

                    const deadDuration = deadAction.getClip().duration * 1000;
                    setTimeout(() => {
                        this.addScore(CONFIG.SCORE_ENEMY);
                        this.respawnEnemy(hitEnemy);
                    }, deadDuration);
                } else {
                    this.addScore(CONFIG.SCORE_ENEMY);
                    this.respawnEnemy(hitEnemy);
                }
            }, halfDuration + 260 + 300);

            this.moveEnemies();
            return;
        }

        const mapData = this.mapManager.mapData;
        const mapMeshes = this.mapManager.mapMeshes;

        if (mapData[targetX] && (mapData[targetX][targetZ] === 1 || mapData[targetX][targetZ] === 2)) {
            if (targetX > 0 && targetX < this.mapSize - 1 && targetZ > 0 && targetZ < this.mapSize - 1) {
                const obstacle = mapMeshes[targetX][targetZ];
                if (obstacle) {
                    setTimeout(() => {
                        Utils.flashModelRed(obstacle, CONFIG.DAMAGE_FLASH_DURATION);
                    }, halfDuration);

                    setTimeout(() => {
                        const targetObstacle = mapMeshes[targetX][targetZ];
                        if (targetObstacle) {
                            const pos = new THREE.Vector3();
                            targetObstacle.getWorldPosition(pos);
                            this.gameGroup.remove(targetObstacle);
                            mapMeshes[targetX][targetZ] = null;
                            mapData[targetX][targetZ] = 0;
                            this.mapManager.createExplosion(pos);
                            this.moveEnemies();
                        }
                    }, halfDuration + CONFIG.DAMAGE_FLASH_DURATION);
                }
            }
        }
    }

    // --- 敵の行動・AI処理 ---
    moveEnemies() {
        this.enemyTurnId++;
        const currentTurn = this.enemyTurnId;
        const suppress = this.suppressEnemyAttackThisTurn;
        this.suppressEnemyAttackThisTurn = false;

        const resX = this.player.isMoving ? this.player.targetX : this.player.x;
        const resZ = this.player.isMoving ? this.player.targetZ : this.player.z;
        const mapData = this.mapManager.mapData;

        // 1) 敵の移動意思決定
        this.enemies.forEach((enemy) => {
            if (enemy.isDying || enemy.skipCounterOnce) return;

            const dx = Math.sign(this.player.x - enemy.x);
            const dz = Math.sign(this.player.z - enemy.z);
            const preferX = Math.abs(this.player.x - enemy.x) >= Math.abs(this.player.z - enemy.z);

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
                if (tx === this.goal.x && tz === this.goal.z) return false;
                if (tx === resX && tz === resZ) return false;
                if (tx === enemy.x && tz === enemy.z) return false;

                const occupied = this.enemies.some((e) => {
                    return e !== enemy && ((e.x === tx && e.z === tz) || (e.targetX === tx && e.targetZ === tz));
                });
                return !occupied;
            };

            const next = candidateMoves.find((m) => canMoveTo(m.x, m.z));
            if (next) {
                enemy.targetX = next.x;
                enemy.targetZ = next.z;
                enemy.isMoving = true;
                enemy.movedOnTurn = currentTurn;

                const mdx = next.x - enemy.x;
                const mdz = next.z - enemy.z;
                if (mdx !== 0 || mdz !== 0) {
                    enemy.targetAngle = Math.atan2(mdx, mdz);
                }
                enemy.playAnimation('Run');
            } else if (enemy.shouldActOnce) {
                enemy.shouldActOnce = false;
            }
        });

        // 2) 敵の攻撃意思決定
        this.enemies.forEach((enemy) => {
            if (suppress || enemy.isDying || enemy.isFlashing) return;
            if (enemy.movedOnTurn === currentTurn) return;

            const dist = Math.abs(enemy.x - this.player.x) + Math.abs(enemy.z - this.player.z);
            if (dist !== 1) return;

            if (enemy.skipCounterOnce) {
                enemy.skipCounterOnce = false;
                enemy.shouldActOnce = false;
                return;
            }

            if (!enemy.hasCountered) {
                enemy.hasCountered = true;
                enemy.faceToward(this.player.x, this.player.z);
                
                const action = enemy.playAnimation('Sword');
                if (action) {
                    const duration = action.getClip().duration * 1000;
                    setTimeout(() => {
                        if (!enemy.isDying && enemy.mesh) enemy.playAnimation('Idle');
                        enemy.hasCountered = false;
                    }, duration);
                }

                this.player.applyDamage(CONFIG.PLAYER_DAMAGE);
                this.reactToPlayerDamage();
                
                if (this.player.hp <= 0) {
                    this.handleGameOver("敵に敗北してしまった…");
                }
            }
        });

        // 3) キャンセルフラグの終端クリーンアップ
        this.enemies.forEach((enemy) => {
            if (enemy.skipCounterOnce) {
                enemy.skipCounterOnce = false;
                enemy.shouldActOnce = false;
            }
            if (enemy.shouldActOnce && !enemy.isMoving) {
                enemy.shouldActOnce = false;
            }
        });
    }

    // --- 衝突・ノックバック・リスポーン ---
    handleBlockedByEnemy(stepX, stepZ) {
        const knockbackX = this.player.x - stepX;
        const knockbackZ = this.player.z - stepZ;
        const mapData = this.mapManager.mapData;

        const canKnockback = mapData[knockbackX]
            && mapData[knockbackX][knockbackZ] !== 1
            && !this.isEnemyOccupied(knockbackX, knockbackZ)
            && !(knockbackX === this.player.x && knockbackZ === this.player.z);

        if (canKnockback) {
            this.player.prevX = knockbackX;
            this.player.prevZ = knockbackZ;
        }

        this.player.applyDamage(CONFIG.PLAYER_DAMAGE);
        this.reactToPlayerDamage();

        if (this.player.hp <= 0) {
            this.handleGameOver("敵に敗北してしまった…");
        }
    }

    resolveHeadOnClash() {
        const playerFromX = this.player.x;
        const playerFromZ = this.player.z;
        const playerToX = this.player.targetX;
        const playerToZ = this.player.targetZ;

        const clashEnemy = this.enemies.find((e) => {
            return e.targetX === playerFromX
                && e.targetZ === playerFromZ
                && e.x === playerToX
                && e.z === playerToZ;
        });

        if (!clashEnemy) return false;

        this.player.targetX = this.player.x;
        this.player.targetZ = this.player.z;
        this.player.isMoving = false;
        this.player.isJumping = false;
        this.player.jumpTimer = 0;
        if (this.playerGroup) this.playerGroup.position.set(this.player.x, 0, this.player.z);

        this.enemies.forEach((e) => {
            e.targetX = e.x;
            e.targetZ = e.z;
            e.isMoving = false;
        });

        clashEnemy.faceToward(this.player.x, this.player.z);
        const action = clashEnemy.playAnimation('Sword');
        if (action) {
            const duration = action.getClip().duration * 1000;
            setTimeout(() => {
                if (clashEnemy.mesh) clashEnemy.playAnimation('Idle');
            }, duration);
        }

        this.player.applyDamage(CONFIG.PLAYER_DAMAGE);
        this.reactToPlayerDamage();

        if (this.player.hp <= 0) {
            this.handleGameOver("敵に敗北してしまった…");
        }
        return true;
    }

    reactToPlayerDamage() {
        const canKnockback = this.mapManager.mapData[this.player.prevX]
            && this.mapManager.mapData[this.player.prevX][this.player.prevZ] !== 1
            && (this.player.prevX !== this.player.x || this.player.prevZ !== this.player.z);

        if (canKnockback) {
            this.player.targetX = this.player.prevX;
            this.player.targetZ = this.player.prevZ;
            this.player.isMoving = true;
            this.player.isJumping = false;
            this.player.jumpTimer = 0;
        }
    }

    findEnemyRespawnTile(excludeEnemy) {
        const candidates = [];
        const mapData = this.mapManager.mapData;

        for (let x = 1; x < this.mapSize - 1; x++) {
            for (let z = 1; z < this.mapSize - 1; z++) {
                if (mapData[x][z] !== 0) continue;
                if ((x === this.player.x && z === this.player.z) || (x === this.goal.x && z === this.goal.z)) continue;

                const manhattanDist = Math.abs(x - this.player.x) + Math.abs(z - this.player.z);
                if (manhattanDist < 3) continue;

                const occupied = this.enemies.some((e) => e !== excludeEnemy && e.x === x && e.z === z);
                if (!occupied) candidates.push({ x, z });
            }
        }
        return candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : null;
    }

    respawnEnemy(enemy) {
        if (!enemy) return;
        const tile = this.findEnemyRespawnTile(enemy);
        if (!tile) return;

        enemy.resetState(tile.x, tile.z);
    }

    isEnemyAt(x, z) {
        return this.enemies.some((e) => (e.x === x && e.z === z) || (e.targetX === x && e.targetZ === z));
    }

    isEnemyOccupied(x, z) {
        return this.enemies.some((e) => !e.isDying && e.x === x && e.z === z);
    }

    // --- タイル踏み込み時イベント ---
    handleTileEvents() {
        const mapData = this.mapManager.mapData;
        const itemMeshes = this.mapManager.itemMeshes;

        // アイテム獲得
        if (mapData[this.player.x][this.player.z] === 3) {
            this.player.heal(CONFIG.HEAL_AMOUNT);
            this.updateUI();
            this.gameGroup.remove(itemMeshes[this.player.x][this.player.z]);
            mapData[this.player.x][this.player.z] = 0;
        }

        // トラップ踏み
        if (mapData[this.player.x][this.player.z] === 2 && !this.mapManager.flashingTrapTiles.has(`${this.player.x},${this.player.z}`)) {
            const trapX = this.player.x;
            const trapZ = this.player.z;

            this.reactToPlayerDamage();
            this.player.applyDamage(CONFIG.TRAP_DAMAGE);
            this.mapManager.triggerTrapExplosion(trapX, trapZ);

            if (this.player.hp <= 0) {
                this.handleGameOver("罠にかかって倒れてしまった…");
                return;
            }
        }

        // 敵と同じセルに侵入
        this.enemies.forEach((enemy) => {
            if (enemy.x === this.player.x && enemy.z === this.player.z && !enemy.isDying && !enemy.isFlashing && enemy.movedOnTurn !== this.enemyTurnId) {
                this.player.applyDamage(CONFIG.PLAYER_DAMAGE);
                this.reactToPlayerDamage();

                const action = enemy.playAnimation('Sword');
                if (action) {
                    const duration = action.getClip().duration * 1000;
                    setTimeout(() => {
                        if (!enemy.isDying && enemy.mesh) enemy.playAnimation('Idle');
                    }, duration);
                }

                if (this.player.hp <= 0) {
                    this.handleGameOver("敵に敗北してしまった…");
                }
            }
        });

        // ゴール到達
        if (this.player.x === this.goal.x && this.player.z === this.goal.z) {
            alert(`島を制覇！ステージ ${this.stage} クリア。次の島へ。`);
            this.stage++;
            this.player.heal(CONFIG.HEAL_AMOUNT);
            this.initStage();
        }
    }

    removeStartUI() {
        const ui = document.getElementById('ui');
        if (ui) ui.remove();
    }

    // --- インプット・操作系 ---
    setupKeyboardControls() {
        window.addEventListener('keydown', (e) => {
            if (this.player.isMoving || this.player.hp <= 0) return;
            this.removeStartUI();

            if (e.key === ' ') { this.executeAttack(); return; }
            if (e.key === 'e' || e.key === 'E') { this.executeJump(); return; }

            if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
                this.player.targetAngle += Math.PI / 2;
                this.player.updateDirection();
                return;
            }
            if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
                this.player.targetAngle -= Math.PI / 2;
                this.player.updateDirection();
                return;
            }

            let step = 0;
            if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') step = 1;
            if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') step = -1;

            if (step !== 0) {
                this.executeGridMove(step);
            }
        });
    }

    setupTouchControls() {
        const btnAttack = document.getElementById('btn-attack');
        const btnJump = document.getElementById('btn-jump');
        const btnUp = document.getElementById('btn-up');
        const btnDown = document.getElementById('btn-down');
        const btnLeft = document.getElementById('btn-left');
        const btnRight = document.getElementById('btn-right');
        const joystickZone = document.getElementById('joystick-zone');

        if (!joystickZone) return;

        const canInput = () => !this.player.isMoving && this.player.hp > 0;

        const bindAction = (btn, action) => {
            if (!btn) return;
            const handler = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.removeStartUI();
                if (canInput()) action();
            };
            btn.addEventListener('touchstart', handler, { passive: false });
            btn.addEventListener('mousedown', handler);
        };

        bindAction(btnAttack, () => this.executeAttack());
        bindAction(btnJump, () => this.executeJump());

        const bindDirection = (btn, dir) => {
            if (!btn) return;
            const handlePress = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.removeStartUI();
                if (!canInput()) return;

                if (dir === 'up') {
                    if (!this.upButtonPressedTimer) {
                        this.executeGridMove(1);
                        this.upButtonPressedTimer = setInterval(() => {
                            if (canInput()) this.executeGridMove(1);
                        }, CONFIG.JOYSTICK_REPEAT_INTERVAL);
                    }
                }
                if (dir === 'down') this.executeGridMove(-1);
                if (dir === 'left') { this.player.targetAngle += Math.PI / 2; this.player.updateDirection(); }
                if (dir === 'right') { this.player.targetAngle -= Math.PI / 2; this.player.updateDirection(); }
            };

            const handleRelease = () => {
                if (dir === 'up' && this.upButtonPressedTimer) {
                    clearInterval(this.upButtonPressedTimer);
                    this.upButtonPressedTimer = null;
                }
            };

            btn.addEventListener('touchstart', handlePress, { passive: false });
            btn.addEventListener('touchend', handleRelease, { passive: false });
            btn.addEventListener('mousedown', handlePress);
            btn.addEventListener('mouseup', handleRelease);
        };

        bindDirection(btnUp, 'up');
        bindDirection(btnDown, 'down');
        bindDirection(btnLeft, 'left');
        bindDirection(btnRight, 'right');

        // nipplejs ジョイスティック構築
        const joystick = nipplejs.create({
            zone: joystickZone,
            size: 120,
            color: 'rgba(255,255,255,0.55)',
            multitouch: false,
            restOpacity: 0.8,
            mode: 'dynamic'
        });

        joystick.on('start', () => {
            this.joystickInput.active = true;
            this.startJoystickRepeat();
        });

        joystick.on('move', (evt, data) => {
            const x = data.vector.x;
            const y = data.vector.y;

            if (Math.abs(x) > Math.abs(y)) {
                this.joystickInput.turn = x > 0 ? -1 : 1;
                this.joystickInput.move = 0;
            } else {
                this.joystickInput.turn = 0;
                this.joystickInput.move = y < 0 ? 1 : y > 0 ? -1 : 0;
            }

            if (Math.abs(x) < 0.15 && Math.abs(y) < 0.15) {
                this.joystickInput.active = false;
                this.stopJoystickRepeat();
            }
        });

        joystick.on('end', () => {
            this.joystickInput.active = false;
            this.joystickInput.move = 0;
            this.joystickInput.turn = 0;
            this.stopJoystickRepeat();
        });
    }

    startJoystickRepeat() {
        this.stopJoystickRepeat();
        this.removeStartUI();
        this.applyJoystickInput();
        this.joystickRepeatTimer = setInterval(() => {
            if (this.joystickInput.active) {
                this.applyJoystickInput();
            }
        }, CONFIG.JOYSTICK_REPEAT_INTERVAL);
    }

    stopJoystickRepeat() {
        if (this.joystickRepeatTimer) {
            clearInterval(this.joystickRepeatTimer);
            this.joystickRepeatTimer = null;
        }
    }

    applyJoystickInput() {
        if (!this.joystickInput.active || this.player.isMoving || this.player.hp <= 0) return;

        if (this.joystickInput.turn !== 0) {
            this.player.targetAngle += this.joystickInput.turn * Math.PI / 2;
            this.player.updateDirection();
        }

        if (this.joystickInput.move !== 0) {
            this.executeGridMove(this.joystickInput.move);
        }
    }

    // --- カメラ・レンダリング・ループ処理 ---
    updateCameraImmediate() {
        const px = this.player.x;
        const pz = this.player.z;
        this.camera.position.set(px - this.player.dirX * 3.5, 4.5, pz - this.player.dirZ * 3.5);
        this.camera.lookAt(px + this.player.dirX * 3.0, 0.8, pz + this.player.dirZ * 3.0);
    }

    updateCameraLerp() {
        if (!this.playerGroup) return;

        const targetCamX = this.playerGroup.position.x - Math.sin(this.player.angle) * 3.5;
        const targetCamZ = this.playerGroup.position.z - Math.cos(this.player.angle) * 3.5;
        const targetCamY = 4.0;

        this.camera.position.x += (targetCamX - this.camera.position.x) * CONFIG.CAMERA_LERP_FACTOR;
        this.camera.position.z += (targetCamZ - this.camera.position.z) * CONFIG.CAMERA_LERP_FACTOR;
        this.camera.position.y += (targetCamY - this.camera.position.y) * CONFIG.CAMERA_LERP_FACTOR;

        const lookTargetX = this.playerGroup.position.x + Math.sin(this.player.angle) * 3.0;
        const lookTargetZ = this.playerGroup.position.z + Math.cos(this.player.angle) * 3.0;
        this.camera.lookAt(lookTargetX, 0.8, lookTargetZ);
    }

    updatePlayerOcclusionVisibility() {
        // 全遮蔽物の表示を一度リセット
        this.occludedOccluderMeshes.forEach((mesh) => { mesh.visible = true; });
        this.occludedOccluderMeshes.clear();

        if (!this.playerGroup) return;

        const playerPos = new THREE.Vector3();
        this.playerGroup.getWorldPosition(playerPos);
        const rayDir = playerPos.clone().sub(this.camera.position);
        const distance = rayDir.length();
        if (distance <= 0.001) return;

        this.occlusionRaycaster.set(this.camera.position, rayDir.normalize());
        this.occlusionRaycaster.far = Math.max(0.01, distance - 0.15);

        const hits = this.occlusionRaycaster.intersectObjects(this.gameGroup.children, true);
        hits.forEach((hit) => {
            const obj = hit.object;
            
            // プレイヤー自身の子オブジェクトは除外
            let cur = obj;
            let isPlayerChild = false;
            while (cur) {
                if (cur === this.playerGroup) { isPlayerChild = true; break; }
                cur = cur.parent;
            }
            if (isPlayerChild) return;

            if (!obj.userData.isPlayerOccluder) return;

            obj.visible = false;
            this.occludedOccluderMeshes.add(obj);
        });
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    setupGitInfo() {
        window.__GIT_INFO__ = {
            commit: 'c5c08ab-fix vkey',
            date: '2026-07-12 09:49'
        };

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
            .then((res) => (res.ok ? res.json() : null))
            .then(applyInfo)
            .catch(() => {
                const fallback = window.__GIT_INFO__;
                applyInfo(fallback);
            });
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        this.updateOverlayVisibility();

        const delta = this.playerClock.getDelta();

        // プレイヤーのアニメーション・回転・移動処理
        this.player.updateAnimation(delta);

        if (this.playerGroup) {
            this.player.angle += (this.player.targetAngle - this.player.angle) * 0.2;
            this.playerGroup.rotation.y = this.player.angle;
        }

        if (this.player.isMoving) {
            this.playerGroup.position.x += (this.player.targetX - this.playerGroup.position.x) * CONFIG.MOVE_SPEED;
            this.playerGroup.position.z += (this.player.targetZ - this.playerGroup.position.z) * CONFIG.MOVE_SPEED;

            if (this.player.isJumping) {
                this.player.jumpTimer += 0.08;
                this.player.visualY = Math.sin(Math.PI * this.player.jumpTimer) * 1.2;
                this.playerGroup.position.y = this.player.visualY;
                if (this.player.jumpTimer >= 1.0) {
                    this.player.isJumping = false;
                    this.playerGroup.position.y = 0;
                }
            }

            const reachedX = Math.abs(this.playerGroup.position.x - this.player.targetX) < 0.05;
            const reachedZ = Math.abs(this.playerGroup.position.z - this.player.targetZ) < 0.05;

            if (reachedX && reachedZ) {
                this.player.x = this.player.targetX;
                this.player.z = this.player.targetZ;
                this.playerGroup.position.set(this.player.x, 0, this.player.z);
                this.player.isMoving = false;
                this.player.isJumping = false;
                this.player.playAnimation('Idle');

                // 敵の移動完了の同期
                this.enemies.forEach((enemy) => {
                    enemy.x = enemy.targetX;
                    enemy.z = enemy.targetZ;
                    if (enemy.mesh) enemy.mesh.position.set(enemy.x, 0, enemy.z);
                    if (enemy.isMoving) {
                        enemy.isMoving = false;
                        enemy.playAnimation('Idle');
                    }
                });

                this.handleTileEvents();
            }
        }

        // 敵のアニメーション・移動・回転更新
        this.enemies.forEach((enemy) => {
            enemy.updateAnimation(delta);

            if (enemy.mesh && (this.player.isMoving || enemy.isMoving)) {
                enemy.mesh.position.x += (enemy.targetX - enemy.mesh.position.x) * CONFIG.MOVE_SPEED;
                enemy.mesh.position.z += (enemy.targetZ - enemy.mesh.position.z) * CONFIG.MOVE_SPEED;
                
                if (enemy.isMoving) {
                    enemy.mesh.position.y = 0.3 + Math.abs(Math.sin(this.playerGroup.position.x * 4)) * 0.1;
                } else {
                    enemy.mesh.position.y = 0;
                }

                enemy.angle += (enemy.targetAngle - enemy.angle) * 0.15;
                enemy.mesh.rotation.y = enemy.angle;

                const reachedEnemyX = Math.abs(enemy.mesh.position.x - enemy.targetX) < 0.05;
                const reachedEnemyZ = Math.abs(enemy.mesh.position.z - enemy.targetZ) < 0.05;

                if (enemy.isMoving && reachedEnemyX && reachedEnemyZ) {
                    enemy.x = enemy.targetX;
                    enemy.z = enemy.targetZ;
                    enemy.mesh.position.set(enemy.x, 0, enemy.z);
                    enemy.isMoving = false;
                    enemy.shouldActOnce = false;
                    enemy.playAnimation('Idle');
                }
            } else if (enemy.mesh) {
                enemy.mesh.position.y = 0;
            }
        });

        // カメラ更新
        this.updateCameraLerp();

        // ゴール & アイテムの回転演出
        if (this.goalMesh) this.goalMesh.rotation.y += 0.02;

        const itemMeshes = this.mapManager.itemMeshes;
        for (let x = 0; x < this.mapSize; x++) {
            for (let z = 0; z < this.mapSize; z++) {
                if (itemMeshes[x] && itemMeshes[x][z]) {
                    itemMeshes[x][z].position.y = 0.25 + Math.sin(Date.now() * 0.003 + x) * 0.05;
                    itemMeshes[x][z].rotation.y += 0.03;
                }
            }
        }

        this.updatePlayerOcclusionVisibility();
        this.mapManager.updateExplosions(delta);

        this.renderer.render(this.scene, this.camera);
    }
}

// --- ゲームエントリーポイント ---
(() => {
    if (typeof THREE !== 'undefined' && (!THREE.SkeletonUtils || !THREE.SkeletonUtils.clone)) {
        console.warn('THREE.SkeletonUtils が見つかりません。通常の clone() を使用します。');
    }

    const game = new Game();
    game.start();
})();