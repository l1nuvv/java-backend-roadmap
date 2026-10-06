import "./styles.css";
import { createApplication } from "./app.js";
import { mountCloud } from "./cloud/controller.js";
try {
  const app = createApplication();
  document.getElementById("startup").remove();
  try {
    mountCloud(app);
  } catch {
    const button = document.createElement("button");
    button.className = "btn";
    button.textContent = "Облако недоступно";
    button.onclick = () =>
      alert(
        "Не удалось подключить облако. Локальные отметки работают. Обнови страницу.",
      );
    document.querySelector(".top-actions").append(button);
  }
} catch (error) {
  document.getElementById("startup").textContent =
    "Не удалось запустить приложение. Локальные записи не удалены. Обнови страницу или восстанови резервную копию.";
  console.error(error);
}
