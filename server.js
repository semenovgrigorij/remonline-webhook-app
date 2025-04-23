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
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8026606898:AAEcpb8avNsTWe8ehwDVsAF-sKy3WiYKfwg";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "1316558920";
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "VSBpuxhNp0LJ5hwiN8FZ";
const AUTO_APPOINTMENT_STATUS_ID = 1642511; // ID статуса "Автозаказ" в Remonline
const IN_PROGRESS_STATUS_ID = 1642512; // Замените на ID статуса "В работе" в Remonline

// Настройки для WordPress
const WP_SITE_URL = process.env.WP_SITE_URL || "https://ваш-сайт.com"; // Укажите URL вашего сайта
const WP_API_USERNAME = process.env.WP_API_USERNAME || "admin"; // Имя пользователя WordPress с правами доступа к API
const WP_API_PASSWORD = process.env.WP_API_PASSWORD || "password"; // Пароль пользователя

// Поддержка JSON и x-www-form-urlencoded
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Проверка работоспособности
app.get("/", (req, res) => {
  res.status(200).send("✅ Вебхук для Remonline и Amelia работает!");
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
    const newStatusId = data.metadata.new.id;
    const oldStatusId = data.metadata.old.id;
    const orderId = data.metadata.order.id;
    
    // Получаем данные заказа из кеша
    const cachedData = orderCache.get(orderId) || {};
    
    // Проверяем, меняется ли статус с "Автозаказ" на "В работе"
    if (oldStatusId === AUTO_APPOINTMENT_STATUS_ID && newStatusId === IN_PROGRESS_STATUS_ID) {
      try {
        // Обновляем статус в Amelia
        const ameliaResult = await updateAmeliaStatus(orderId);
        console.log(`✅ Статус заказа ${orderId} обновлен в Amelia:`, ameliaResult);
        
        // Формируем сообщение для Telegram с информацией об обновлении
        return `🔄 *Статус заказа изменен с "Автозаказ" на "В работе" #${orderId}*\n` +
               `📝 Номер документа: \`${data.metadata.order.name}\`\n` +
               `👤 Клієнт: ${cachedData.client?.fullname || "Не вказано"}\n` +
               `🚗 Марка авто: ${cachedData.asset?.brand?.trim() || "Не вказано"}\n` +
               `✅ Статус в Amelia также обновлен`;
      } catch (error) {
        console.error(`❌ Ошибка при обновлении статуса в Amelia для заказа ${orderId}:`, error);
        return `⚠️ *Ошибка обновления статуса в Amelia #${orderId}*\n` +
               `📝 Номер документа: \`${data.metadata.order.name}\`\n` +
               `❌ Ошибка: ${error.message}`;
      }
    }
    
    // Если это другое изменение статуса или с другими статусами
    if (newStatusId === AUTO_APPOINTMENT_STATUS_ID) {
      return `🔄 *Автозапис із сайту #${orderId}*\n` +
             `📝 Номер документа: \`${data.metadata.order.name}\`\n` +
             `👤 Клієнт: ${cachedData.client?.fullname || "Не вказано"}\n` +
             `🚗 Марка авто: ${cachedData.asset?.brand?.trim() || "Не вказано"}`;
    }
    
    return null; // Пропускаем другие изменения статуса
  },
  "Order.Deleted": (data) => {
    return `🗑️ *Видалено замовлення #${data.metadata.order.id}*\n` +
           `📝 Номер документа: \`${data.metadata.order.name}\`\n` +
           `👨‍💼 Співробітник: ${data.employee?.full_name || "Невідомо"}`;
  },
};

/**
 * Функция для обновления статуса в Amelia через WordPress REST API
 * @param {string|number} remonlineOrderId - ID заказа в Remonline
 * @returns {Promise<Object>} - Результат операции
 */
async function updateAmeliaStatus(remonlineOrderId) {
  try {
    // 1. Получаем соответствующий ID заказа в Amelia
    const ameliaAppointmentId = await getAmeliaAppointmentId(remonlineOrderId);
    
    if (!ameliaAppointmentId) {
      throw new Error(`Не найден соответствующий заказ в Amelia для Remonline ID: ${remonlineOrderId}`);
    }
    
    // 2. Обновляем статус в Amelia
    // Используем WordPress API для обновления статуса
    const wpApiUrl = `${WP_SITE_URL}/wp-json/amelia/v1/appointments/${ameliaAppointmentId}/status`;
    
    // Base64 кодирование для Basic Auth
    const authToken = Buffer.from(`${WP_API_USERNAME}:${WP_API_PASSWORD}`).toString('base64');
    
    const response = await axios.post(wpApiUrl, {
      status: 'approved' // Используйте нужный статус в Amelia ('approved', 'pending', и т.д.)
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${authToken}`
      }
    });
    
    return response.data;
  } catch (error) {
    console.error('Ошибка при обновлении статуса в Amelia:', error);
    throw new Error(`Не удалось обновить статус в Amelia: ${error.message}`);
  }
}

/**
 * Функция для получения ID заказа в Amelia по ID заказа в Remonline
 * @param {string|number} remonlineOrderId - ID заказа в Remonline
 * @returns {Promise<string|number|null>} - ID заказа в Amelia или null
 */
async function getAmeliaAppointmentId(remonlineOrderId) {
  try {
    // Используем WordPress API для поиска связи между заказами
    const wpApiUrl = `${WP_SITE_URL}/wp-json/amelia-remonline/v1/mapping/${remonlineOrderId}`;
    
    // Base64 кодирование для Basic Auth
    const authToken = Buffer.from(`${WP_API_USERNAME}:${WP_API_PASSWORD}`).toString('base64');
    
    const response = await axios.get(wpApiUrl, {
      headers: {
        'Authorization': `Basic ${authToken}`
      }
    });
    
    if (response.data && response.data.ameliaAppointmentId) {
      return response.data.ameliaAppointmentId;
    }
    
    return null;
  } catch (error) {
    console.error('Ошибка при получении ID заказа Amelia:', error);
    return null;
  }
}

// Вебхук от Remonline
app.post("/webhook", async (req, res) => {
  console.log("Raw webhook data:", JSON.stringify(req.body, null, 2));
  try {
    const data = req.body;
    console.log("🔥 Получен запрос от Remonline:", data.event_name);

    // Проверка секретного ключа (если необходимо)
    const receivedSecret = req.headers['x-remonline-secret'] || '';
    if (WEBHOOK_SECRET && receivedSecret !== WEBHOOK_SECRET) {
      console.error("❌ Неверный секретный ключ");
      return res.status(403).send("Unauthorized");
    }

    const handler = eventHandlers[data.event_name];
    let message = null;

    if (handler) {
      message = await handler(data);
      
      // Если handler вернул null — пропускаем отправку уведомления
      if (message === null) {
        console.log("⏩ Пропуск отправки уведомления");
        return res.status(200).send("OK (уведомление не требуется)");
      }
    } else {
      message = `📦 Необработанное событие ${data.event_name}:\nID: ${data.id}`;
    }

    // Отправляем уведомление в Telegram
    if (message) {
      await sendTelegramMessageWithRetry(message);
    }
    
    res.status(200).send("OK");
  } catch (error) {
    console.error("❌ Ошибка обработки запроса:", error);
    res.status(200).send("Error handled"); // Возвращаем 200 чтобы Remonline не повторял запрос
  }
});

// Тестовая отправка
app.get("/send-test", async (req, res) => {
  try {
    // Тестовый ID заказа
    const testRemonlineOrderId = req.query.order_id || 999;
    // Создание тестовых данных для имитации изменения статуса
    const testData = {
      event_name: "Order.Status.Changed",
      metadata: {
        old: { id: AUTO_APPOINTMENT_STATUS_ID, name: "Автозаказ" },
        new: { id: IN_PROGRESS_STATUS_ID, name: "В работе" },
        order: { id: testRemonlineOrderId, name: `Тест-${testRemonlineOrderId}` },
        client: { fullname: "Иван Тестовый" },
        asset: { brand: "Toyota Test" }
      }
    };

    // Вызываем обработчик события изменения статуса
    const message = await eventHandlers["Order.Status.Changed"](testData);
    
    if (!message) {
      return res.status(200).send("Тестовое сообщение не отправлено: обработчик вернул null");
    }

    await sendTelegramMessageWithRetry(message);
    res.send("✅ Тестовая интеграция выполнена: " + message);
  } catch (error) {
    console.error("❌ Ошибка при тестировании интеграции:", error);
    res.status(500).send("Ошибка: " + error.message);
  }
});

// Тестовый эндпоинт для проверки интеграции с Amelia
app.get("/test-amelia-integration", async (req, res) => {
  try {
    // const remonlineOrderId = req.query.order_id;
    const remonlineOrderId = 53033169;
    if (!remonlineOrderId) {
      return res.status(400).send("Требуется параметр order_id");
    }
    
    const ameliaAppointmentId = await getAmeliaAppointmentId(remonlineOrderId);
    
    if (!ameliaAppointmentId) {
      return res.status(404).send(`Заказ Amelia не найден для Remonline ID: ${remonlineOrderId}`);
    }
    
    res.status(200).json({
      remonlineOrderId,
      ameliaAppointmentId,
      message: "Связь между заказами найдена"
    });
  } catch (error) {
    console.error("❌ Ошибка при тестировании интеграции с Amelia:", error);
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
  console.log(`📊 Интеграция Remonline-Amelia активирована`);
  console.log(`🔗 Вебхук URL: http://localhost:${PORT}/webhook`);
});