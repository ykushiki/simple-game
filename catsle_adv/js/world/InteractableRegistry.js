(function (global) {
  class InteractableRegistry {
    constructor({ state, config, eventBus } = {}) {
      this.state = state || new global.GameState();
      this.eventBus = eventBus || new global.EventBus();
      this.config = config || global.CASTLE_CONFIG || {};
      this.items = [];
    }

    reset() {
      this.items = [];
    }

    add(item) {
      this.items.push(item);
      return item;
    }

    findNearby(x, z, radiusOverride = 0) {
      let nearest = null;
      let nearestDistance = Infinity;

      this.items.forEach((item) => {
        const dist = Math.hypot(x - item.x, z - item.z);
        const threshold = radiusOverride || (item.radius || 2.2);
        if (dist <= threshold && dist < nearestDistance) {
          nearest = item;
          nearestDistance = dist;
        }
      });

      return nearest;
    }

    getPromptText(player, item) {
      if (!item) return '';

      if (item.type === 'gate') {
        return this.state.get('world.gateOpened', false) ? '門は開いている。中庭へ進もう' : '[E] 鉄の門を開ける';
      }

      if (item.type === 'fountain') {
        return '[E] 噴水の澄んだお水を飲む';
      }

      if (item.type === 'gin') {
        return '[E] ギンをなでる（ヒントを聞く）';
      }

      if (item.type === 'orb' && !player.orbs[item.orbId]) {
        const names = this.config.quest?.orbNames || { sun: '太陽の宝玉', star: '星の宝玉', moon: '月の宝玉' };
        return `[E] ${names[item.orbId]}を拾う`;
      }

      if (item.type === 'chest') {
        const count = Object.values(player.orbs || {}).filter(Boolean).length;
        return count === 3 ? '[E] 3つの宝玉で伝説の宝箱を開ける！' : `宝箱は封印されている (宝玉: ${count}/3)`;
      }

      return '';
    }
  }

  global.InteractableRegistry = InteractableRegistry;
})(window);
