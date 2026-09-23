(function (global) {
  const config = {
    player: {
      speed: 0.08,
      y: 1.6,
      spawn: { x: 0, z: 18 },
      orbit: { sun: 'sun', star: 'star', moon: 'moon' }
    },
    world: {
      boundary: {
        minX: -27,
        maxX: 27,
        minZ: -22,
        maxZ: 28
      },
      gate: {
        z: 18,
        width: 6,
        openAt: 14
      },
      interactableRadius: {
        gate: 4.2,
        fountain: 4.5,
        gin: 2.0,
        orb: 2.2,
        chest: 2.4
      }
    },
    ui: {
      objective: {
        location: '石の城：正門前',
        text: 'まずは正門の<b>鉄の門</b>を自分で開けて、中庭へ入ろう。'
      }
    },
    quest: {
      orbNames: {
        sun: '太陽の宝玉',
        star: '星の宝玉',
        moon: '月の宝玉'
      },
      requiredOrbCount: 3
    }
  };

  global.CASTLE_CONFIG = config;
})(window);
