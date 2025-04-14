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

// Кеширование названий статусов (для примера)
const statusNamesCache = {};
statusNamesCache[AUTO_APPOINTMENT_STATUS_ID] = "Автозапис";

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
    console.log("ℹ️ Заказ создан, но статус ещё не 'Автозапис'. Пропускаем.");
    return null; // Не отправляем уведомление
},
"Order.Status.Changed": async (data) => {
    console.log("Старый статус:", data.metadata.old.id);
    console.log("Новый статус:", data.metadata.new.id);
    console.log("Client data:", JSON.stringify(data.metadata.client, null, 2));
    console.log("Asset data:", JSON.stringify(data.metadata.asset, null, 2));
    const newStatusId = data.metadata.new.id;
    
    // Проверяем, что новый статус = "Автозапис" (ID=1642511)
    if (newStatusId !== AUTO_APPOINTMENT_STATUS_ID) return null;

    // Формируем сообщение только для перевода в "Автозапис"
    const orderName = escapeMarkdown(data.metadata.order?.name || "Без назви");
    const clientName = escapeMarkdown(data.metadata.client?.fullname || "Не вказано");
    const assetName = escapeMarkdown(data.metadata.asset?.name?.trim() || "Не вказано");
    const employeeName = escapeMarkdown(data.employee?.full_name || "Невідомо");

    return `🔄 *Автозапис  #${data.metadata.order.id}*\n` +
           `📝 Назва: \`${orderName}\`\n` +
           `👤 Клієнт: ${clientName}\n` +
           `📱 Марка авто: ${assetName}\n` +
           `👨‍💼 Працівник: ${employeeName}`;
},
  "Order.Deleted": (data) => {
    return (
      `🗑️ *Удален заказ #${data.metadata.order.id}*\n` +
      `📝 Название: \`${data.metadata.order.name}\`\n` +
      `👨‍💼 Сотрудник: ${data.employee?.full_name || "Неизвестно"}`
    );
  },
  "Order.Manager.Changed": (data) => {
    const oldManager = data.metadata.old?.full_name || "Не назначен";
    const newManager = data.metadata.new?.full_name || "Не назначен";

    return (
      `👨‍💼 *Изменен менеджер заказа #${data.metadata.order.id}*\n` +
      `📝 Название: \`${data.metadata.order.name}\`\n` +
      `Менеджер: ${oldManager} ➡️ ${newManager}`
    );
  },
  "Order.Engineer.Changed": (data) => {
    const oldEngineer = data.metadata.old?.full_name || "Не назначен";
    const newEngineer = data.metadata.new?.full_name || "Не назначен";

    return (
      `🔧 *Изменен исполнитель заказа #${data.metadata.order.id}*\n` +
      `📝 Название: \`${data.metadata.order.name}\`\n` +
      `Исполнитель: ${oldEngineer} ➡️ ${newEngineer}`
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
        status: { id: 1642511 }, // ID статуса "Автозапис"
        order: { id: 999, name: "Тестовый заказ" },
        client: { fullname: "Иван Иванов" },
        asset: { name: "Toyota Camry" },
        employee: { full_name: "Менеджер Петров" }
      }
    };

    // Используем тот же обработчик, что и для реальных запросов
    const handler = eventHandlers["Order.Created"];
    const message = await handler(testData);

    if (!message) {
      return res.status(200).send("Тестовое сообщение не отправлено: статус не 'Автозапис'");
    }

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

// Получение названия статуса (заглушка, в реальном приложении - API запрос)
async function getStatusName(statusId) {
  // Проверяем кеш
  if (statusNamesCache[statusId]) {
    return statusNamesCache[statusId];
  }

  // В реальном приложении здесь будет API-запрос к Remonline для получения названия статуса
  // Для примера используем заглушки
  const statusNames = {
    1342663: "Новый",
    1642511: "В работе",
    3456789: "Готов к выдаче",
    4567890: "Выдан",
    5678901: "Отменен",
  };

  // Сохраняем в кеш
  statusNamesCache[statusId] = statusNames[statusId] || `ID: ${statusId}`;
  return statusNamesCache[statusId];
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




