(function (global) {
  class QuestManager {
    constructor({ state, eventBus, config } = {}) {
      this.state = state || new global.GameState();
      this.eventBus = eventBus || new global.EventBus();
      this.config = config || global.CASTLE_CONFIG || {};
      this.bindEvents();
    }

    bindEvents() {
      if (!this.eventBus) return;
      this.eventBus.on('orb.collected', (payload) => this.handleOrbCollected(payload));
      this.eventBus.on('gate.opened', () => this.handleGateOpened());
      this.eventBus.on('chest.opened', () => this.handleChestOpened());
    }

    handleOrbCollected(payload = {}) {
      const orbId = payload.orbId;
      if (!orbId) return this.state;

      const inventory = this.state.get('player.orbs', { sun: false, star: false, moon: false });
      inventory[orbId] = true;
      this.state.set('player.orbs', inventory);
      this.state.set('inventory.orbs', inventory);
      return this.state;
    }

    handleGateOpened() {
      this.state.set('world.gateOpened', true);
      this.state.set('world.currentArea', 'courtyard');
      return this.state;
    }

    handleChestOpened() {
      const collectedCount = Object.values(this.state.get('player.orbs', {})).filter(Boolean).length;
      if (collectedCount >= (this.config.quest?.requiredOrbCount || 3)) {
        this.state.set('mode', 'CLEAR');
      }
      return this.state;
    }

    getCurrentObjective() {
      const gateOpened = this.state.get('world.gateOpened', false);
      const orbState = this.state.get('player.orbs', { sun: false, star: false, moon: false });
      const collected = Object.values(orbState).filter(Boolean).length;

      if (!gateOpened) {
        return {
          locationName: '石の城：正門前',
          objectiveText: 'まずは正門の<b>鉄の門</b>を自分で開けて、中庭へ入ろう。'
        };
      }

      if (collected < (this.config.quest?.requiredOrbCount || 3)) {
        return {
          locationName: '石の城：花の中庭',
          objectiveText: '中央の噴水の前を見回して、<b>3つの宝玉</b>を探そう。'
        };
      }

      return {
        locationName: '石の城：秘宝の間',
        objectiveText: '光の宝玉がそろった！<b>宝箱</b>を開けて秘宝を手に入れよう。'
      };
    }

    syncUI(uiController) {
      const objective = this.getCurrentObjective();
      if (!uiController) return objective;
      uiController.updateObjective(objective.locationName, objective.objectiveText);
      return objective;
    }
  }

  global.QuestManager = QuestManager;
})(window);
