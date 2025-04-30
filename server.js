const orderCache = new Map(); // Хранит данные заказов
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const schedule = require('node-schedule');
// const crypto = require("crypto");
require("dotenv").config();

// Обновлять токен каждые 23 часа
const tokenRefreshJob = schedule.scheduleJob('0 */23 * * *', async function() {
  console.log(`🕒 Плановое обновление токена API Remonline...`);
  await updateApiToken();
});

// Конфигурация
// const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8026606898:AAEcpb8avNsTWe8ehwDVsAF-sKy3WiYKfwg";
// const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "1316558920";
// const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "VSBpuxhNp0LJ5hJwiN8FZ";

const REMONLINE_API_KEY = process.env.REMONLINE_API_KEY || '';
let REMONLINE_API_TOKEN = process.env.REMONLINE_API_TOKEN || '';
let REMONLINE_TOKEN_EXPIRY = 0;
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
 * Обновляет API токен Remonline с использованием API ключа
 * @returns {Promise<string|null>} Новый токен или null при ошибке
 */
async function updateApiToken() {
  try {
    console.log("🔄 Обновление API токена Remonline...");
    
    if (!REMONLINE_API_KEY) {
      console.error("❌ Отсутствует REMONLINE_API_KEY в переменных окружения");
      return null;
    }
    
    console.log(`🔑 Используем API ключ: ${REMONLINE_API_KEY.substring(0, 5)}...`);
    
    const response = await axios.post("https://api.remonline.app/token/new", {
      api_key: REMONLINE_API_KEY
    });
    
    if (response.data && response.data.token) {
      const token = response.data.token;
      // Сохраняем токен в глобальных переменных
      REMONLINE_API_TOKEN = token;
      REMONLINE_TOKEN_EXPIRY = Date.now() + 23 * 60 * 60 * 1000;
      
      console.log(`✅ API токен Remonline обновлен: ${token.substring(0, 5)}...`);
      return token;
    } else {
      console.error("❌ Неверный ответ API при обновлении токена");
      console.error("Ответ API:", response.data);
      return null;
    }
  } catch (error) {
    console.error(`❌ Ошибка при обновлении API токена: ${error.message}`);
    if (error.response) {
      console.error("Статус:", error.response.status);
      console.error("Данные:", error.response.data);
    }
    return null;
  }
}


/**
 * Обновляет API токен Remonline с использованием постоянного API ключа
 * @returns {Promise<string|null>} Новый токен или null при ошибке
 */
async function updateApiToken() {
  try {
    console.log("🔄 Обновление API токена Remonline...");
    
    if (!REMONLINE_API_KEY) {
      console.error("❌ Отсутствует REMONLINE_API_KEY в переменных окружения");
      return null;
    }
    
    const response = await axios.post("https://api.remonline.app/token/new", {
      api_key: REMONLINE_API_KEY
    });
    
    if (response.data && response.data.token) {
      const token = response.data.token;
      // Сохраняем токен в глобальной переменной
      REMONLINE_API_TOKEN = token;
      // Обновляем время истечения токена (24 часа от текущего момента)
      REMONLINE_TOKEN_EXPIRY = Date.now() + 23 * 60 * 60 * 1000;
      
      console.log(`✅ API токен Remonline обновлен: ${token.substring(0, 5)}...`);
      return token;
    } else {
      console.error("❌ Неверный ответ API при обновлении токена");
      console.error("Ответ API:", response.data);
      return null;
    }
  } catch (error) {
    console.error(`❌ Ошибка при обновлении API токена: ${error.message}`);
    if (error.response) {
      console.error("Статус:", error.response.status);
      console.error("Данные:", error.response.data);
    }
    return null;
  }
}

app.get("/refresh-token", async (req, res) => {
  try {
    // Принудительное обновление токена
    const newToken = await updateApiToken();
    
    if (newToken) {
      res.send(`
        <h2>✅ Токен успешно обновлен</h2>
        <p><strong>Новый токен:</strong> ${newToken.substring(0, 5)}...</p>
        <p><strong>Действителен до:</strong> ${new Date(REMONLINE_TOKEN_EXPIRY).toLocaleString()}</p>
        <p><a href="/test-connection">Проверить соединение с Remonline</a></p>
      `);
    } else {
      res.status(500).send(`
        <h2>❌ Не удалось обновить токен</h2>
        <p>Проверьте API ключ и логи сервера.</p>
        <p><strong>Текущий API ключ:</strong> ${REMONLINE_API_KEY ? REMONLINE_API_KEY.substring(0, 5) + '...' : 'не установлен'}</p>
      `);
    }
  } catch (error) {
    console.error(`❌ Ошибка при обновлении токена: ${error.message}`);
    res.status(500).send(`Ошибка: ${error.message}`);
  }
});

// Маршрут для проверки соединения с Remonline
app.get("/test-connection", async (req, res) => {
  try {
    const token = await getApiToken();
    
    if (!token) {
      return res.status(500).send("❌ Не удалось получить токен API");
    }
    
    // Простой запрос к API для проверки работоспособности токена
    const response = await axios.get(`https://api.remonline.app/company/info?token=${token}`);
    
    if (response.data && response.data.success !== false) {
      res.send(`
        <h2>✅ Соединение с Remonline успешно установлено</h2>
        <p><strong>Токен:</strong> ${token.substring(0, 5)}...</p>
        <p><strong>Информация о компании:</strong></p>
        <pre>${JSON.stringify(response.data, null, 2)}</pre>
      `);
    } else {
      res.status(500).send(`
        <h2>❌ Ошибка при проверке соединения</h2>
        <p>API вернул ошибку.</p>
        <pre>${JSON.stringify(response.data, null, 2)}</pre>
      `);
    }
  } catch (error) {
    console.error(`❌ Ошибка при проверке соединения: ${error.message}`);
    res.status(500).send(`
      <h2>❌ Ошибка при проверке соединения</h2>
      <p>${error.message}</p>
      ${error.response ? `<pre>Статус: ${error.response.status}\nДанные: ${JSON.stringify(error.response.data, null, 2)}</pre>` : ''}
    `);
  }
});

/**
 * Получает действительный API токен Remonline, при необходимости обновляя его
 * @returns {Promise<string|null>} Действительный токен или null при ошибке
 */
async function getApiToken() {
  try {
    // Проверяем, есть ли токен и не истек ли он
    if (REMONLINE_API_TOKEN && REMONLINE_TOKEN_EXPIRY && Date.now() < REMONLINE_TOKEN_EXPIRY) {
      console.log(`📋 Используем кэшированный токен Remonline (${REMONLINE_API_TOKEN.substring(0, 5)}...)`);
      return REMONLINE_API_TOKEN;
    }
    
    // Если токена нет или он истек, получаем новый
    console.log(`🔄 Токен отсутствует или истек, получаем новый...`);
    return await updateApiToken();
  } catch (error) {
    console.error(`❌ Ошибка при получении API токена: ${error.message}`);
    return null;
  }
}

/**
 * Получает запланированное время заказа из Remonline
 * @param {string} orderId ID заказа
 * @param {string} token API токен
 * @returns {Promise<number|null>} Время в миллисекундах или null
 */
async function getOrderScheduledTime(orderId, token) {
  try {
    const url = `https://api.remonline.app/order/${orderId}?token=${token}`;
    const response = await axios.get(url);
    
    if (response.data && response.data.data && response.data.data.scheduled_for) {
      const scheduledTime = response.data.data.scheduled_for;
      console.log(`✅ Получено запланированное время для заказа #${orderId}: ${scheduledTime} (${new Date(scheduledTime).toLocaleString()})`);
      return scheduledTime;
    }
    
    console.log(`ℹ️ У заказа #${orderId} не указано запланированное время`);
    return null;
  } catch (error) {
    console.error(`❌ Ошибка при получении данных заказа #${orderId}: ${error.message}`);
    
    // Проверяем, связана ли ошибка с недействительным токеном
    if (error.response && 
        error.response.status === 403 && 
        error.response.data && 
        error.response.data.message && 
        error.response.data.message.includes('Invalid token')) {
      
      console.log("🔑 Токен недействителен, обновляем токен и повторяем запрос...");
      
      // Обновляем токен
      const newToken = await updateApiToken();
      
      if (newToken) {
        console.log(`🔄 Повторный запрос данных заказа #${orderId} с новым токеном`);
        
        // Повторяем запрос с новым токеном
        try {
          const newUrl = `https://api.remonline.app/order/${orderId}?token=${newToken}`;
          const newResponse = await axios.get(newUrl);
          
          if (newResponse.data && newResponse.data.data && newResponse.data.data.scheduled_for) {
            const scheduledTime = newResponse.data.data.scheduled_for;
            console.log(`✅ Получено запланированное время для заказа #${orderId}: ${scheduledTime} (${new Date(scheduledTime).toLocaleString()})`);
            return scheduledTime;
          }
          
          console.log(`ℹ️ У заказа #${orderId} не указано запланированное время`);
          return null;
        } catch (newError) {
          console.error(`❌ Ошибка при повторном получении данных заказа: ${newError.message}`);
          return null;
        }
      }
    }
    
    if (error.response) {
      console.error(`Статус: ${error.response.status}, Данные:`, error.response.data);
    }
    
    console.log(`ℹ️ У заказа #${orderId} не указано запланированное время`);
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


/**
 * Синхронизирует статус заказа с Amelia
 * @param {string} orderId ID заказа
 * @param {string} newStatusId ID нового статуса
 * @returns {Promise<boolean>} Результат синхронизации
 */
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
    
    console.log(`🔄 Синхронизация заказа #${orderIdStr} со статусом ${newStatusIdStr} (${statusNames[newStatusIdStr] || 'Неизвестный'}) с Amelia`);
    
    // Сначала проверяем, есть ли такая запись в Amelia
    try {
      console.log(`🔍 Проверка наличия записи с externalId=${orderIdStr} в Amelia`);
      
      const checkUrl = `${WORDPRESS_URL}/wp-json/amelia-remonline/v1/check-appointment`;
      console.log(`URL запроса: ${checkUrl}?external_id=${orderIdStr}`);
      
      const checkResponse = await axios.get(checkUrl, {
        params: {
          external_id: orderIdStr,
          secret: WORDPRESS_SECRET
        },
        timeout: 15000
      });
      
      console.log(`✅ Получен ответ от API проверки записи: ${JSON.stringify(checkResponse.data)}`);
      
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
      
      console.log(`✅ Запись для заказа #${orderIdStr} найдена в Amelia`);
    } catch (error) {
      console.error(`❌ Ошибка при проверке записи в Amelia:`, error.message);
      if (error.response) {
        console.error(`Статус: ${error.response.status}, Данные:`, error.response.data);
      }
      return false;
    }
    
    // Если запись существует, обновляем статус
    try {
      console.log(`🔄 Обновление статуса заказа #${orderIdStr} в Amelia`);
      
      const updateUrl = `${WORDPRESS_URL}/wp-json/amelia-remonline/v1/update-status`;
      console.log(`URL запроса: ${updateUrl}`);
      
      const response = await axios.post(updateUrl, {
        orderId: orderIdStr,
        newStatusId: newStatusIdStr,
        secret: WORDPRESS_SECRET
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000
      });
      
      console.log(`✅ Получен ответ от API обновления статуса: ${JSON.stringify(response.data)}`);
      
      // Проверяем ответ от API
      if (!response.data || response.data.success !== true) {
        console.error(`❌ Неверный формат ответа при обновлении статуса:`, response.data);
        return false;
      }
      
      console.log(`✅ Статус успешно обновлен в Amelia`, response.data);
      return true;
    } catch (error) {
      console.error(`❌ Ошибка при обновлении статуса в Amelia:`, error.message);
      if (error.response) {
        console.error(`Статус: ${error.response.status}, Данные:`, error.response.data);
      } else if (error.request) {
        console.error(`Не получен ответ. Запрос:`, error.request);
      }
      return false;
    }
  } catch (error) {
    console.error(`❌ Неожиданная ошибка при синхронизации статуса:`, error.message);
    if (error.stack) {
      console.error("Stack trace:", error.stack);
    }
    return false;
  }
}

/**
 * Синхронизирует время заказа с Amelia
 * @param {string} orderId ID заказа
 * @param {number} scheduledFor Время в миллисекундах
 * @returns {Promise<boolean>} Результат синхронизации
 */
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
    
    console.log(`🔄 Синхронизация времени заказа #${orderIdStr} (запланирован на ${new Date(scheduledForNum).toLocaleString()}) с Amelia`);
    
    // Сначала проверяем, есть ли такая запись в Amelia
    try {
      console.log(`🔍 Проверка наличия записи с externalId=${orderIdStr} в Amelia`);
      
      const checkUrl = `${WORDPRESS_URL}/wp-json/amelia-remonline/v1/check-appointment`;
      console.log(`URL запроса: ${checkUrl}?external_id=${orderIdStr}`);
      
      const checkResponse = await axios.get(checkUrl, {
        params: {
          external_id: orderIdStr,
          secret: WORDPRESS_SECRET
        },
        timeout: 15000
      });
      
      console.log(`✅ Получен ответ от API проверки записи: ${JSON.stringify(checkResponse.data)}`);
      
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
      
      console.log(`✅ Запись для заказа #${orderIdStr} найдена в Amelia`);
    } catch (error) {
      console.error(`❌ Ошибка при проверке записи в Amelia:`, error.message);
      if (error.response) {
        console.error(`Статус: ${error.response.status}, Данные:`, error.response.data);
      }
      return false;
    }
    
    // Если запись существует, обновляем дату/время
    try {
      console.log(`🔄 Обновление времени заказа #${orderIdStr} в Amelia`);
      
      const updateUrl = `${WORDPRESS_URL}/wp-json/amelia-remonline/v1/update-datetime`;
      console.log(`URL запроса: ${updateUrl}`);
      
      const response = await axios.post(updateUrl, {
        orderId: orderIdStr,
        scheduledFor: scheduledForNum,
        secret: WORDPRESS_SECRET
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000
      });
      
      console.log(`✅ Получен ответ от API обновления времени: ${JSON.stringify(response.data)}`);
      
      // Проверяем ответ от API
      if (!response.data || response.data.success !== true) {
        console.error(`❌ Неверный формат ответа при обновлении времени:`, response.data);
        return false;
      }
      
      console.log(`✅ Время успешно обновлено в Amelia`, response.data);
      return true;
    } catch (error) {
      console.error(`❌ Ошибка при обновлении времени в Amelia:`, error.message);
      if (error.response) {
        console.error(`Статус: ${error.response.status}, Данные:`, error.response.data);
      } else if (error.request) {
        console.error(`Не получен ответ. Запрос:`, error.request);
      }
      return false;
    }
  } catch (error) {
    console.error(`❌ Неожиданная ошибка при синхронизации времени:`, error.message);
    if (error.stack) {
      console.error("Stack trace:", error.stack);
    }
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

app.listen(PORT, async () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`REMONLINE_API_KEY установлен: ${REMONLINE_API_KEY ? 'Да' : 'Нет'}`);
  
  // При запуске пробуем получить новый токен
  try {
    const token = await updateApiToken();
    if (token) {
      console.log(`✅ Начальный токен API Remonline получен: ${token.substring(0, 5)}...`);
    } else {
      console.warn(`⚠️ Не удалось получить начальный токен API Remonline`);
    }
  } catch (error) {
    console.error(`❌ Ошибка при получении начального токена: ${error.message}`);
  }
});

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
      // Проверяем необходимые данные
      if (!data || !data.metadata || !data.metadata.order) {
        console.error("❌ Ошибка: отсутствуют необходимые метаданные заказа");
        return "⚠️ *Ошибка обработки изменения статуса заказа*";
      }
      
      // Получаем и валидируем ID заказа
      const orderId = data.metadata.order.id;
      if (!orderId) {
        console.error("❌ Ошибка: отсутствует ID заказа", data.metadata.order);
        return "⚠️ *Ошибка обработки изменения статуса: отсутствует ID заказа*";
      }
      
      // Получаем и валидируем статусы
      const newStatusId = data.metadata.new && data.metadata.new.id;
      if (!newStatusId) {
        console.error("❌ Ошибка: отсутствует ID нового статуса", data.metadata.new);
        return "⚠️ *Ошибка обработки изменения статуса: отсутствует новый статус*";
      }
      
      const oldStatusId = data.metadata.old && data.metadata.old.id;
      
      // Преобразуем данные к строкам для безопасности
      const orderIdStr = String(orderId);
      const newStatusIdStr = String(newStatusId);
      const oldStatusIdStr = oldStatusId ? String(oldStatusId) : 'неизвестный';
      
      console.log(`⚡ Изменение статуса заказа #${orderIdStr}: ${oldStatusIdStr} (${statusNames[oldStatusIdStr] || 'Неизвестный'}) -> ${newStatusIdStr} (${statusNames[newStatusIdStr] || 'Неизвестный'})`);
      
      // Проверяем токен и при необходимости обновляем его
      let token = data.metadata.order.token;

      // Получаем данные о времени из Remonline API
      let scheduledTime = null;
      try {
        scheduledTime = await getOrderScheduledTime(orderIdStr, token);
        // Если не удалось получить время и причина в токене, попробуем с новым токеном
      if (!scheduledTime) {
        console.log(`🔄 Попытка получить данные заказа с обновленным токеном...`);
        token = await getApiToken(); // Обновляем токен
        
        if (token) {
          scheduledTime = await getOrderScheduledTime(orderIdStr, token);
        }
      }
        if (scheduledTime) {
          console.log(`📅 Запланированное время заказа #${orderIdStr}: ${new Date(scheduledTime).toLocaleString()}`);
        } else {
          console.log(`ℹ️ У заказа #${orderIdStr} не указано запланированное время`);
        }
      } catch (timeError) {
        console.error(`❌ Ошибка при получении времени заказа: ${timeError.message}`);
        // Продолжаем выполнение даже при ошибке получения времени
      }
      
      // Обновляем статус в Amelia
      let statusMessage = "";
      
      console.log(`🔄 Вызов функции syncStatusWithAmelia для заказа #${orderIdStr}, статус=${newStatusIdStr}`);
      
      try {
        const statusUpdateResult = await syncStatusWithAmelia(orderIdStr, newStatusIdStr);
        
        if (statusUpdateResult) {
          console.log(`✅ Статус заказа #${orderIdStr} успешно обновлен в Amelia`);
          
          // Если статус "Новий" (IN_PROGRESS_STATUS_ID) и у нас есть время, обновляем его тоже
          if (newStatusIdStr === String(IN_PROGRESS_STATUS_ID) && scheduledTime) {
            console.log(`🔄 Вызов функции syncDateTimeWithAmelia для заказа #${orderIdStr}, время=${new Date(scheduledTime).toLocaleString()}`);
            
            try {
              const timeUpdateResult = await syncDateTimeWithAmelia(orderIdStr, scheduledTime);
              
              if (timeUpdateResult) {
                console.log(`✅ Время заказа #${orderIdStr} успешно обновлено в Amelia`);
                statusMessage = `🔄 *Заказ #${orderIdStr} перешел в работу и обновлено время на ${new Date(scheduledTime).toLocaleString()}*`;
              } else {
                console.error(`❌ Не удалось обновить время заказа #${orderIdStr} в Amelia`);
                statusMessage = `🔄 *Заказ #${orderIdStr} перешел в работу, но не удалось обновить время*`;
              }
            } catch (timeUpdateError) {
              console.error(`❌ Ошибка при обновлении времени: ${timeUpdateError.message}`);
              statusMessage = `🔄 *Заказ #${orderIdStr} перешел в работу, но произошла ошибка при обновлении времени*`;
            }
          } else {
            // Для других статусов или если нет времени
            if (newStatusIdStr === String(IN_PROGRESS_STATUS_ID)) {
              statusMessage = `🔄 *Заказ #${orderIdStr} перешел в работу*`;
            } else if (newStatusIdStr === String(AUTO_APPOINTMENT_STATUS_ID)) {
              statusMessage = `🔄 *Заказ #${orderIdStr} в статусе "Автозапис"*`;
            } else {
              statusMessage = `🔄 *Статус заказа #${orderIdStr} изменен на "${statusNames[newStatusIdStr] || newStatusIdStr}"*`;
            }
          }
        } else {
          console.error(`❌ Не удалось обновить статус заказа #${orderIdStr} в Amelia`);
          statusMessage = `⚠️ *Заказ #${orderIdStr}: не удалось синхронизировать статус с Amelia*`;
        }
      } catch (statusUpdateError) {
        console.error(`❌ Ошибка при обновлении статуса: ${statusUpdateError.message}`);
        statusMessage = `⚠️ *Произошла ошибка при обновлении статуса заказа #${orderIdStr}*`;
      }
      
      return statusMessage;

      
    } catch (error) {
      console.error("❌ Ошибка при обработке изменения статуса:", error.message);
      if (error.stack) {
        console.error("Stack trace:", error.stack);
      }
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


// Тестовый эндпоинт для проверки обработки Order.Status.Changed
app.get("/test-event", async (req, res) => {
  try {
    const orderId = req.query.order_id;
    if (!orderId) {
      return res.status(400).send("❌ Не указан параметр order_id");
    }
    
    // Проверка доступности API WordPress
    console.log(`🔍 Проверка API WordPress для external_id=${orderId}...`);
    
    try {
      const apiUrl = `${WORDPRESS_URL}/wp-json/amelia-remonline/v1/check-appointment`;
      console.log(`URL запроса: ${apiUrl}`);
      
      const apiResponse = await axios.get(apiUrl, {
        params: {
          external_id: orderId,
          secret: WORDPRESS_SECRET
        },
        timeout: 15000
      });
      
      console.log(`✅ Ответ API WordPress: ${JSON.stringify(apiResponse.data)}`);
      
      if (!apiResponse.data.exists) {
        return res.status(404).send(`❌ Запись для заказа #${orderId} не найдена в Amelia`);
      }
      
      console.log(`✅ Запись найдена в Amelia, ID: ${apiResponse.data.appointment_id}`);
    } catch (apiError) {
      console.error(`❌ Ошибка при проверке API WordPress: ${apiError.message}`);
      return res.status(500).send(`❌ Ошибка при проверке API WordPress: ${apiError.message}`);
    }
    
    // Получение токена
    const token = await getApiToken();
    if (!token) {
      return res.status(500).send("❌ Не удалось получить API токен Remonline");
    }
    
    // Эмулируем событие Order.Status.Changed
    console.log(`🔄 Эмуляция события Order.Status.Changed для заказа #${orderId}`);
    
    // Создаем структуру данных webhook
    const eventData = {
      event: "Order.Status.Changed",
      metadata: {
        order: {
          id: orderId,
          token: token
        },
        new: {
          id: IN_PROGRESS_STATUS_ID // Используем статус "Новий"
        },
        old: {
          id: AUTO_APPOINTMENT_STATUS_ID // Предполагаем, что старый статус был "Автозапис"
        }
      }
    };
    
    console.log(`📦 Данные события: ${JSON.stringify(eventData, null, 2)}`);
    
    // Обрабатываем событие
    const result = await eventHandlers["Order.Status.Changed"](eventData);
    
    console.log(`✅ Результат обработки события: ${result}`);
    
    res.send(`
      <h2>Тестовое событие обработано</h2>
      <p><strong>Заказ ID:</strong> ${orderId}</p>
      <p><strong>Результат:</strong> ${result}</p>
      <h3>Подробные результаты:</h3>
      <ol>
        <li>API WordPress доступен и запись найдена</li>
        <li>API токен Remonline получен успешно</li>
        <li>Обработчик события вызван</li>
      </ol>
    `);
  } catch (error) {
    console.error("❌ Ошибка при тестировании события:", error);
    res.status(500).send(`❌ Ошибка: ${error.message}`);
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

app.get("/webhook-test", (req, res) => {
  // Создаем тестовый файл в директории сервера
  const fs = require('fs');
  const testMessage = `Webhook test received at ${new Date().toISOString()}\n`;
  
  fs.appendFile('webhook-test.log', testMessage, (err) => {
    if (err) {
      console.error('❌ Ошибка записи в тестовый лог:', err);
      return res.status(500).send('Ошибка записи в лог');
    }
    
    console.log('✅ Тестовое сообщение записано в лог');
    res.send('Webhook test successful! Check server logs.');
  });
});

// Улучшим обработчик webhook для журналирования всех входящих данных
app.post("/webhook", (req, res) => {
  try {
    console.log("🔔 Получен webhook от Remonline:", new Date().toISOString());
    console.log("📝 Заголовки запроса:", JSON.stringify(req.headers));
    console.log("📦 Тело запроса:", JSON.stringify(req.body));
    
    // Записываем входящие данные в файл для сохранения истории
    const fs = require('fs');
    const webhookLog = `
===== WEBHOOK RECEIVED at ${new Date().toISOString()} =====
HEADERS: ${JSON.stringify(req.headers, null, 2)}
BODY: ${JSON.stringify(req.body, null, 2)}
===========================================
`;
    
    fs.appendFile('webhook-full.log', webhookLog, (err) => {
      if (err) {
        console.error('❌ Ошибка записи в лог webhook:', err);
      }
    });
    
    // Проверяем структуру тела запроса
    if (!req.body || !req.body.event) {
      console.error("❌ Неверный формат webhook, отсутствует поле event");
      return res.status(400).send("Неверный формат webhook");
    }
    
    const event = req.body.event;
    console.log(`📣 Тип события: ${event}`);
    
    // Проверяем, есть ли обработчик для данного события
    if (eventHandlers[event]) {
      console.log(`✅ Найден обработчик для события ${event}`);
      
      // Вызываем обработчик события асинхронно
      eventHandlers[event](req.body)
        .then(result => {
          console.log(`✅ Событие ${event} обработано успешно:`, result);
        })
        .catch(error => {
          console.error(`❌ Ошибка при обработке события ${event}:`, error);
        });
      
      // Сразу отвечаем успехом, чтобы не блокировать Remonline
      return res.status(200).send("Webhook received");
    } else {
      console.log(`ℹ️ Нет обработчика для события ${event}`);
      return res.status(200).send(`Нет обработчика для события ${event}`);
    }
  } catch (error) {
    console.error("❌ Ошибка при обработке webhook:", error);
    return res.status(500).send("Internal server error");
  }
});

app.get("/simulate-webhook", async (req, res) => {
  try {
    const orderId = req.query.order_id || '53160008';
    const newStatusId = req.query.status_id || '1342663'; // По умолчанию "Новый"
    
    console.log(`🔄 Симуляция webhook для заказа #${orderId}, новый статус: ${newStatusId}`);
    
    // Получаем токен
    const token = await getApiToken();
    
    // Создаем структуру данных webhook
    const webhookData = {
      event: "Order.Status.Changed",
      metadata: {
        order: {
          id: orderId,
          token: token
        },
        new: {
          id: newStatusId
        },
        old: {
          id: "1642511" // Предполагаем, что старый статус был "Автозапис"
        }
      }
    };
    
    // Логгируем данные webhook
    console.log("📦 Данные имитации webhook:", JSON.stringify(webhookData, null, 2));
    
    // Вызываем обработчик напрямую
    const result = await eventHandlers["Order.Status.Changed"](webhookData);
    
    console.log("✅ Результат обработки:", result);
    
    res.send(`
      <h2>Результат симуляции webhook</h2>
      <p><strong>Заказ ID:</strong> ${orderId}</p>
      <p><strong>Новый статус:</strong> ${newStatusId} (${statusNames[newStatusId] || 'Неизвестный'})</p>
      <p><strong>Результат:</strong> ${result}</p>
      <h3>Данные webhook:</h3>
      <pre>${JSON.stringify(webhookData, null, 2)}</pre>
    `);
  } catch (error) {
    console.error("❌ Ошибка при симуляции webhook:", error);
    res.status(500).send(`Ошибка: ${error.message}`);
  }
});

// Маршрут для проверки переменных окружения (только для отладки)
app.get("/env-check", (req, res) => {
  const envVars = {
    REMONLINE_API_KEY: process.env.REMONLINE_API_KEY ? `${process.env.REMONLINE_API_KEY.substring(0, 5)}...` : 'не установлен',
    NODE_ENV: process.env.NODE_ENV,
    TOKEN_STATUS: global.REMONLINE_API_TOKEN ? 'установлен' : 'не установлен',
    TOKEN_EXPIRY: global.REMONLINE_TOKEN_EXPIRY ? new Date(global.REMONLINE_TOKEN_EXPIRY).toLocaleString() : 'не установлено'
  };
  
  res.send(`
    <h2>Проверка переменных окружения</h2>
    <pre>${JSON.stringify(envVars, null, 2)}</pre>
  `);
});

// Маршрут для установки API ключа вручную
app.get("/set-api-key", (req, res) => {
  const apiKey = req.query.key || '275a47a9b5eb4249ad4e8d6e0c2f219b';
  
  if (apiKey) {
    process.env.REMONLINE_API_KEY = apiKey;
    console.log(`🔑 API ключ установлен вручную: ${apiKey.substring(0, 5)}...`);
    res.send(`
      <h2>✅ API ключ Remonline установлен</h2>
      <p><strong>Ключ:</strong> ${apiKey.substring(0, 5)}...</p>
      <p><a href="/refresh-token">Обновить токен API</a></p>
    `);
  } else {
    res.status(400).send('Не указан API ключ. Используйте ?key=YOUR_API_KEY');
  }
});

app.get("/api-key-info", (req, res) => {
  const keyInfo = {
    apiKey: REMONLINE_API_KEY ? `${REMONLINE_API_KEY.substring(0, 5)}...` : 'не установлен',
    token: REMONLINE_API_TOKEN ? `${REMONLINE_API_TOKEN.substring(0, 5)}...` : 'не установлен',
    tokenExpiry: REMONLINE_TOKEN_EXPIRY ? new Date(REMONLINE_TOKEN_EXPIRY).toLocaleString() : 'не установлено'
  };
  
  res.send(`
    <h2>Информация об API ключе и токене</h2>
    <pre>${JSON.stringify(keyInfo, null, 2)}</pre>
    <p><a href="/refresh-token">Обновить токен API</a></p>
  `);
});

// Отладочный маршрут для проверки API ключа
app.get("/debug-token", async (req, res) => {
  try {
    console.log("🔍 Отладка токена API");
    console.log(`API ключ в переменных окружения: ${process.env.REMONLINE_API_KEY ? 'Установлен' : 'Отсутствует'}`);
    console.log(`API ключ в коде: ${REMONLINE_API_KEY ? 'Установлен' : 'Отсутствует'}`);
    
    // Прямая проверка API ключа
    const apiKey = REMONLINE_API_KEY || process.env.REMONLINE_API_KEY || '275a47a9b5eb4249ad4e8d6e0c2f219b';
    
    console.log(`🔑 Попытка обновления токена с ключом: ${apiKey.substring(0, 5)}...`);
    
    const response = await axios.post("https://api.remonline.app/token/new", {
      api_key: apiKey
    });
    
    if (response.data && response.data.token) {
      const token = response.data.token;
      console.log(`✅ Токен успешно получен: ${token}`);
      
      REMONLINE_API_TOKEN = token;
      REMONLINE_TOKEN_EXPIRY = Date.now() + 23 * 60 * 60 * 1000;
      
      res.send(`
        <h2>✅ Отладка токена успешна</h2>
        <p><strong>API ключ:</strong> ${apiKey.substring(0, 5)}...</p>
        <p><strong>Полученный токен:</strong> ${token}</p>
        <p><strong>Токен действителен до:</strong> ${new Date(REMONLINE_TOKEN_EXPIRY).toLocaleString()}</p>
      `);
    } else {
      console.error("❌ Неверный ответ API:", response.data);
      res.status(500).send(`
        <h2>❌ Ошибка при получении токена</h2>
        <p>API вернул ответ без токена</p>
        <pre>${JSON.stringify(response.data, null, 2)}</pre>
      `);
    }
  } catch (error) {
    console.error(`❌ Ошибка при отладке токена: ${error.message}`);
    res.status(500).send(`
      <h2>❌ Ошибка при отладке токена</h2>
      <p>${error.message}</p>
      ${error.response ? `<pre>Статус: ${error.response.status}\nДанные: ${JSON.stringify(error.response.data, null, 2)}</pre>` : ''}
    `);
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






