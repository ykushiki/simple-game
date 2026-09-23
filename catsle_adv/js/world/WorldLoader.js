(function (global) {
  class WorldLoader {
    constructor({ state, eventBus, registry, config } = {}) {
      this.state = state || new global.GameState();
      this.eventBus = eventBus || new global.EventBus();
      this.registry = registry || new global.InteractableRegistry({ state: this.state, eventBus: this.eventBus, config: config || global.CASTLE_CONFIG });
      this.config = config || global.CASTLE_CONFIG || {};
    }

    reset() {
      this.registry.reset();
      this.state.set('world.gateOpened', false);
      this.state.set('world.gateOpening', false);
      this.state.set('world.gateOpenProgress', 0);
    }

    bindRegistry(interactiveObjects) {
      this.registry.reset();
      interactiveObjects.forEach((item) => this.registry.add(item));
      return this.registry;
    }

    createOrbDefinition(id, x, y, z, hexColor) {
      return {
        type: 'orb',
        orbId: id,
        x,
        y,
        z,
        radius: this.config.world?.interactableRadius?.orb || 2.2,
        color: hexColor,
        meshLabel: `orb-${id}`
      };
    }

    createChestDefinition(x, y, z) {
      return {
        type: 'chest',
        x,
        y,
        z,
        radius: this.config.world?.interactableRadius?.chest || 2.4
      };
    }

    createGateDefinition() {
      return {
        type: 'gate',
        x: 0,
        z: this.config.world?.gate?.z || 18,
        radius: this.config.world?.interactableRadius?.gate || 4.2
      };
    }

    createFountainDefinition() {
      return {
        type: 'fountain',
        x: 0,
        z: 0,
        radius: this.config.world?.interactableRadius?.fountain || 4.5
      };
    }

    createGinDefinition() {
      return {
        type: 'gin',
        x: 0.8,
        z: 15.5,
        radius: this.config.world?.interactableRadius?.gin || 2.0
      };
    }
  }

  global.WorldLoader = WorldLoader;
})(window);
