# Car Rental Bot - Telegram-бот для аренды автомобилей

Telegram-бот с каталогом для аренды автомобилей. AI-консультант помогает подобрать машину, админы обрабатывают заявки.

## 🚗 Описание проекта

Автоматизация приема заявок на аренду автомобилей через Telegram с интеграцией каталога и AI-помощника.

### Ключевые особенности:
- 🚙 **Каталог автомобилей** - фото, характеристики, цены
- 🤖 **AI-консультант** - помощь в выборе авто
- 📝 **Форма заявки** - сбор данных клиента
- 👨‍💼 **Админ-панель** - управление заявками
- 🔗 **Реферальная система** - приглашение друзей с балансом
- 🌍 **Мультиязычность** - поддержка нескольких языков
- 🗄️ **Supabase на VPS** - собственная база данных

## Технологический стек

- **Node.js** + **Telegraf** - Telegram bot
- **OpenAI API** - AI-консультант
- **Supabase** (PostgreSQL) - база на VPS
- **Express** - API endpoints

## Структура базы данных

```sql
cars (
  brand, model, year, transmission,
  fuel_type, seats, price_per_day,
  deposit, image_url, is_available
)

users (
  telegram_id, username, referrer_id,
  role (client/manager/admin)
)

rental_requests (
  user_id, car_id, full_name, phone,
  pickup_date, return_date, pickup_location,
  status (new/contacted/confirmed/cancelled),
  assigned_manager
)

chat_history (
  user_id, role, content
)

faq (
  topic, content
)
```

## Установка

```bash
git clone https://github.com/Sashatsyhanov14/car-bot.git
cd car-bot
npm install
```

### Конфигурация

**.env:**
```env
BOT_TOKEN=your_bot_token
MANAGER_ID=your_telegram_id
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_key
OPENAI_API_KEY=your_openai_key
```

### База данных

```bash
psql -f database_schema.sql
```

### Запуск

```bash
npm start
```

## Функционал

### Для клиентов:
- 🚗 Просмотр доступных автомобилей
- 💬 AI-помощник по выбору
- 📋 Оформление заявки на аренду
- 📱 Получение контактов менеджера

### Для админов:
- 📊 Просмотр всех заявок
- ✅ Принятие заявок в работу
- 💬 Связь с клиентами
- 🚙 Управление автопарком

## Процесс аренды

1. Клиент выбирает автомобиль из каталога
2. Заполняет форму (ФИО, телефон, даты, место получения)
3. Заявка попадает к менеджеру
4. Менеджер связывается с клиентом
5. Подтверждение аренды

## Статус проекта

**Работает:**
- ✅ Каталог автомобилей
- ✅ AI-консультант
- ✅ Система заявок
- ✅ Админ-панель

**Статус:** 🚧 Развернут на VPS, база заполнена, готов к трафику.

## Контакты

- **GitHub**: [@Sashatsyhanov14](https://github.com/Sashatsyhanov14)
- **Email**: alexandertsyhanov@gmail.com
