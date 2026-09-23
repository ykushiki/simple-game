(function (global) {
  class UIController {
    constructor({ state, eventBus } = {}) {
      this.state = state || new global.GameState();
      this.eventBus = eventBus || new global.EventBus();
      this.locationNameEl = document.getElementById('location-name');
      this.objectiveTextEl = document.getElementById('objective-text');
      this.promptTextEl = document.getElementById('prompt-text');
      this.promptPanelEl = document.getElementById('interaction-prompt');
      this.storyDialogEl = document.getElementById('story-dialog');
    }

    updateObjective(locationName, objectiveText) {
      if (this.locationNameEl) this.locationNameEl.innerText = locationName;
      if (this.objectiveTextEl) this.objectiveTextEl.innerHTML = objectiveText;
      if (this.state) {
        this.state.set('ui.locationName', locationName);
        this.state.set('ui.objectiveText', objectiveText);
      }
    }

    setInteractionPrompt(text) {
      if (!this.promptTextEl) return;
      if (text) {
        this.promptTextEl.innerText = text;
        if (this.promptPanelEl) this.promptPanelEl.classList.remove('hidden');
      } else if (this.promptPanelEl) {
        this.promptPanelEl.classList.add('hidden');
      }
    }

    showDialog(speaker, content, iconClass = 'fa-paw') {
      const speakerEl = document.getElementById('dialog-speaker');
      const contentEl = document.getElementById('dialog-content');
      const iconBoxEl = document.getElementById('dialog-icon-box');
      if (speakerEl) speakerEl.innerText = speaker;
      if (contentEl) contentEl.innerHTML = content;
      if (iconBoxEl) iconBoxEl.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
      if (this.storyDialogEl) this.storyDialogEl.classList.remove('hidden');
    }
  }

  global.UIController = UIController;
})(window);
