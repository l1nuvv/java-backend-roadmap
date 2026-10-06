export function createTransport(config, getSession) {
  async function request(
    path,
    body,
    authenticated = false,
    method = body === undefined ? "GET" : "POST",
  ) {
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 12000);
    try {
      const headers = {
        apikey: config.key,
        "Content-Type": "application/json",
      };
      if (authenticated)
        headers.Authorization = "Bearer " + getSession().access_token;
      const response = await fetch(config.url + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const raw = await response.text();
      if (raw.length > 2100000) throw Error("Слишком большой ответ облака");
      let data;
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        throw Error("Облако вернуло некорректный ответ");
      }
      if (!response.ok) {
        const error = Error(
          data.msg ||
            data.message ||
            data.error_description ||
            "Ошибка облака: HTTP " + response.status,
        );
        error.httpStatus = response.status;
        if (response.status === 404)
          error.message =
            "Облачное хранилище ещё не настроено. Обратись к владельцу сайта.";
        throw error;
      }
      return data;
    } catch (e) {
      if (e.name === "AbortError")
        throw Error(
          "Облако не ответило за 12 секунд. Локальные отметки сохранены.",
        );
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  return { request };
}
