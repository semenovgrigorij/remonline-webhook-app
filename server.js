const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
require("dotenv").config();
const app = express();

// Замените на свои значения
const BOT_TOKEN = "8026606898:AAEcpb8avNsTWe8ehwDVsAF-sKy3WiYKfwg";
const CHAT_ID = "1316558920";
const WEBHOOK_SECRET = "VSBpuxhNp0U5HywNSFZ";

app.use(bodyParser.json());

app.post("/webhook", async (req, res) => {
  console.log("Получено сообщение WebHook:", req.body);

  const event = req.body;
  processRemonlineEvent(event);

  res.status(200).send("OK");
});

function processRemonlineEvent(event) {
  let message = "";

  // Определяем тип события и формируем сообщение
  if (event.event_type === "order_created") {
    message = `🆕 Новый заказ: ${event.order_id}\nКлиент: ${event.client_name}`;
  } else if (event.event_type === "order_status_changed") {
    message = `🔄 Изменен статус заказа ${event.order_id}\nНовый статус: ${event.new_status}`;
  }
  // Добавьте обработку других типов событий

  if (message) {
    sendTelegramMessage(message);
  }
}

function sendTelegramMessage(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;

  axios
    .post(url, {
      chat_id: TELEGRAM_CHAT_ID,
      text: text,
    })
    .catch((error) => {
      console.error("Ошибка отправки в Telegram:", error);
    });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
