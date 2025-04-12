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
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "VSBpuxhNp0U5HywNSFZ";

app.use(bodyParser.json());

// Проверка работоспособности
app.get("/", (req, res) => {
  res.status(200).send("Вебхук для Remonline работает!");
});

// Обработчик вебхука
app.post("/webhook", async (req, res) => {
  try {
    // Проверка секретного ключа
    const incomingSecret = req.headers["x-secret-key"];
    if (incomingSecret !== WEBHOOK_SECRET) {
      console.warn("Неверный секретный ключ");
      return res.status(403).send("Forbidden");
    }

    console.log("Получен запрос:", {
      headers: req.headers,
      body: req.body,
    });
    const event = req.body;

    // Формирование сообщения
    let message = "";
    switch (event.event_type) {
      case "order_created":
        message = `🆕 Новый заказ: ${event.order_id}\nКлиент: ${event.client_name}`;
        break;
      case "order_status_changed":
        message = `🔄 Изменен статус заказа ${event.order_id}\nНовый статус: ${event.new_status}`;
        break;
      // Добавьте другие события по аналогии
    }

    if (message) {
      await sendTelegramMessage(message);
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("Ошибка обработки вебхука:", error);
    res.status(500).send("Internal Server Error");
  }
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
