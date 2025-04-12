const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
require("dotenv").config();

const app = express();

// Конфигурация (лучше хранить в .env)
const TELEGRAM_TOKEN =
  process.env.TELEGRAM_TOKEN ||
  "8026606898:AAEcpb8avNsTWe8ehwDVsAF-sKy3WiYKfwg";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "1316558920";
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "VSBpuxhNp0LJ5hJwiN8FZ";

app.use(bodyParser.json());

// Проверка работоспособности
app.get("/", (req, res) => {
  res.status(200).send("Вебхук для Remonline работает!");
});

// Обработчик вебхука
app.post("/webhook", (req, res) => {
  // Получаем ключ всеми возможными способами
  const incomingSecret =
    req.headers["x-secret-key"] ||
    req.headers["x-secret"] ||
    req.headers["secret-key"] ||
    req.headers["authorization"]?.replace("Bearer ", "");

  console.log("=== ПОЛНЫЕ ЗАГОЛОВКИ ===");
  console.log(req.headers);
  console.log("Извлеченный ключ:", incomingSecret);
  console.log("Ожидаемый ключ:", WEBHOOK_SECRET);

  if (!incomingSecret || incomingSecret !== WEBHOOK_SECRET) {
    console.warn("Ошибка: Ключи не совпадают или отсутствуют");
    return res.status(403).send("Forbidden");
  }

  console.log("Успешная проверка ключа. Тело запроса:", req.body);
  res.status(200).send("OK");
});

app.get("/test", (req, res) => {
  sendTelegramMessage("Тест от сервера")
    .then(() => res.send("Сообщение отправлено"))
    .catch((err) => res.status(500).send("Ошибка: " + err.message));
});

// Отправка сообщения в Telegram
async function sendTelegramMessage(text) {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
    await axios.post(url, {
      chat_id: TELEGRAM_CHAT_ID,
      text: text,
      parse_mode: "Markdown",
    });
    console.log("Сообщение отправлено в Telegram");
  } catch (error) {
    console.error(
      "Ошибка отправки в Telegram:",
      error.response?.data || error.message
    );
    throw error;
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
