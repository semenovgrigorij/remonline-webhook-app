const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const crypto = require("crypto");
require("dotenv").config();

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

let lastRequests = [];

app.get("/last-requests", (req, res) => {
  res.json(lastRequests.slice(-5)); // Покажет 5 последних запросов
});

// Обработчик вебхука
app.post("/webhook", async (req, res) => {
  try {
    // Проверка ключа (оставьте вашу реализацию)
    if (!secureCompare(req.headers["x-secret-key"], WEBHOOK_SECRET)) {
      return res.status(403).send("Forbidden");
    }

    // Анализ структуры данных Remonline
    const remonlineData = req.body;
    console.log(
      "Полные данные от Remonline:",
      JSON.stringify(remonlineData, null, 2)
    );

    let message;

    // Обработка создания заказа
    if (remonlineData.order && remonlineData.order.id) {
      message =
        `🆕 Новый заказ #${remonlineData.order.id}\n` +
        `Клиент: ${remonlineData.client?.name || "Не указан"}\n` +
        `Статус: ${remonlineData.order.status || "Новый"}`;
    }
    // Обработка изменения статуса
    else if (remonlineData.status_changed) {
      message =
        `🔄 Изменён статус заказа #${remonlineData.order_id}\n` +
        `Новый статус: ${remonlineData.new_status}`;
    }

    if (message) {
      await sendTelegramMessage(message);
      res.status(200).send("OK");
    } else {
      console.warn("Неизвестный формат данных:", remonlineData);
      res.status(200).send("Unhandled event type");
    }
  } catch (error) {
    console.error("Ошибка обработки:", error);
    res.status(500).send("Server Error");
  }
});

app.post("/webhook", (req, res) => {
  console.log("=== RAW DATA FROM REMONLINE ===");
  console.log(JSON.stringify(req.body, null, 2)); // Выведет полную структуру данных
  res.status(200).send("OK");
});

app.get("/send-test", async (req, res) => {
  try {
    console.log("=== ТЕСТОВАЯ ОТПРАВКА ===");

    const testMessage = "Тестовое сообщение в " + new Date().toISOString();
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;

    console.log("Используемые параметры:", {
      token: TELEGRAM_TOKEN,
      chatId: TELEGRAM_CHAT_ID,
      url: url,
    });

    const response = await axios.post(url, {
      chat_id: TELEGRAM_CHAT_ID,
      text: testMessage,
      parse_mode: "Markdown",
    });

    console.log("Успешный ответ Telegram:", response.data);
    res.send("Сообщение отправлено: " + testMessage);
  } catch (error) {
    console.error("Полная ошибка:", {
      message: error.message,
      response: error.response?.data,
      config: error.config,
    });
    res.status(500).send("Ошибка: " + error.message);
  }
});

// Отправка сообщения в Telegram
async function sendTelegramMessage(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  const data = {
    chat_id: Number(TELEGRAM_CHAT_ID), // Гарантированно число
    text: text,
    parse_mode: "Markdown",
  };

  console.log("Отправка в Telegram:", { url, data });

  try {
    const response = await axios.post(url, data, {
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 5000,
    });
    console.log("Успешно отправлено:", response.data);
    return response.data;
  } catch (error) {
    console.error("Ошибка Telegram API:", {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message,
    });
    throw error;
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
