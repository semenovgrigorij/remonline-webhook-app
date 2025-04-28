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
    console.log(`🔄 Синхронизация заказа #${orderId} со статусом ${newStatusId} с Amelia`);
    
    // Сначала проверяем, есть ли такая запись в Amelia
    const checkResponse = await axios.get(`${WORDPRESS_URL}/wp-json/amelia-remonline/v1/check-appointment?external_id=${orderId}&secret=${WORDPRESS_SECRET}`);
    
    // Если записи нет, выводим сообщение и пропускаем обновление
    if (!checkResponse.data.exists) {
      console.log(`⚠️ Запись для заказа #${orderId} не найдена в Amelia. Синхронизация пропущена.`);
      return false;
    }
    
    // Если запись существует, обновляем статус
    const response = await axios.post(`${WORDPRESS_URL}/wp-json/amelia-remonline/v1/update-status`, {
      orderId: orderId,
      newStatusId: newStatusId,
      secret: WORDPRESS_SECRET
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });
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
}
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
    const orderId = data.metadata.order.id;
    const newStatusId = data.metadata.new.id;
    const oldStatusId = data.metadata.old.id;
    
    console.log(`⚡ Изменение статуса заказа #${orderId}: ${oldStatusId} (${statusNames[oldStatusId] || 'Неизвестный'}) -> ${newStatusId} (${statusNames[newStatusId] || 'Неизвестный'})`);
    
    // Если статус меняется с "Автозапис" на "В работе", синхронизируем с Amelia
      await syncStatusWithAmelia(orderId, newStatusId);
    
    if (newStatusId === IN_PROGRESS_STATUS_ID) {
      return `🔄 *Заказ #${orderId} перешел в работу*`;
    } else if (newStatusId === AUTO_APPOINTMENT_STATUS_ID) {
      return `🔄 *Заказ #${orderId} в статусе "Автозапис"*`;
    }
    
    return `🔄 *Статус заказа #${orderId} изменен*`;
  },
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
    await sendTelegramMessageWithRetry(message);
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






