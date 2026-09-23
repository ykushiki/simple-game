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

    getQuestDefinitions() {
      return global.CASTLE_QUEST_DEFINITIONS || [];
    }

    getCurrentQuestDefinition() {
      const definitions = this.getQuestDefinitions();
      return definitions.find((definition) => definition.predicate(this.state)) || definitions[0] || null;
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
      const definition = this.getCurrentQuestDefinition();
      if (!definition) {
        return {
          locationName: '石の城：正門前',
          objectiveText: 'まずは正門の<b>鉄の門</b>を自分で開けて、中庭へ入ろう。'
        };
      }

      return {
        locationName: definition.locationName,
        objectiveText: definition.objectiveText
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
