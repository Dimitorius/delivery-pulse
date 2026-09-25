# Этап 2 — что сделано и что проверить (25.09.2026)

Сайт: https://dimitorius.github.io/delivery-pulse/

## Что есть

- **Ядро 50 живых метрик** по SPEC §6 и 4 плитки SYNTHETIC:
  - Flow (11): Throughput, Cycle Time, Lead Time, WIP, Aging WIP, Flow Efficiency, Net Flow, Blocked (count + time), Queue size, SLE attainment, Flow Distribution.
  - Scrum (5): Sprint Goal Success, Say/Do, Carry-over, Sprint Scope Change, Velocity.
  - DORA (5): Deployment Frequency, Lead Time for Changes, CFR, Failed Deployment Recovery Time, Rework Rate.
  - PR/CI (7): PR Pickup, Time to Merge, PR Size, Main Build Success, Pipeline P95, Flaky Rate, Red-main Time.
  - Quality & Reliability (8): Escaped Defects, Reopen Rate, Incidents by Severity, Time to Acknowledge, Time to Restore, SLO Attainment, Error Budget Burn, Postmortem Action Closure.
  - Program (8): Overdue Dependencies, Dependency Lead Time, Milestone Hit Rate, Critical Path Drift, PI Scope Growth, Risk Exposure (EMV), Unplanned Work, Investment Allocation.
  - Forecast (3): Monte Carlo When (PI), Monte Carlo How Many, Forecast Accuracy.
  - SAFe (1): PI Predictability.
  - AI (2): AI-assisted change share, CFR AI / non-AI.
  - SYNTHETIC: Developer experience (DXI-style), eNPS, EBM Current Value (CSAT), CPI.
- **Каждая метрика** вычисляется из событий и имеет эталонный тест с ручным расчётом (`src/metrics/reference.test.ts`, `reference2.test.ts`). Реестр-тест проверяет:
  - что ядро содержит ровно 50 метрик;
  - что у каждой есть YAML, вычисление и эталонный тест;
  - что у каждой пары ≈ в lens стоит флаг ⚠.
- **Симулятор** получил новые данные:
  - откаты или hotfix при сбоях (rework), переоткрытие задач;
  - постмортемы SEV1–2 с action items;
  - вехи программы, цели PI с бизнес-ценностью, реестр рисков;
  - SLI по часам 24/7 для каждого сервиса;
  - синтетические опросы, затраты, CSAT.
  Наблюдательные подсистемы используют отдельные RNG-потоки.
- **Вкладки:** Pulse · Flow (включая Scrum) · Delivery · Quality & Reliability · Program · Forecast · Scale (SAFe) · Value · People · Finance · AI Impact. На каждой вкладке плитки сгруппированы по доменам, плюс 1–2 ключевых графика:
  - Flow: CFD и scatterplot cycle time;
  - Delivery: деплои по неделям и командам;
  - Quality: доступность по дням;
  - Program: граф зависимостей, вехи, реестр рисков;
  - Forecast: распределения Monte Carlo;
  - Scale: PI predictability по PI и цели текущего PI;
  - AI: CFR по типу изменения;
  - People: опросы по командам.
  Catalog / Diagnose / Library / Learn — неактивны до этапа 3.
- **Полная страница метрики** (`#/metric/<id>`, клик по любой плитке) заменила выезжающую панель:
  - значение, цель, статус, low confidence, флаги;
  - тренд с аннотациями (старты PI и IP-итерации) и линией цели;
  - XmR с коридором;
  - распределение и scatterplot для временных метрик;
  - разбивка по командам;
  - «Read together with» — связанные метрики;
  - все исходные записи;
  - боковая карточка: определение, формула, события, цель, бенчмарк с источниками, «Also known as», журнал изменений определения.
- **Framework lens** в шапке: Default / SAFe / Flow Framework.
  - Названия метрик меняются, например Throughput → Flow Velocity, WIP → Flow Load, PI Predictability → Flow Predictability.
  - Словарь интерфейса тоже: Program → ART, Sprint → Iteration.
  - Метрики без аналога в выбранном фреймворке приглушены. На странице метрики видны все соответствия: ≡ / ≈, расхождение и источники.
  - Выбор линзы запоминается в браузере.
- **Базовая линия elite** на всех 54 плитках: на конец истории нет ни одной красной и не больше 3 жёлтых (закреплено тестом). Прогноз PI — 87%. Seed 167 выбран по этим критериям.

## Решения, принятые при реализации (на твой просмотр)

1. **Scrum-метрики живут на вкладке Flow** (группа «Scrum»): отдельной вкладки Scrum в SPEC нет.
2. **Velocity программы = сумма медиан команд**, с оговоркой «не сравнивать команды».
3. **Sprint Scope Change** считает только незапланированные добавления. Работа, которую команда сама взяла вперёд (pull-ahead), показана отдельно — это не изменение scope.
4. **Rework Rate** = откаты + hotfix / все деплои: незапланированные деплои из-за инцидента, как в определении DORA.
5. **Red-main Time** = доля времени команд, когда main красный.
6. **Incidents by Severity**: главное число — SEV1 + SEV2, остальные уровни рядом.
7. **MTTA и MTTR показаны медианой** и так и названы: «Time to acknowledge P50», «Time to restore P50». Средние по нашим правилам не используем.
8. **SLO**: доступность за 28 дней против 99,9%; burn rate — за 7 дней (метод Google SRE).
9. **Постмортемы** — только для SEV1–2. Closure = доля action items, закрытых за 30 дней; учитываются постмортемы давностью 30–120 дней.
10. **Вехи**: 2 на PI — Beta (конец 3-й итерации, первая committed-фича каждой stream-команды) и Release (конец 4-й итерации, первые две фичи каждой команды).
11. **Critical Path Drift** упрощён: максимальное опоздание межкомандной зависимости текущего PI в рабочих днях.
12. **Risk Exposure (EMV)** считается в человеко-днях. Риски заводятся на PI Planning и пересматриваются каждую итерацию.
13. **PI Predictability** = фактическая BV всех целей / плановая BV committed-целей. Цель = каждая фича PI, это ~15 на команду за PI. В реальном SAFe их обычно 3–7 — ⚠ скажи, если нужно укрупнить.
14. **MC How Many** использует общую недельную пропускную способность программы (для «сколько» суммирование корректно). **MC When** считается по командам совместно.
15. **Forecast Accuracy** — бэктест прогноза «How many P85» на 12 последних неделях. По построению ожидается около 85%.
16. **AI**: причина инцидента приписывается изменению; AI-изменения с весом 1,2× — это допущение модели, не находка. Поэтому цели у метрики нет.
17. **SYNTHETIC**:
    - «DXI-style» — шкала 0–100: сам DXI — проприетарный индекс DX, и мы его не копируем;
    - eNPS;
    - CSAT как EBM Current Value;
    - CPI с бюджетом 0,56 k€ на story point.
18. **Low confidence** держит часть плиток серыми даже в базе: Recovery time, Time to acknowledge/restore, Milestones, Dependency lead time. Выборки там честно малы.
19. **SAFe/Flow lens приглушает DORA и PR/CI.** У этих метрик нет именованного аналога в словарях SAFe и Flow Framework, которые мы сверили.

## ⚠ Требуют твоего решения (контент)

- **Пары ≈ в lens:**
  - Lead Time ≈ Flow Time (SAFe и Flow Framework): разные точки старта и конца;
  - Flow Distribution ≈ SAFe (другие категории работ);
  - Sprint Goal Success ≈ Iteration goals (SAFe).
- **PI Predictability «80–100% = predictable»** — один издатель (Scaled Agile), это руководство фреймворка, а не исследование.
- **Rework Rate** — определение DORA есть, порога мы не приводим.
- **Проверка источников.** Сайты SAFe, flowframework.org, itrevolution.com и gao.gov из этой среды не открываются (прокси). Названия и определения сверены по результатам поиска, но URL стоит прокликать:
  - Measure and Grow;
  - PI Objectives;
  - Accelerating Flow;
  - Project to Product;
  - GAO-20-195G.
- **Нужно ли приглушать DORA в SAFe lens** — или показывать как «общие DevOps-метрики»?

## Как проверить самому

- Клик по плитке → страница метрики; «← Back» возвращает назад.
- Шапка → Lens → SAFe: вкладка Flow переименуется, лишнее приглушится.
- `npm run baseline` — статусы плиток; `npm test` — 204 теста.

## Следующий этап (3)

Каталог ~180, синтетика, Library, 42 симптома (Diagnose), сценарии (Inject scenario), Learn.
