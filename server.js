const orderCache = new Map(); // Хранит данные заказов
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
// const crypto = require("crypto");
require("dotenv").config();

// Конфигурация
// const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8026606898:AAEcpb8avNsTWe8ehwDVsAF-sKy3WiYKfwg";
// const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "1316558920";
// const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "VSBpuxhNp0LJ5hJwiN8FZ";

const WORDPRESS_URL = process.env.WORDPRESS_URL || ''; 
const WORDPRESS_SECRET = process.env.WORDPRESS_SECRET || ''; // Секретный ключ для запросов к WordPress
let api_token = process.env.REMONLINE_API_TOKEN || '';
let token_expiry = 0;

// Проверка конфигурации
if (!WORDPRESS_SECRET) {
  console.warn("⚠️ ПРЕДУПРЕЖДЕНИЕ: WORDPRESS_SECRET не настроен. API-запросы к WordPress могут не работать.");
}

if (!process.env.REMONLINE_API_KEY) {
  console.warn("⚠️ ПРЕДУПРЕЖДЕНИЕ: REMONLINE_API_KEY не настроен. Обновление токена не будет работать.");
}

const AUTO_APPOINTMENT_STATUS_ID = 1642511; // ID статуса "Автозапис"
const IN_PROGRESS_STATUS_ID = 1342663; // ID статуса "Новый"
const statusNames = {
  '1642511': 'Автозапис',
  '1342663': 'Новий',
  '1342652': 'Відмова'
};


const app = express();

console.log("🔧 Конфигурация API:");
console.log(`  - WORDPRESS_URL: ${WORDPRESS_URL}`);
console.log(`  - API Token: ${api_token ? 'установлен' : 'не установлен'}`);
console.log(`  - API Key: ${process.env.REMONLINE_API_KEY ? 'установлен' : 'не установлен'}`);
console.log(`  - Webhook Secret: ${WORDPRESS_SECRET ? 'установлен' : 'не установлен'}`);
/**
 * Обновляет токен Remonline API через локальный ключ API
 * @returns {string|null} Новый токен или null при ошибке
 */
async function updateRemonlineToken() {
  try {
    const api_key = process.env.REMONLINE_API_KEY;
    if (!api_key) {
      console.error("❌ API ключ Remonline не настроен в переменных окружения");
      return null;
    }

    console.log("🔄 Запрос на обновление токена Remonline через API");

    const response = await axios.post("https://api.remonline.app/token/new", {
      api_key: api_key
    }, {
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json'
      },
      timeout: 10000
    });

    if (response.status === 200 && response.data && response.data.token) {
      const newToken = response.data.token;
      console.log(`✅ Токен Remonline успешно обновлен (${newToken.substring(0, 5)}...)`);
      
      // Обновляем глобальные переменные
      api_token = newToken;
      token_expiry = Math.floor(Date.now() / 1000) + 24*3600;
      
      return newToken;
    } else {
      console.error("❌ Ошибка при обновлении токена: неверный формат ответа");
      return null;
    }
  } catch (error) {
    console.error("❌ Ошибка при обновлении токена:", error.message);
    if (error.response) {
      console.error(`Статус: ${error.response.status}, Данные:`, error.response.data);
    }
    return null;
  }
}

/**
 * Получает актуальный токен Remonline из WordPress
 */
async function getTokenFromWordPress() {
  try {
    console.log("🔄 Запрос актуального токена из WordPress");
    
    const response = await axios.get(`${WORDPRESS_URL}/wp-json/amelia-remonline/v1/get-token`, {
      params: {
        secret: WORDPRESS_SECRET
      },
      timeout: 10000
    });
    
    if (response.status === 200 && response.data && response.data.token) {
      console.log("✅ Получен актуальный токен Remonline из WordPress");
      return response.data.token;
    } else {
      console.error("❌ Ошибка при получении токена: неверный формат ответа");
      return null;
    }
  } catch (error) {
    console.error("❌ Ошибка при получении токена из WordPress:", error.message);
    return null;
  }
}

/**
 * Получает актуальный API токен Remonline
 * @returns {string|null} API токен или null при ошибке
 */
async function getApiToken() {
  try {
    // Проверяем, есть ли у нас действительный кэшированный токен
    const now = Math.floor(Date.now() / 1000);
    if (api_token && token_expiry > now + 300) { // действителен еще минимум 5 минут
      console.log(`📋 Используем кэшированный токен Remonline (${api_token.substring(0, 5)}...)`);
      return api_token;
    }
    
    // Пытаемся получить токен из WordPress
    console.log(`🔄 Запрос токена из WordPress`);
    
    try {
      const response = await axios.get(`${WORDPRESS_URL}/wp-json/amelia-remonline/v1/get-token`, {
        params: {
          secret: WORDPRESS_SECRET
        },
        timeout: 10000
      });
      
      if (response.status === 200 && response.data && response.data.token) {
        api_token = response.data.token;
        token_expiry = response.data.expires || (now + 24*3600);
        console.log(`✅ Получен токен из WordPress (${api_token.substring(0, 5)}...), действителен до ${new Date(token_expiry * 1000).toLocaleString()}`);
        return api_token;
      }
    } catch (wpError) {
      console.error(`⚠️ Не удалось получить токен из WordPress:`, wpError.message);
      // Продолжаем выполнение и попробуем обновить токен локально
    }
    
    // Если не удалось получить из WordPress, обновляем локально
    console.log(`🔄 Локальное обновление токена Remonline`);
    const newToken = await updateRemonlineToken();
    
    if (newToken) {
      api_token = newToken;
      token_expiry = now + 24*3600; // Устанавливаем срок действия на 24 часа
      console.log(`✅ Токен обновлен локально (${api_token.substring(0, 5)}...), действителен до ${new Date(token_expiry * 1000).toLocaleString()}`);
      return api_token;
    }
    
    console.error(`❌ Не удалось получить или обновить токен Remonline`);
    return null;
  } catch (error) {
    console.error(`❌ Ошибка при получении API токена:`, error.message);
    return null;
  }
}


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
 * @param {string} [providedToken=null] API токен Remonline (опционально)
 * @returns {number|null} Время в миллисекундах или null
 */
async function getOrderScheduledTime(orderId, providedToken = null) {
  try {
    // Проверка параметров
    if (!orderId) {
      console.error(`❌ Не указан orderId для получения данных заказа`);
      return null;
    }

    // Используем предоставленный токен или пытаемся получить актуальный
    const token = providedToken || api_token;
    
    if (!token) {
      console.error(`❌ Отсутствует API токен Remonline`);
      return null;
    }

    console.log(`🔍 Получение данных заказа #${orderId} из Remonline (токен: ${token.substring(0, 5)}...)`);

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
    // Обработка ошибки авторизации
    if (error.response && error.response.status === 401) {
      console.log("🔄 Токен недействителен, пробуем обновить и повторить запрос");
      
      // Обновляем токен только если не был предоставлен внешний токен
      if (!providedToken) {
        // Пытаемся получить токен из WordPress или обновить локально
        const newToken = await getApiToken();
        if (newToken) {
          return getOrderScheduledTime(orderId, newToken);
        }
      }
    }
    
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
    
        // Получаем актуальный токен
        const token = await getApiToken();
        if (!token) {
          console.error("❌ Не удалось получить токен для API Remonline");
          return "⚠️ *Ошибка обработки изменения статуса заказа: проблема с API токеном*";
        }
    
    console.log(`⚡ Изменение статуса заказа #${orderId}: ${oldStatusId} (${statusNames[oldStatusId] || 'Неизвестный'}) -> ${newStatusId} (${statusNames[newStatusId] || 'Неизвестный'})`);
    
    // Получаем текущее запланированное время заказа из Remonline API
    const scheduledTime = await getOrderScheduledTime(orderId, token);
    
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
    
    // Получаем токен
    const token = await getApiToken();
    if (!token) {
      return res.status(500).send("❌ Не удалось получить API токен Remonline");
    }
    
    const scheduledTime = await getOrderScheduledTime(orderId, token);
    
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






