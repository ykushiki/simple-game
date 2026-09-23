(function (global) {
  const sceneDefinitions = {
    front_gate: {
      id: 'front_gate',
      name: '石の城：正門前',
      spawn: { x: 0, z: 18 },
      interactables: [
        { id: 'gate_front', type: 'gate', x: 0, z: 18, radius: 4.2 },
        { id: 'fountain_central', type: 'fountain', x: 0, z: 0, radius: 4.5 },
        { id: 'gin_companion', type: 'gin', x: 0.8, z: 15.5, radius: 2.0 },
        { id: 'orb_sun', type: 'orb', orbId: 'sun', x: -10, y: 0.8, z: 2, radius: 2.2 },
        { id: 'orb_star', type: 'orb', orbId: 'star', x: -12, y: 0.8, z: -10, radius: 2.2 },
        { id: 'orb_moon', type: 'orb', orbId: 'moon', x: 12, y: 0.8, z: -8, radius: 2.2 },
        { id: 'treasure_chest', type: 'chest', x: 0, y: 0, z: -12, radius: 2.4 }
      ]
    },
    courtyard: {
      id: 'courtyard',
      name: '石の城：花の中庭',
      spawn: { x: 0, z: 6 },
      interactables: [
        { id: 'fountain_central', type: 'fountain', x: 0, z: 0, radius: 4.5 },
        { id: 'gin_companion', type: 'gin', x: 0.8, z: 15.5, radius: 2.0 },
        { id: 'orb_sun', type: 'orb', orbId: 'sun', x: -10, y: 0.8, z: 2, radius: 2.2 },
        { id: 'orb_star', type: 'orb', orbId: 'star', x: -12, y: 0.8, z: -10, radius: 2.2 },
        { id: 'orb_moon', type: 'orb', orbId: 'moon', x: 12, y: 0.8, z: -8, radius: 2.2 },
        { id: 'treasure_chest', type: 'chest', x: 0, y: 0, z: -12, radius: 2.4 }
      ]
    }
  };

  global.CASTLE_SCENE_DEFINITIONS = sceneDefinitions;
})(window);
