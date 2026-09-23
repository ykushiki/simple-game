(function (global) {
  class GameState {
    constructor(initialState = {}) {
      this.state = {
        mode: 'START',
        player: {
          x: 0,
          y: 1.6,
          z: 18,
          speed: 0.08,
          orbs: { sun: false, star: false, moon: false }
        },
        camera: {
          yaw: Math.PI,
          pitch: 0
        },
        world: {
          gateOpened: false,
          gateOpening: false,
          gateOpenProgress: 0,
          currentArea: 'front_gate'
        },
        ui: {
          locationName: '石の城：正門前',
          objectiveText: 'まずは正門の<b>鉄の門</b>を自分で開けて、中庭へ入ろう。'
        },
        inventory: {
          orbs: { sun: false, star: false, moon: false }
        },
        input: {
          keys: {},
          turnLeftHeld: false,
          turnRightHeld: false,
          joystickVector: { x: 0, y: 0 },
          joystickActive: false
        },
        progression: {
          currentQuest: null,
          completedQuests: []
        }
      };

      this.apply(initialState);
    }

    apply(partialState) {
      if (!partialState) return this.state;
      this.state = this.deepMerge(this.state, partialState);
      return this.state;
    }

    deepMerge(target, source) {
      const output = Array.isArray(target) ? [...target] : { ...target };
      for (const key of Object.keys(source || {})) {
        const value = source[key];
        if (value && typeof value === 'object' && !Array.isArray(value) && value !== null) {
          output[key] = this.deepMerge(output[key] || {}, value);
        } else {
          output[key] = value;
        }
      }
      return output;
    }

    get(path, fallback = undefined) {
      return path.split('.').reduce((value, key) => {
        if (value == null) return fallback;
        return value[key];
      }, this.state) ?? fallback;
    }

    set(path, value) {
      const keys = path.split('.');
      let current = this.state;
      for (let i = 0; i < keys.length - 1; i += 1) {
        if (!current[keys[i]] || typeof current[keys[i]] !== 'object') {
          current[keys[i]] = {};
        }
        current = current[keys[i]];
      }
      current[keys[keys.length - 1]] = value;
      return value;
    }

    reset() {
      this.state = {
        mode: 'START',
        player: {
          x: 0,
          y: 1.6,
          z: 18,
          speed: 0.08,
          orbs: { sun: false, star: false, moon: false }
        },
        camera: {
          yaw: Math.PI,
          pitch: 0
        },
        world: {
          gateOpened: false,
          gateOpening: false,
          gateOpenProgress: 0,
          currentArea: 'front_gate'
        },
        ui: {
          locationName: '石の城：正門前',
          objectiveText: 'まずは正門の<b>鉄の門</b>を自分で開けて、中庭へ入ろう。'
        },
        inventory: {
          orbs: { sun: false, star: false, moon: false }
        },
        input: {
          keys: {},
          turnLeftHeld: false,
          turnRightHeld: false,
          joystickVector: { x: 0, y: 0 },
          joystickActive: false
        },
        progression: {
          currentQuest: null,
          completedQuests: []
        }
      };
    }
  }

  global.GameState = GameState;
})(window);
