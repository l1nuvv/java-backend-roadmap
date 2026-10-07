import { createApplication } from '../../src/app.js';
import { mount } from './interface.js';

// Preview-only namespace: never read or overwrite the published site's progress.
const prefix = 'distinct-preview:';
for (const name of ['getItem', 'setItem', 'removeItem']) {
  const native = Storage.prototype[name];
  Storage.prototype[name] = function (key, ...args) {
    return native.call(this, key.startsWith('javaRoadmap') ? prefix + key : key, ...args);
  };
}
try {
  const app = createApplication();
  document.getElementById('startup').remove();
  mount(app);
} catch (error) {
  document.getElementById('startup').textContent = 'Ошибка превью: ' + error.message;
  console.error(error);
}
