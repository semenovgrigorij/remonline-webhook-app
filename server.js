// server.js
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const crypto = require("crypto");
require("dotenv").config();

const app = express();

// Конфигурация (лучше через .env)
const TELEGRAM_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN ||
  "8026606898:AAEcpb8avNsTWe8ehwDVsAF-sKy3WiYKfwg";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

// Поддержка JSON и x-www-form-urlencoded
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Проверка работоспособности
app.get("/", (req, res) => {
  res.status(200).send("✅ Вебхук для Remonline работает!");
});

// Хранилище последних запросов
let lastRequests = [];

app.get("/last-requests", (req, res) => {
  res.json(lastRequests.slice(-5));
});

// Вебхук от Remonline
app.post("/webhook", async (req, res) => {
  try {
    const signature = req.headers["x-signature"];

    console.log("Полученная подпись:", signature);
    console.log("Секретный ключ:", WEBHOOK_SECRET);

    // if (!secureCompare(signature, WEBHOOK_SECRET)) {
    //   console.warn("🚫 Неверный секретный ключ:", signature);
    //   return res.status(403).send("Forbidden");
    // }

    const data = req.body;
    console.log("🔥 Получен запрос от Remonline!");
    console.log(JSON.stringify(data, null, 2));

    // Добавление запроса в хранилище
    lastRequests.push(data);
    if (lastRequests.length > 10) lastRequests.shift();

    let message;

    if (data.event_name === "Order.Deleted") {
      message =
        `🗑️ Удален заказ #${data.metadata.order.id}\n` +
        `Название: ${data.metadata.order.name}\n` +
        `Сотрудник: ${data.employee?.full_name || "Неизвестно"}`;
    } else if (data.event_name === "Order.Created") {
      message =
        `🆕 Новый заказ #${data.metadata.order?.id}\n` +
        `Название: ${data.metadata.order?.name || "Без названия"}\n` +
        `Сотрудник: ${data.employee?.full_name || "Неизвестно"}`;
    } else {
      message =
        `📦 Событие ${data.event_name}:\n` +
        `ID: ${data.id}\n` +
        `Время: ${data.created_at}\n` +
        `Объект: ${data.context?.object_type} #${data.context?.object_id}`;
    }

    await sendTelegramMessage(message);
    res.status(200).send("OK");
  } catch (error) {
    console.error("❌ Ошибка обработки запроса:", error);
    res.status(500).send("Server Error");
  }
});

// Тестовая отправка
app.get("/send-test", async (req, res) => {
  try {
    const testMessage = "🧪 Тестовое сообщение в " + new Date().toISOString();
    await sendTelegramMessage(testMessage);
    res.send("Сообщение отправлено: " + testMessage);
  } catch (error) {
    console.error("❌ Ошибка при отправке тестового сообщения:", error);
    res.status(500).send("Ошибка: " + error.message);
  }
});

// Сравнение ключей безопасным способом
function secureCompare(a, b) {
  try {
    return crypto.timingSafeEqual(
      Buffer.from(a?.toString() || ""),
      Buffer.from(b?.toString() || "")
    );
  } catch {
    return false;
  }
}

// Отправка в Telegram
async function sendTelegramMessage(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  const payload = {
    chat_id: TELEGRAM_CHAT_ID,
    text,
    parse_mode: "Markdown",
  };

  console.log("Отправка в Telegram с параметрами:", {
    url,
    chat_id: TELEGRAM_CHAT_ID,
    textLength: text.length,
    botToken: TELEGRAM_TOKEN
      ? `${TELEGRAM_TOKEN.substring(0, 5)}...`
      : "отсутствует",
  });

  try {
    const response = await axios.post(url, payload);
    console.log("✅ Ответ от Telegram API:", response.data);
    return response.data;
  } catch (error) {
    console.error("❌ Ошибка отправки в Telegram:", {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message,
    });
    throw error;
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
