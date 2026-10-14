# 10. Архитектура и стек

## 10.1 Стек (D-18)

| Область | Решение | Заметки |
|---|---|---|
| Язык | TypeScript 6.0.x (strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`) | Версия 6.0.3 закреплена: `typescript-eslint` пока не поддерживает TS 7 (R-19) |
| Мобильное приложение | **Expo (React Native), dev build**, Expo Router | Expo Go не подходит (фоновая локация, MapLibre) |
| Монорепо | pnpm workspaces | `apps/mobile`, `apps/web-demo`, `packages/core`, `packages/insights`, `packages/ui`, `packages/i18n` |
| БД | `expo-sqlite` + Drizzle ORM | миграции SQL, WAL |
| Данные в UI | запросы Drizzle + подписка на изменения (`useLiveQuery`) | без Redux; Zustand только для эфемерного UI-состояния |
| Валидация | Zod (формы, импорт/экспорт) | |
| Формы | React Hook Form | |
| Карты | `@maplibre/maplibre-react-native` + OpenFreeMap (vector) | за интерфейсом `MapProvider` |
| Графики/Replay | `react-native-skia` + Reanimated 3 + `victory-native` (XL) | |
| Геолокация | `expo-location` + `expo-task-manager` (foreground service на Android) | iOS: best effort |
| Уведомления | `expo-notifications` | локальные |
| Камера/фото | `expo-image-picker`, `expo-image-manipulator` (сжатие до 1600 px) | |
| PDF | `expo-print` (HTML → PDF) | |
| Файлы | `expo-file-system`, `expo-sharing`, `expo-document-picker` | экспорт/импорт |
| Погода | Open-Meteo (HTTP) + кэш в SQLite | |
| i18n | `i18next` + `react-i18next`, ICU-плюрали | RU/EN |
| Haptics/sensors | `expo-haptics`, `expo-sensors` (шагомер, proximity — по возможности) | |
| Тесты | Vitest (core, insights), Jest + React Native Testing Library (UI), **Maestro** (E2E на эмуляторе) | |
| Property-тесты | fast-check | |
| Линт/формат | ESLint, Prettier, `tsc --noEmit` | |
| CI | GitHub Actions: typecheck, lint, unit, сборка Android (EAS cloud или локально), проверка i18n-ключей | iOS — сборка через EAS при желании, без гарантий |
| Веб-демо | Expo web (статическая публикация на GitHub Pages) | карты MapLibre GL JS, GPS заменён воспроизведением GPX |
| Документация | MkDocs или docs/ + диаграммы Mermaid | |

Windows-нюансы: Android-эмулятор (Android Studio) для разработки; реальные прогулки — на физическом устройстве (USB-отладка / APK через EAS); iOS-сборки через EAS в облаке (локально невозможны) — не поддерживаем в разработке.

## 10.2 Структура репозитория
```
PawQuest/
├─ apps/
│  ├─ mobile/            # Expo-приложение (экраны, навигация, платформенные сервисы)
│  └─ web-demo/          # веб-сборка с демо-данными
├─ packages/
│  ├─ core/              # домен: типы, Zod-схемы, расчёты (GPS-фильтры, стата, серии), без React
│  ├─ insights/          # аналитика, чистые функции (A-06…A-23), тесты
│  ├─ data/              # Drizzle-схема, миграции, репозитории, сидер демо-данных
│  ├─ ui/                # дизайн-токены, компоненты (кнопки событий, чипы, карточки)
│  └─ i18n/              # ключи RU/EN, плюрали, форматтеры
├─ docs/                 # это ТЗ + архитектура + ADR
├─ tools/
│  ├─ gpx/               # GPX-симулятор, генератор демо-маршрутов
│  └─ seed/              # генератор синтетических данных
└─ .github/workflows/
```
Зависимости только вниз: `apps → ui/data/insights → core`. `core` и `insights` не импортируют React/Expo.

## 10.3 Слои приложения
1. **UI** (экраны, компоненты) — только отображение и вызовы use-case функций.
2. **Use-cases** (`WalkService`, `EventService`, `TrainingService`, `GoalService`, `ExportService`) — транзакции и бизнес-правила.
3. **Repositories** (Drizzle) — доступ к SQLite, без бизнес-логики.
4. **Platform adapters** — интерфейсы: `LocationProvider`, `MapProvider`, `WeatherProvider`, `NotificationScheduler`, `Clock`, `FileStore`. Реальные реализации и тестовые заглушки (GPX-симулятор, фиксированные часы).
5. **Core/Insights** — чистые функции.

## 10.4 Сервис записи прогулки
- **WalkRecorder** (singleton). API: `start(opts)`, `pause()`, `resume()`, `finish()`, `discard()`, `addEvent(typeId, opts)`, `state$`.
- Подписка на `LocationProvider` (в Android — foreground service с постоянным уведомлением); входящие точки проходят A-01, пишутся в буфер, буфер сбрасывается в БД транзакцией каждые 5 точек / 5 с и при любом переходе состояния.
- Часы: единая `Clock` (подменяется в тестах). Время прогулки — монотонное (`performance.now`-based для UI), метки — по системным часам.
- Восстановление: при старте приложения `WalkRecorder.recover()` ищет `walk.status IN ('active','paused')`; возвращает `RecoverableWalk` для UI.
- Фоновые ограничения Android (Doze, OEM-убийцы) — известный риск (R-01); есть диагностика «последняя точка N секунд назад».

## 10.5 Карты
`MapProvider` интерфейс: `renderRoute(points, style)`, `setCamera`, `addMarkers`, `onPress`, `fitBounds`. Реализации: `MapLibreProvider` (по умолчанию), `GoogleMapsProvider` (опционально, `react-native-maps` + ключ из `.env`, не коммитится). Стиль карты — OpenFreeMap vector style; тёмная тема — отдельный стиль. Оффлайн-кэш (Phase 4): PMTiles области вокруг дома либо кэш MapLibre offline packs.

## 10.6 Погода
`WeatherProvider.fetch(lat, lon, at)`. Open-Meteo: forecast/current + air-quality + daily sunrise/sunset. Кэш по сетке (округление координат до 0,05° и часу) на 3 ч. Ошибки сети молча игнорируются; в `weather_snapshot` пишется то, что удалось получить.

## 10.7 Демо-данные
`tools/seed` — детерминированный генератор (seed в параметрах): создаёт собаку «Луна», 90 дней данных с заложенными закономерностями (например, подзыв лучше в тихих местах; реакции на собак ближе к вечеру) и пошумленными малыми выборками, чтобы проверять формулировки «мало данных». Маршруты — синтетические (случайные блуждания вокруг вымышленных координат) или из открытых GPX.

## 10.8 Безопасность и качество (для портфолио, не для публичного релиза)
- Секреты: только `.env` (в `.gitignore`), `.env.example` в репозитории.
- Реальные данные автора: `.gitignore` для `*.pawquest.json`, `exports/`.
- Зависимости: Dependabot/`pnpm audit` в CI.
- Логирование: локальный кольцевой лог (последние 500 записей) для диагностики; никуда не отправляется.
- Публичный релиз потребует: app lock, privacy zone, шифрование (B-01…B-03 в бэклоге).

## 10.11 «Нужен ли Expo?» — решение D-44

**Expo не заменяет React Native и не ограничивает его.** Приложение так и так будет React Native: тот же код, те же нативные модули. Expo даёт: готовые модули (геолокация, SQLite, камера, уведомления), единую сборку (`prebuild`), подключаемые конфигурации нативных проектов (config plugins) и необязательное облако сборок (EAS).
- **Что нельзя в «чистом» Expo:** запускать в приложении Expo Go (песочница без фоновой геолокации и MapLibre). **Мы Expo Go не используем:** только собственный dev-билд на телефоне (`npx expo run:android`), то есть полноценное нативное приложение.
- **Что даёт «голый» RN без Expo:** ничего нового по функциям; те же нативные модули нужно подключать вручную (больше ручной настройки Gradle/AndroidManifest, обновлений и конфликтов версий).
- **GPS в фоне (главный риск проекта):** от выбора Expo/не-Expo не зависит. Для записи с погашенным экраном на Android нужен **foreground-сервис типа `location`** + разрешения (`ACCESS_FINE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE_LOCATION`), а на Samsung ещё исключение из «спящих» приложений. `expo-location` + `expo-task-manager` это умеют; проверяем на S23 в spike S1.
- **План Б, если spike S1 провален:** (1) собственный нативный Kotlin-модуль с `FusedLocationProviderClient` в foreground-сервисе (подключается через config plugin, остаётся в Expo-проекте), (2) библиотека `react-native-background-geolocation` (для релизных сборок Android платная лицензия, для разработки бесплатно).
- **Windows:** сборка Android локально (`expo run:android`, Android Studio и JDK уже стоят), iOS только через облако EAS (не отлаживаем, D-02).
- **Выход из Expo при желании:** `prebuild` создаёт обычные папки `android/` и `ios/`; проект можно вести как «голый» RN без потерь.

## 10.10 Темизация и акцентные палитры (D-29)
- Палитра — настройка приложения (Настройки → Язык и вид → Акцент), как и язык; значение хранится в `app_setting.accent_palette` (`forest | sea | berry | sun`), по умолчанию `forest`.
- Дизайн-токены: `packages/ui/tokens` содержит для каждой палитры пару акцентных цветов (светлая и тёмная схема); остальные токены (фон, поверхность, текст, линии, мягкий акцент) выводятся из акцента и схемы одной функцией `buildTheme(palette, scheme)`, результат — обычный объект цветов (в React Native нет `color-mix`, поэтому вычисляется в JS и покрывается снимочными тестами контраста WCAG AA).
- Смена палитры и темы — мгновенная, через React context; никаких перезапусков.
- Палитры из прототипа: Лес `#2F7D5B`/`#6FD0A0`, Море `#1D6F8C`/`#6CC3DD`, Ягода `#92399B`/`#D79BE0`, Янтарь `#B0620A`/`#F0B25A` (светлая/тёмная).
- Цвета событий (собака, человек, ребёнок, животное, успех, сложно, упражнение) от палитры не зависят, чтобы метки на карте оставались узнаваемыми.

## 10.9 Архитектурные решения (ADR, заводятся в `docs/adr/`)
ADR-001 Expo вместо Ionic · ADR-002 SQLite+Drizzle · ADR-003 События: единая таблица + detail · ADR-004 Аналитика без хранимых агрегатов · ADR-005 MapProvider и OpenFreeMap · ADR-006 Перестановочные тесты вместо p-value в UI · ADR-007 Режим одной собаки (прогрессивное раскрытие).
