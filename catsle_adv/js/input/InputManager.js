(function (global) {
  class InputManager {
    constructor({ eventBus } = {}) {
      this.eventBus = eventBus || new global.EventBus();
      this.keys = {};
      this.turnLeftHeld = false;
      this.turnRightHeld = false;
      this.joystickVector = { x: 0, y: 0 };
      this.joystickActive = false;
      this.mouseLook = { yaw: 0, pitch: 0 };
      this.isBound = false;
    }

    bind(windowTarget) {
      if (this.isBound || !windowTarget) return;
      this.isBound = true;

      windowTarget.addEventListener('keydown', (event) => {
        const key = event.key.toLowerCase();
        this.keys[key] = true;

        if (key === 'e') {
          this.eventBus.emit('interaction:trigger');
        }
      });

      windowTarget.addEventListener('keyup', (event) => {
        const key = event.key.toLowerCase();
        this.keys[key] = false;
      });

      windowTarget.addEventListener('pointerup', () => {
        this.turnLeftHeld = false;
        this.turnRightHeld = false;
      });
    }

    setTurnButtonState(isLeft, pressed) {
      if (isLeft) this.turnLeftHeld = !!pressed;
      else this.turnRightHeld = !!pressed;
    }

    setJoystickVector(vector) {
      this.joystickVector = { x: vector.x || 0, y: vector.y || 0 };
      this.joystickActive = !!(Math.abs(vector.x) > 0.01 || Math.abs(vector.y) > 0.01);
    }

    snapshot() {
      return {
        keys: { ...this.keys },
        turnLeftHeld: this.turnLeftHeld,
        turnRightHeld: this.turnRightHeld,
        joystickVector: { ...this.joystickVector },
        joystickActive: this.joystickActive,
        mouseLook: { ...this.mouseLook }
      };
    }
  }

  global.InputManager = InputManager;
})(window);
