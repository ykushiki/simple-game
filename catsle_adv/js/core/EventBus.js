(function (global) {
  class EventBus {
    constructor() {
      this.listeners = {};
    }

    on(eventName, callback) {
      if (!this.listeners[eventName]) this.listeners[eventName] = [];
      this.listeners[eventName].push(callback);
      return () => this.off(eventName, callback);
    }

    off(eventName, callback) {
      if (!this.listeners[eventName]) return;
      this.listeners[eventName] = this.listeners[eventName].filter((listener) => listener !== callback);
    }

    emit(eventName, payload) {
      const callbacks = this.listeners[eventName] || [];
      callbacks.forEach((callback) => {
        try {
          callback(payload);
        } catch (error) {
          console.error(`EventBus error for ${eventName}:`, error);
        }
      });
    }
  }

  global.EventBus = EventBus;
})(window);
