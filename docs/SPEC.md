# Delivery Pulse — Spec v0.2 (итог grilling-сессии 25.09.2026)

Статус: **утверждено** Дмитрием 25.09.2026 (все раунды grilling закрыты). Этап 0 начат.

## 1. Цель и позиционирование
- Приложение-«пульс метрик» для Delivery Manager / Technical Program Manager / Technical Project Manager.
- Цели сейчас: (a) демо в портфолио для поиска работы, (d) учебный справочник/тренажёр. Потом: (b) рабочий инструмент на реальных данных, (c) возможно SaaS.
- Язык интерфейса: English. Название: **Delivery Pulse**.

## 2. Ключевые принципы
- Полный каталог (~180 метрик), но на экранах — курируемый минимум; остальное включается выборочно («анализы под симптом»).
- Все метрики **вычисляются из потока событий** (event-sourced симулятор), а не генерируются готовыми рядами → связки согласованы (закон Литтла и т.п.), история бесплатно, переход на Jira = замена источника событий.
- Медиана и перцентили, не среднее. Толстый хвост распределения сохраняется даже в «elite»-данных.
- Индивидуальные метрики (commits/LOC/SP на человека) — только в каталоге как анти-метрики, без дашбордов по людям.

## 2a. Главный принцип дизайна (слова Дмитрия)
- **Transparency важнее красоты.** Каждая цифра прослеживаема: клик → как посчитано, из каких событий, какая формула, какая цель/бенчмарк и откуда.
- Понятно и user-friendly, **не перегружено**: мало плиток на экран, много воздуха, подробности — по клику, а не сразу.

## 3. Данные и симуляция
- Фиксированный seed → одна и та же история у всех (воспроизводимое демо). Пользовательские правки (цели, аннотации, включённые метрики, свои симптомы) — IndexedDB в браузере + экспорт/импорт JSON.
- Предзаполненная история ~6 месяцев (3 PI) + живой хвост в ускоренном времени (пауза, 1× = 1 сек → 1 рабочий час, 10×, 100×).
- Вымышленная организация: нейтральный продукт (платёжная/e-commerce платформа), 1 программа, 4 stream-aligned команды + 1 платформенная, межкомандные зависимости; 1 команда на Kanban, остальные Scrum. Portfolio — уровень-заглушка.
- Elite-профиль (осознанно не 100%): Deploy freq — несколько раз в день; LT for changes P50 < 1 дня; CFR 3–5%; FDRT < 1 ч; Rework ~5%; Cycle time P85 story 5–7 дн; Flow efficiency 35–45%; Say-Do 80–90%; Sprint Goal ~85%; Carry-over < 15%; PI Predictability 80–95%; PR pickup < 4 ч, time to merge < 1 дня; Pipeline P95 < 12 мин, main green > 95%, flaky < 2%; SLO 99.9%, error budget > 50%; Unplanned 15–20%; Investment ~60/20/20 (features/debt/KTLO).
- Сценарии «кнопки беды» = симптомы. В MVP честно разыгрываемые ~12: сроки срываются, застревает в ревью/QA, много начато/мало закончено, толстый хвост, arrival > departure, частые блокеры, баги в проде, инциденты, красный CI, scope creep, смена приоритетов/unplanned, ждём другие команды. Остальные подключаются конфигом.

## 4. Модель событий (канон для будущих адаптеров)
WorkItem (Epic → Feature → Story/Task/Bug) · StatusTransition + маппинг статусов на категории backlog/queue/active/done · Iteration (Sprint/PI) · DependencyLink (from, to, need-by) · MergeRequest (opened/first review/merged) · PipelineRun · Deployment (+rework/rollback) · Incident (sev, detect/ack/resolve) · Risk (P×I, owner) · Milestone · SurveySnapshot · CostEntry · Annotation · MetricDefinitionChange.
Адаптеры в будущем: Jira Cloud, GitLab/GitHub (DORA, PR, CI), трекер Fusion Soft через MCP.

```
Program ─┬─ Team ──< WorkItem >── StatusTransition ──> StatusCategory
         │            │  ▲  (Epic→Feature→Story/Bug)     (backlog/queue/active/done)
         │            │  └── DependencyLink (from, to, need-by)
         │            ├──< MergeRequest ──< PipelineRun
         │            └──< Iteration (Sprint / PI)
         ├─ Deployment ──> Incident (sev, detect/ack/resolve)
         ├─ Risk · Milestone · CostEntry · SurveySnapshot
         └─ Annotation · MetricDefinitionChange   ← история изменений
```

## 5. Иерархия и уровни
Portfolio → Program/ART → Team, drill-down; перцентили при агрегации пересчитываются по объединённой выборке, не усредняются. Межкомандные зависимости — граф.

## 6. Метрики
- Каталог ~180, 11–12 доменов. У каждой: источник (tracker/CI/monitoring/survey/finance/manual), уровень (lagging/current/leading, может быть несколько), тег фреймворка.
- **Ядро 50 живых**: Flow (11): Throughput, Cycle Time P50/P85, Lead Time, WIP, Work Item Age/Aging WIP, Flow Efficiency, Net Flow, Blocked items & time, Queue size by stage, SLE attainment, Flow Distribution · Scrum (5): Sprint Goal Success, Say-Do, Carry-over, Sprint Scope Change, Velocity · DORA (5) · PR/CI (7): PR Pickup, Time to Merge, PR Size, Main Build Success, Pipeline Duration P95, Flaky Rate, Red-main Time · Quality & Reliability (8): Escaped Defects, Reopen Rate, Incidents by Severity, MTTA, Incident MTTR, SLO Attainment, Error Budget Burn Rate, Postmortem Action Closure · Program (8): Open/Overdue Dependencies, Dependency Lead Time, Milestone Hit Rate, Critical Path Drift, Program Scope Growth, Risk Exposure (EMV), Unplanned Work %, Investment Allocation · Forecast (3): MC When, MC How Many, Forecast Accuracy · SAFe (1): PI Predictability · AI (2): AI-assisted change share, CFR/Rework AI vs non-AI.
- Синтетические плитки высокого качества на Value/People/Finance: DXI, eNPS, EBM Current Value, CPI.
- Остальные — бейдж `SYNTHETIC`, приглушённый стиль, подсказка об источнике в проде; включаются через Library.
- Scrum-набор полностью в каталоге (velocity с оговоркой «не сравнивать команды», focus factor — спорная).
- Эквивалентность фреймворков (утверждено): чипы «also known as» (≡ точно, ≈ приблизительно, расхождение — в тултипе; пары ≈ проверяются по первоисточнику и помечаются ⚠) + переключатель «Framework lens» в шапке (Default / SAFe / Flow Framework), переименовывающий весь UI; метрики без аналога в выбранном фреймворке приглушаются.
- Статус-цвет от цели команды; индустриальный бенчмарк — ориентир с источником. Смена цели — в журнал изменений.
- Leading-сигналы: XmR / process behavior charts (правила Western Electric) + Aging WIP против SLE-перцентиля. Без ML.

## 7. Экраны
Табы: Pulse · Flow · Delivery (DORA+PR+CI) · Quality & Reliability (+Security) · Program · Forecast · Scale (SAFe) · Value · People · Finance · AI Impact · служебные: Catalog, Diagnose, Library, Learn.
- **Pulse**: шапка (уровень, часы симуляции, Inject scenario, счётчик сигналов, Framework lens) → строка «успеваем?» (MC P50/P85 vs дедлайн PI, вероятность) → 3 колонки Lagging/Current/Leading по 5–7 плиток → правая лента событий + сработавшие сигналы → мини-граф зависимостей. Клик по плитке → страница метрики; по сигналу → Diagnose.
- **Страница метрики**: значение/цель/бенчмарк/тренд; ряд с коридором XmR и аннотациями; распределение + scatterplot для временных; разбивка по командам; мини-графики связки; боковая карточка; журнал изменений определения.
- **Diagnose**: 42 симптома (40 + «формальное демо без обратной связи», «релизы зависят от ручного регресса»), у каждого — связка метрик, чтение, гипотезы, плейбук; пользователь может добавлять свои.
- **Learn**: статья на метрику (зачем, на какие вопросы отвечает, как считается с разобранным примером, когда применять/нет, связки, как обманывают, «как объяснить на собесе», кликабельные источники). Tier 1 Start here (~12) / Tier 2 Core / Tier 3 Situational / Tier 4 Specialist. Пути по ролям DM/TPM/PjM. Карточка и статья — из одного файла реестра. Интерактивный калькулятор для Tier 1.
- **Tour**: 3–4 мин гид (Pulse → inject review bottleneck → leading-сигнал → Diagnose → плейбук → MC показывает сдвиг даты) + текст «что говорить».
- **Моб.**: только Pulse read-only; остальное desktop.
- Визуально: сдержанный «операционный центр» (Grafana/Bloomberg dark), моноширинные цифры, движение данных вместо декора. Только тёмная тема в MVP.

## 8. Конфиг
- Реестр в репо: один YAML на метрику / симптом / сценарий (источник правды).
- Library в UI: включение/выключение поверх реестра. Конструктор своих формул — v2 (модель данных закладывается).

## 9. Стек и инфраструктура
React + TypeScript + Vite · ECharts · Zustand · симулятор в Web Worker · Vitest (у каждой живой метрики эталонный тест). Репо — публичный с первого дня, без лицензии (all rights reserved), GitHub Pages через GitHub Actions.
Код пишет Claude в облаке → кладёт в подключённую папку `New Work (delivery, program, project)/delivery-pulse` → Дмитрий пушит через GitHub Desktop. Дмитрий — не программист: инструкции по GitHub давать пошагово и только когда шаг действительно нужен.

## 10. Контент: правила исследования (утверждено)
- Минимум 2 независимых источника на утверждение; английский; приоритет первоисточникам (DORA reports, SAFe framework site, Scrum.org, Vacanti, Kersten/Flow Framework, Google SRE books, getdx research, PMI) и свежим (2023+) публикациям. Без обзорных статей «для не-менеджеров» и вендорского маркетинга как основы.
- Спорное или одноисточниковое — флаг ⚠. Claude ревьюит; Дмитрий даёт финальное решение по Tier 1 и ⚠.

## 11. Этапы
0. Репо + деплой + пустая страница по ссылке.
1. Симулятор, модель событий, ~15 метрик, Pulse.
2. Ядро 50, все табы, страница метрики. → + Tour = первая показываемая версия (~2–3 дня).
3. Каталог ~180, синтетика, Library, симптомы, сценарии, Learn.
4. MC программы, граф зависимостей.
5. Моб. Pulse, полировка, README для портфолио. (Всё ≈ неделя при ~1 ч/день ревью.)
