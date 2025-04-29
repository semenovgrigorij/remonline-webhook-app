const orderCache = new Map(); // Хранит данные заказов
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
// const crypto = require("crypto");
require("dotenv").config();
const statusNames = {
  '1642511': 'Автозапис',
  '1342663': 'Новий',
  '1342652': 'Відмова'
};


// Конфигурация
// const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8026606898:AAEcpb8avNsTWe8ehwDVsAF-sKy3WiYKfwg";
// const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "1316558920";
// const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "VSBpuxhNp0LJ5hJwiN8FZ";
const AUTO_APPOINTMENT_STATUS_ID = 1642511; // ID статуса "Автозапис"
const IN_PROGRESS_STATUS_ID = 1342663; // ID статуса "Новый"
const WORDPRESS_URL = process.env.WORDPRESS_URL || "https://www.gcar.services"; 
const WORDPRESS_SECRET = process.env.WORDPRESS_SECRET || "dloc9vLhLZjLUjEgJru8"; // Секретный ключ для запросов к WordPress

const app = express();

// Поддержка JSON и x-www-form-urlencoded
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Проверка работоспособности
app.get("/", (req, res) => {
  res.status(200).send("✅ Вебхук для Remonline работает!");
});

// Функция для синхронизации статуса с Amelia
async function syncStatusWithAmelia(orderId, newStatusId) {
  try {
    // Валидация входных параметров
    if (!orderId || !newStatusId) {
      console.error(`❌ Ошибка: пустые параметры для синхронизации (orderId: ${orderId}, newStatusId: ${newStatusId})`);
      return false;
    }
    
    // Преобразуем к строке
    const orderIdStr = String(orderId);
    const newStatusIdStr = String(newStatusId);
    
    console.log(`🔄 Синхронизация заказа #${orderIdStr} со статусом ${newStatusIdStr} с Amelia`);
    
    // Сначала проверяем, есть ли такая запись в Amelia
    try {
      const checkResponse = await axios.get(`${WORDPRESS_URL}/wp-json/amelia-remonline/v1/check-appointment`, {
        params: {
          external_id: orderIdStr,
          secret: WORDPRESS_SECRET
        },
        timeout: 10000
      });
      
      // Проверяем ответ от API
      if (!checkResponse.data || typeof checkResponse.data.exists !== 'boolean') {
        console.error(`❌ Неверный формат ответа от API проверки записи:`, checkResponse.data);
        return false;
      }
      
      // Если записи нет, выводим сообщение и пропускаем обновление
      if (!checkResponse.data.exists) {
        console.log(`⚠️ Запись для заказа #${orderIdStr} не найдена в Amelia. Синхронизация пропущена.`);
        return false;
      }
    } catch (error) {
      console.error(`❌ Ошибка при проверке записи в Amelia:`, error.message);
      console.error(`Детали:`, {
        status: error.response?.status,
        data: error.response?.data
      });
      return false;
    }
    
    // Если запись существует, обновляем статус
    try {
      const response = await axios.post(`${WORDPRESS_URL}/wp-json/amelia-remonline/v1/update-status`, {
        orderId: orderIdStr,
        newStatusId: newStatusIdStr,
        secret: WORDPRESS_SECRET
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });
      
      // Проверяем ответ от API
      if (!response.data || response.data.success !== true) {
        console.error(`❌ Неверный формат ответа при обновлении статуса:`, response.data);
        return false;
      }
      
      console.log(`✅ Статус успешно обновлен в Amelia`, response.data);
      return true;
    } catch (error) {
      console.error(`❌ Ошибка при обновлении статуса в Amelia:`, error.message);
      console.error(`Детали:`, {
        status: error.response?.status,
        data: error.response?.data
      });
      return false;
    }
  } catch (error) {
    console.error(`❌ Неожиданная ошибка при синхронизации статуса:`, error);
    return false;
  }
}

// Функция для синхронизации даты/времени с Amelia

async function syncDateTimeWithAmelia(orderId, scheduledFor) {
  try {
    // Валидация входных параметров
    if (!orderId) {
      console.error(`❌ Ошибка: пустой ID заказа для синхронизации времени`);
      return false;
    }
    
    // Валидация времени
    if (!scheduledFor || isNaN(Number(scheduledFor))) {
      console.error(`❌ Ошибка: некорректное время для синхронизации (${scheduledFor})`);
      return false;
    }
    
    // Преобразуем к строке и числу соответственно
    const orderIdStr = String(orderId);
    const scheduledForNum = Number(scheduledFor);
    
    // Проверка на разумное значение времени (между 2020 и 2030 годами в миллисекундах)
    const minTime = new Date('2020-01-01').getTime();
    const maxTime = new Date('2030-12-31').getTime();
    
    if (scheduledForNum < minTime || scheduledForNum > maxTime) {
      console.error(`❌ Подозрительное значение времени: ${scheduledForNum} (${new Date(scheduledForNum).toISOString()})`);
      return false;
    }
    
    console.log(`🔄 Синхронизация времени заказа #${orderIdStr} (запланирован на ${new Date(scheduledForNum).toLocaleString()}) с Amelia`);
    
    // Сначала проверяем, есть ли такая запись в Amelia
    try {
      const checkResponse = await axios.get(`${WORDPRESS_URL}/wp-json/amelia-remonline/v1/check-appointment`, {
        params: {
          external_id: orderIdStr,
          secret: WORDPRESS_SECRET
        },
        timeout: 10000
      });
      
      // Проверяем ответ от API
      if (!checkResponse.data || typeof checkResponse.data.exists !== 'boolean') {
        console.error(`❌ Неверный формат ответа от API проверки записи:`, checkResponse.data);
        return false;
      }
      
      // Если записи нет, выводим сообщение и пропускаем обновление
      if (!checkResponse.data.exists) {
        console.log(`⚠️ Запись для заказа #${orderIdStr} не найдена в Amelia. Синхронизация времени пропущена.`);
        return false;
      }
    } catch (error) {
      console.error(`❌ Ошибка при проверке записи в Amelia:`, error.message);
      console.error(`Детали:`, {
        status: error.response?.status,
        data: error.response?.data
      });
      return false;
    }
    
    // Если запись существует, обновляем дату/время
    try {
      const response = await axios.post(`${WORDPRESS_URL}/wp-json/amelia-remonline/v1/update-datetime`, {
        orderId: orderIdStr,
        scheduledFor: scheduledForNum,
        secret: WORDPRESS_SECRET
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      });
      
      // Проверяем ответ от API
      if (!response.data || response.data.success !== true) {
        console.error(`❌ Неверный формат ответа при обновлении времени:`, response.data);
        return false;
      }
      
      console.log(`✅ Время успешно обновлено в Amelia`, response.data);
      return true;
    } catch (error) {
      console.error(`❌ Ошибка при обновлении времени в Amelia:`, error.message);
      console.error(`Детали:`, {
        status: error.response?.status,
        data: error.response?.data
      });
      return false;
    }
  } catch (error) {
    console.error(`❌ Неожиданная ошибка при синхронизации времени:`, error);
    return false;
  }
}

/**
 * Получает запланированное время заказа из Remonline API
 * @param {string} orderId ID заказа в Remonline
 * @param {string} token API токен Remonline
 * @returns {number|null} Время в миллисекундах или null
 */
async function getOrderScheduledTime(orderId, token) {
  try {
    // Проверка параметров
    if (!orderId || !token) {
      console.error(`❌ Не указан orderId или token для получения данных заказа`);
      return null;
    }

    console.log(`🔍 Получение данных заказа #${orderId} из Remonline...`);

    // Запрос деталей заказа через Remonline API
    const response = await axios.get(`https://api.remonline.app/order/${orderId}`, {
      params: {
        token: token
      },
      headers: {
        'Accept': 'application/json'
      },
      timeout: 10000
    });

    // Проверяем статус ответа и наличие данных
    if (response.status !== 200 || !response.data || !response.data.data) {
      console.error(`❌ Ошибка при получении данных заказа #${orderId}: ${response.status}`);
      return null;
    }

    const orderData = response.data.data;
    
    // Проверяем наличие поля scheduled_for
    if (!orderData.scheduled_for) {
      console.log(`ℹ️ У заказа #${orderId} не указано запланированное время`);
      return null;
    }

    console.log(`✅ Получено запланированное время для заказа #${orderId}: ${orderData.scheduled_for} (${new Date(orderData.scheduled_for).toLocaleString()})`);
    return orderData.scheduled_for;

  } catch (error) {
    console.error(`❌ Ошибка при получении данных заказа #${orderId}:`, error.message);
    if (error.response) {
      console.error(`Статус: ${error.response.status}, Данные:`, error.response.data);
    }
    return null;
  }
}

// Объект для обработки разных типов событий
const eventHandlers = {
  "Order.Created": async (data) => {
    // Сохраняем данные заказа в кеш
    orderCache.set(data.metadata.order.id, {
      client: data.metadata.client,
      asset: data.metadata.asset,
      scheduledFor: data.metadata.order.scheduled_for // Сохраняем время
    });
    return null; // Пропускаем уведомление при создании
  },
  "Order.Status.Changed": async (data) => {
  try {
    // Проверка необходимых данных
    if (!data || !data.metadata || !data.metadata.order) {
      console.error("❌ Ошибка: отсутствуют необходимые метаданные заказа");
      return "⚠️ *Ошибка обработки изменения статуса заказа*";
    }
    
    const orderId = String(data.metadata.order.id);
    const newStatusId = String(data.metadata.new.id);
    const oldStatusId = data.metadata.old ? String(data.metadata.old.id) : 'неизвестный';
    
    console.log(`⚡ Изменение статуса заказа #${orderId}: ${oldStatusId} (${statusNames[oldStatusId] || 'Неизвестный'}) -> ${newStatusId} (${statusNames[newStatusId] || 'Неизвестный'})`);
    
    // Получаем текущее запланированное время заказа из Remonline API
    const scheduledTime = await getOrderScheduledTime(orderId, data.metadata.order.token || api_token);
    
    let statusMessage = "";
    let timeUpdateResult = false;
    
    // Статус изменился на "Новий" (IN_PROGRESS_STATUS_ID = 1342663)
    if (newStatusId === String(IN_PROGRESS_STATUS_ID)) {
      // 1. Сначала обновляем статус
      const statusUpdateResult = await syncStatusWithAmelia(orderId, newStatusId);
      
      // 2. Затем, если у нас есть время - обновляем его
      if (scheduledTime) {
        console.log(`📅 У заказа #${orderId} установлено время: ${new Date(scheduledTime).toLocaleString()}`);
        timeUpdateResult = await syncDateTimeWithAmelia(orderId, scheduledTime);
        
        if (timeUpdateResult) {
          statusMessage = `🔄 *Заказ #${orderId} перешел в работу и обновлено время на ${new Date(scheduledTime).toLocaleString()}*`;
        } else {
          statusMessage = `🔄 *Заказ #${orderId} перешел в работу, но не удалось обновить время*`;
        }
      } else {
        statusMessage = `🔄 *Заказ #${orderId} перешел в работу*`;
      }
    } else {
      // Для других статусов просто обновляем статус
      await syncStatusWithAmelia(orderId, newStatusId);
      statusMessage = `🔄 *Статус заказа #${orderId} изменен на "${statusNames[newStatusId] || newStatusId}"*`;
    }
    
    return statusMessage;
  } catch (error) {
    console.error("❌ Ошибка при обработке изменения статуса:", error);
    return "⚠️ *Произошла ошибка при обработке изменения статуса заказа*";
  }
  },
  "Order.Deleted": (data) => {
    return (
      `🗑️ *Видалено замовлення #${data.metadata.order.id}*\n` +
      `📝 Номер документа: \`${data.metadata.order.name}\`\n` +
      `👨‍💼 Співробітник: ${data.employee?.full_name || "Невідомо"}`
    );
  },
  "Order.ScheduledTime.Changed": async (data) => {
  const orderId = data.metadata.order.id;
  const scheduledFor = data.metadata.new; // Новое время в миллисекундах
  
  console.log(`⚡ Изменение времени заказа #${orderId}: ${new Date(scheduledFor).toLocaleString()}`);
  
  // Синхронизируем с Amelia
  await syncDateTimeWithAmelia(orderId, scheduledFor);
  
  return `🕒 *Время заказа #${orderId} изменено на ${new Date(scheduledFor).toLocaleString()}*`;
  },
};

// Вебхук от Remonline
app.post("/webhook", async (req, res) => {
  console.log("⭐ WEBHOOK RECEIVED ⭐");
  console.log("Headers:", JSON.stringify(req.headers));
  console.log("Raw webhook data:", JSON.stringify(req.body, null, 2));
  try {
    const xSignature = req.headers['x-signature'] || req.body['x-signature'];
    if (xSignature) {
      console.log(`Получена подпись: ${xSignature}`);
      
    } else {
      console.log(`Предупреждение: запрос без подписи или ключа`);
    }

    const data = req.body;
    console.log("🔥 Получен запрос от Remonline:", data.event_name);

    const handler = eventHandlers[data.event_name];
    let message;
    
    if (handler) {
      message = await handler(data);
      
      // Если handler вернул null — пропускаем отправку в Telegram
      if (message === null) {
        console.log("⏩ Пропуск отправки сообщения в Telegram");
        return res.status(200).send("OK (notification skipped)");
      }
    } else {
      message = `📦 Событие ${data.event_name}:\nID: ${data.id}`;
    }

    // Если нужна отправка в Telegram
    // await sendTelegramMessageWithRetry(message);
    res.status(200).send("OK");
  } catch (error) {
    console.error("❌ Ошибка обработки запроса:", error);
    res.status(200).send("Error handled"); // Отвечаем 200 OK, чтобы Remonline не повторял запрос
  }
});

// Тестовый эндпоинт для проверки обработки Order.Status.Changed
app.get("/test-event", async (req, res) => {
  try {
    // Создаем тестовое событие изменения статуса
    const testEvent = {
      id: "test-event-" + Date.now(),
      event_name: "Order.Status.Changed",
      metadata: {
        order: {
          id: req.query.order_id || "53053147",
          name: "TEST_ORDER"
        },
        old: {
          id: 1642511, // Автозапис
          name: "Автозапис"
        },
        new: {
          id: 1342663, // Новий заказ
          name: "Новий"
        }
      },
      employee: {
        id: 268918,
        full_name: "Тестовый пользователь"
      }
    };
    
    // Обрабатываем событие
    console.log("🔥 Обработка тестового события Order.Status.Changed");
    const handler = eventHandlers["Order.Status.Changed"];
    if (handler) {
      const message = await handler(testEvent);
      res.send(`✅ Тестовое событие обработано успешно.\nСообщение: ${message || "Без уведомления"}`);
    } else {
      res.status(500).send("❌ Обработчик Order.Status.Changed не найден");
    }
  } catch (error) {
    console.error("❌ Ошибка при обработке тестового события:", error);
    res.status(500).send("Ошибка: " + error.message);
  }
});

// Тестовая отправка и проверка синхронизации
app.get("/test-sync", async (req, res) => {
  const orderId = req.query.order_id || 999;
  const newStatusId = req.query.status_id || IN_PROGRESS_STATUS_ID;
  
  try {
    const result = await syncStatusWithAmelia(orderId, newStatusId);
    if (result) {
      res.send(`✅ Тестовая синхронизация выполнена для заказа #${orderId}`);
    } else {
      res.status(500).send(`❌ Ошибка при тестовой синхронизации заказа #${orderId}`);
    }
  } catch (error) {
    console.error("❌ Ошибка при тестовой синхронизации:", error);
    res.status(500).send("Ошибка: " + error.message);
  }
});

// Тестовая синхронизация времени
app.get("/test-sync-time", async (req, res) => {
  const orderId = req.query.order_id || 999;
  const scheduledFor = req.query.time || Date.now(); // Текущее время по умолчанию
  
  try {
    const result = await syncDateTimeWithAmelia(orderId, scheduledFor);
    if (result) {
      res.send(`✅ Тестовая синхронизация времени выполнена для заказа #${orderId} (${new Date(parseInt(scheduledFor)).toLocaleString()})`);
    } else {
      res.status(500).send(`❌ Ошибка при тестовой синхронизации времени заказа #${orderId}`);
    }
  } catch (error) {
    console.error("❌ Ошибка при тестовой синхронизации времени:", error);
    res.status(500).send("Ошибка: " + error.message);
  }
});

app.get("/test-get-order", async (req, res) => {
  try {
    const orderId = req.query.order_id;
    if (!orderId) {
      return res.status(400).send("❌ Не указан параметр order_id");
    }
    
    const scheduledTime = await getOrderScheduledTime(orderId, api_token);
    
    if (scheduledTime) {
      res.send(`✅ Для заказа #${orderId} получено время: ${new Date(scheduledTime).toLocaleString()}`);
    } else {
      res.status(404).send(`⚠️ Не удалось получить время для заказа #${orderId}`);
    }
  } catch (error) {
    console.error("❌ Ошибка при тестировании получения заказа:", error);
    res.status(500).send("Ошибка: " + error.message);
  }
});

// Отправка в Telegram с повторными попытками
/* async function sendTelegramMessageWithRetry(text, retries = 3, delay = 2000) {
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
        timeout: 10000, 
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
      if (error.response?.status === 429) {
        const retryAfter = error.response.data?.parameters?.retry_after || 5;
        console.log(`⏳ Превышен лимит запросов, ожидаем ${retryAfter} секунд`);
        await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
      } else if (error.response?.status === 400) {
        if (error.response.data?.description?.includes("markdown")) {
          console.log("⚠️ Проблема с Markdown, отправляем без форматирования");
          payload.parse_mode = "";
        }
      } else if (attempt < retries) {
        console.log(`⏳ Повторная попытка через ${delay / 1000} секунд...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = delay * 1.5;
      }
    }
  }
  throw new Error(
    `Не удалось отправить сообщение после ${retries} попыток: ${lastError.message}`
  );
} */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});






