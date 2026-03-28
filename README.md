[README.md](https://github.com/user-attachments/files/26323132/README.md)
# 📍 HA DailyRoutes

Домашний проект для автоматического анализа GPS-геометок из **Home Assistant**, извлечения маршрутов и их отображения на интерактивной карте и в Google Календаре.

---

## 🧠 О проекте

Приложение собирает историю геолокации устройств из Home Assistant, автоматически вычленяет из неё логические маршруты (от точки A до точки B) и предоставляет удобный интерфейс для их просмотра и анализа.

Ключевые возможности:

- **Сбор геометок** — интеграция с локальным инстансом Home Assistant через REST API
- **Распознавание маршрутов** — алгоритмическое выделение поездок из потока GPS-точек с определением места отправления и назначения
- **Распознавание зон** — сервис `GuessZoneService` автоматически определяет смысловые зоны (дом, работа и др.) на основе накопленной истории
- **Карта** — визуализация маршрутов на интерактивной карте прямо в браузере
- **Google Календарь** — экспорт маршрутов как событий для хронологического анализа перемещений
- **Автозапуск** — приложение регистрируется в автозагрузке Windows при первом старте

---

## 🏗️ Архитектура

Проект построен по принципам **Domain-Driven Design (DDD)** с использованием моей личной библиотеки **[DDDHibernate](https://github.com/masyanya228)** — NuGet-пакета на базе NHibernate и FluentNHibernate, предоставляющего готовую инфраструктуру для репозиториев, доменных сервисов и DI-интеграции.

```
HA_DailyRoutes/
├── APIs/           # Клиент Home Assistant API
├── Controllers/    # MVC-контроллеры
├── Entities/       # Доменные сущности (GpsRoute, Zone, ...)
├── Maps/           # FluentNHibernate маппинги
├── Models/         # View-модели
├── Repositories/   # Реализации репозиториев
├── Services/       # Бизнес-логика (HAService, GuessZoneService)
├── Views/          # Razor-шаблоны
└── wwwroot/        # Статика (JS, CSS, карта)
```

### Основные сущности

| Сущность | Описание |
|----------|----------|
| `GpsRoute` | Маршрут с набором точек, временем старта/финиша, именами отправления и назначения |
| `Zone` | Смысловая зона (локация с именем и координатами) |

---

## 🛠️ Стек технологий

| Слой | Технология |
|------|-----------|
| Backend | ASP.NET Core 8.0 (MVC) |
| ORM / DDD | **DDDHibernate** (личная библиотека) + FluentNHibernate |
| База данных | PostgreSQL (Npgsql) |
| HTTP-клиент | RestSharp |
| Сериализация | Newtonsoft.Json |
| Frontend | JavaScript, HTML, CSS |
| Интеграция | Home Assistant REST API, Google Calendar API |

---

## ⚙️ Конфигурация

Перед запуском необходимо настроить `appsettings.json`:

```json
{
  "HomeAssistant": {
    "BaseUrl": "http://<your-ha-host>:8123",
    "Token": "<long-lived-access-token>"
  },
  "ConnectionStrings": {
    "Default": "Host=localhost;Database=daily_routes;Username=...;Password=..."
  }
}
```

> **Примечание:** токен Home Assistant и строка подключения к БД не должны попадать в репозиторий — используйте `appsettings.local.json` или переменные окружения.

---

## 🚀 Запуск

```bash
# Восстановить зависимости (включая локальный NuGet-источник)
dotnet restore

# Применить SQL-миграции
# psql -f update.sql

# Запустить приложение
dotnet run
```

Приложение автоматически зарегистрируется в автозагрузке Windows (`HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run`) при первом запуске.

---

## 📦 Зависимости

- [`DDDHibernate`](https://github.com/masyanya228) — личная библиотека DDD-инфраструктуры на базе NHibernate
- `FluentNHibernate` 3.4.1
- `Npgsql` 10.0.2
- `RestSharp` 114.0.0
- `Newtonsoft.Json` 13.0.4

---

## 📄 Лицензия

Личный домашний проект. Используется в собственных целях.
