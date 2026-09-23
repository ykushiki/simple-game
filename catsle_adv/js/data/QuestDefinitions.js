(function (global) {
  const questDefinitions = [
    {
      id: 'open_gate',
      locationName: '石の城：正門前',
      objectiveText: 'まずは正門の<b>鉄の門</b>を自分で開けて、中庭へ入ろう。',
      predicate: (state) => !(state.get('world.gateOpened', false)),
      nextQuestId: 'collect_orbs'
    },
    {
      id: 'collect_orbs',
      locationName: '石の城：花の中庭',
      objectiveText: '中央の噴水の前を見回して、<b>3つの宝玉</b>を探そう。',
      predicate: (state) => {
        const orbs = state.get('player.orbs', { sun: false, star: false, moon: false });
        const collected = Object.values(orbs).filter(Boolean).length;
        return state.get('world.gateOpened', false) && collected < 3;
      },
      nextQuestId: 'open_chest'
    },
    {
      id: 'open_chest',
      locationName: '石の城：秘宝の間',
      objectiveText: '光の宝玉がそろった！<b>宝箱</b>を開けて秘宝を手に入れよう。',
      predicate: (state) => {
        const orbs = state.get('player.orbs', { sun: false, star: false, moon: false });
        const collected = Object.values(orbs).filter(Boolean).length;
        return collected >= 3;
      },
      nextQuestId: 'clear'
    }
  ];

  global.CASTLE_QUEST_DEFINITIONS = questDefinitions;
})(window);
