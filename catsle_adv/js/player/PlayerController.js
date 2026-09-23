(function (global) {
  class PlayerController {
    constructor({ state, eventBus, config } = {}) {
      this.state = state || new global.GameState();
      this.eventBus = eventBus || new global.EventBus();
      this.config = config || global.CASTLE_CONFIG || {};
    }

    resetPlayer() {
      this.state.set('player', {
        x: 0,
        y: 1.6,
        z: 18,
        speed: this.config.player?.speed || 0.08,
        orbs: { sun: false, star: false, moon: false }
      });
    }

    update({ keys, mouseYaw, mousePitch, joystickVector, joystickActive, canMoveTo, camera }) {
      const playerState = this.state.get('player');
      let inputX = 0;
      let inputZ = 0;

      if (keys && keys.w) inputZ += 1;
      if (keys && keys.s) inputZ -= 1;
      if (keys && keys.a) inputX -= 1;
      if (keys && keys.d) inputX += 1;

      if (joystickActive && joystickVector) {
        inputX = joystickVector.x;
        inputZ = -joystickVector.y;
      }

      let nextYaw = mouseYaw;
      let nextPitch = mousePitch;

      if (keys && (keys.arrowleft || keys['arrowleft'])) nextYaw += 0.04;
      if (keys && (keys.arrowright || keys['arrowright'])) nextYaw -= 0.04;

      if (inputX !== 0 || inputZ !== 0) {
        if (camera) {
          const forward = new THREE.Vector3();
          const right = new THREE.Vector3();
          camera.getWorldDirection(forward);
          forward.y = 0;
          forward.normalize();
          right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

          const move = new THREE.Vector3();
          move.addScaledVector(forward, inputZ);
          move.addScaledVector(right, inputX);
          move.multiplyScalar(playerState.speed || this.config.player?.speed || 0.08);

          const nextX = playerState.x + move.x;
          const nextZ = playerState.z + move.z;
          if (canMoveTo(nextX, nextZ)) {
            playerState.x = nextX;
            playerState.z = nextZ;
          }
        }
      }

      return {
        mouseYaw: nextYaw,
        mousePitch: nextPitch,
        player: {
          x: playerState.x,
          y: playerState.y,
          z: playerState.z
        }
      };
    }
  }

  global.PlayerController = PlayerController;
})(window);
