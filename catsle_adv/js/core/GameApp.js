(function (global) {
  class GameApp {
    constructor({ state, eventBus, inputManager, playerController, config } = {}) {
      this.state = state || new global.GameState();
      this.eventBus = eventBus || new global.EventBus();
      this.config = config || global.CASTLE_CONFIG || {};
      this.inputManager = inputManager || new global.InputManager({ eventBus: this.eventBus });
      this.playerController = playerController || new global.PlayerController({
        state: this.state,
        eventBus: this.eventBus,
        config: this.config
      });
      this.onTick = null;
    }

    bindWindow(target = window) {
      this.inputManager.bind(target);
      return this;
    }

    start({ onTick } = {}) {
      this.onTick = onTick || null;
      this.state.set('mode', 'PLAYING');
      return this;
    }

    updateFrame(frameInput = {}) {
      const inputSnapshot = this.inputManager.snapshot();
      const input = { ...inputSnapshot, ...frameInput };
      const camera = global.camera || null;
      const canMoveTo = global.canMoveTo || (() => true);

      const result = this.playerController.update({
        keys: input.keys,
        mouseYaw: this.state.get('camera.yaw', Math.PI),
        mousePitch: this.state.get('camera.pitch', 0),
        joystickVector: input.joystickVector,
        joystickActive: input.joystickActive,
        canMoveTo,
        camera
      });

      if (result) {
        this.state.set('camera.yaw', result.mouseYaw);
        this.state.set('camera.pitch', result.mousePitch);
        this.state.set('player.x', result.player.x);
        this.state.set('player.y', result.player.y);
        this.state.set('player.z', result.player.z);
      }

      if (this.onTick) this.onTick(result);
      return result;
    }
  }

  global.GameApp = GameApp;
})(window);
