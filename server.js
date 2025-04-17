const orderCache = new Map(); // Хранит данные заказов
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const crypto = require("crypto");
require("dotenv").config();

// Функция для экранирования спецсимволов Markdown
function escapeMarkdown(text) {
  if (!text) return text;
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

const app = express();

// Конфигурация
const TELEGRAM_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN ||
  "8026606898:AAEcpb8avNsTWe8ehwDVsAF-sKy3WiYKfwg";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "1316558920";
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "VSBpuxhNp0LJ5hJwiN8FZ";
const AUTO_APPOINTMENT_STATUS_ID = 1642511;

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

// Объект для обработки разных типов событий
const eventHandlers = {
"Order.Created": async (data) => {
    // Сохраняем данные заказа в кеш
    orderCache.set(data.metadata.order.id, {
        client: data.metadata.client,
        asset: data.metadata.asset
    });
    return null; // Пропускаем уведомление при создании
},
"Order.Status.Changed": async (data) => {
    if (data.metadata.new.id !== AUTO_APPOINTMENT_STATUS_ID) return null;
    
    const cachedData = orderCache.get(data.metadata.order.id) || {};
    
    return `🔄 *Автозапис із сайту #${data.metadata.order.id}*\n` +
           `📝 Номер документа: \`${data.metadata.order.name}\`\n` +
           `👤 Клієнт: ${cachedData.client?.fullname || "Не вказано"}\n` +
           `🚗 Марка авто: ${cachedData.asset?.brand?.trim() || "Не вказано"}`;
},
/* "Order.Status.Changed": async (data) => {
    const newStatusId = data.metadata.new.id;
    if (newStatusId !== AUTO_APPOINTMENT_STATUS_ID) return null;

    // Получаем данные из кеша
    const cachedData = orderCache.get(data.metadata.order.id) || {};
    
    return `🔄 *Автозапис із сайту #${data.metadata.order.id}*\n` +
           `📝 Номер документа: \`${data.metadata.order.name}\`\n` +
           `👤 Клієнт: ${cachedData.client?.fullname || "Не вказано"}\n` +
           `🚗 Марка авто: ${cachedData.asset?.name?.trim() || "Не вказано"}`;
}, */
  "Order.Deleted": (data) => {
    return (
      `🗑️ *Видалено замовлення #${data.metadata.order.id}*\n` +
      `📝 Номер документа: \`${data.metadata.order.name}\`\n` +
      `👨‍💼 Співробітник: ${data.employee?.full_name || "Невідомо"}`
    );
  },
};

// Вебхук от Remonline
app.post("/webhook", async (req, res) => {
  console.log("Raw webhook data:", JSON.stringify(req.body, null, 2));
  try {
    const data = req.body;
    console.log("🔥 Получен запрос от Remonline:", data.event_name);

    const handler = eventHandlers[data.event_name];
    let message;

    if (handler) {
      message = await handler(data);
      
      // Если handler вернул null (статус не "Автозапис") — пропускаем отправку
      if (message === null) {
        console.log("⏩ Пропуск отправки: статус не 'Автозапис'");
        return res.status(200).send("OK (не автозапись)");
      }
    } else {
      message = `📦 Событие ${data.event_name}:\nID: ${data.id}`;
    }

    await sendTelegramMessageWithRetry(message);
    res.status(200).send("OK");
  } catch (error) {
    console.error("❌ Ошибка обработки запроса:", error);
    res.status(200).send("Error handled");
  }
});

// Тестовая отправка
app.get("/send-test", async (req, res) => {
  const statusId = req.query.status_id || 1642511;
  try {
    // Создаем тестовые данные, имитирующие заказ со статусом "Автозапис"
    const testData = {
      event_name: "Order.Created",
      metadata: {
        // status: { id: 1642511 },
        order: { id: 999, name: "Тестовый заказ" },
        client: { fullname: "Иван Иванов" },
        asset: { brand: "Toyota Camry" },
        employee: { full_name: "Менеджер Петров" }
      }
    };

    // Используем тот же обработчик, что и для реальных запросов
    const handler = eventHandlers["Order.Created"];
    const message = await handler(testData);

    // if (!message) {
    //   return res.status(200).send("Тестовое сообщение не отправлено: статус не 'Автозапис'");
    // }

    await sendTelegramMessageWithRetry(message);
    res.send("✅ Тестовое сообщение отправлено: " + message);
  } catch (error) {
    console.error("❌ Ошибка при отправке тестового сообщения:", error);
    res.status(500).send("Ошибка: " + error.message);
  }
});

// Форматирование даты
function formatDate(isoDate) {
  try {
    const date = new Date(isoDate);
    return date.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch (e) {
    return isoDate; // В случае ошибки возвращаем исходную строку
  }
}

// Отправка в Telegram с повторными попытками
async function sendTelegramMessageWithRetry(text, retries = 3, delay = 2000) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  const payload = {
    chat_id: TELEGRAM_CHAT_ID,
    text,
    parse_mode: "Markdown",
    disable_web_page_preview: true,
  };

  console.log("Отправка в Telegram с параметрами:", {
    url,
    chat_id: TELEGRAM_CHAT_ID,
    textLength: text.length,
    botToken: TELEGRAM_TOKEN
      ? `${TELEGRAM_TOKEN.substring(0, 5)}...`
      : "отсутствует",
  });

  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.post(url, payload, {
        headers: { "Content-Type": "application/json" },
        timeout: 10000, // Увеличенный таймаут
      });

      console.log(`✅ Сообщение Telegram отправлено (попытка ${attempt}):`);
      return response.data;
    } catch (error) {
      lastError = error;
      console.error(
        `❌ Ошибка отправки в Telegram (попытка ${attempt}/${retries}):`,
        {
          status: error.response?.status,
          data: error.response?.data,
          message: error.message,
        }
      );

      // Обработка ошибок Telegram API
      if (error.response?.status === 429) {
        // Too Many Requests - увеличиваем задержку
        const retryAfter = error.response.data?.parameters?.retry_after || 5;
        console.log(`⏳ Превышен лимит запросов, ожидаем ${retryAfter} секунд`);
        await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
      } else if (error.response?.status === 400) {
        // Плохой запрос - проверяем ошибку
        if (error.response.data?.description?.includes("markdown")) {
          // Проблема с Markdown форматированием - повторяем без разметки
          console.log("⚠️ Проблема с Markdown, отправляем без форматирования");
          payload.parse_mode = "";
        }
      } else if (attempt < retries) {
        // Ожидаем перед следующей попыткой
        console.log(`⏳ Повторная попытка через ${delay / 1000} секунд...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        // Увеличиваем задержку для каждой следующей попытки
        delay = delay * 1.5;
      }
    }
  }

  // Если все попытки не удались
  throw new Error(
    `Не удалось отправить сообщение после ${retries} попыток: ${lastError.message}`
  );
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});




