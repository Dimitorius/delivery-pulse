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
  - что у каждой пары ≈ в lens описано расхождение и она либо проверена (verified), либо помечена ⚠.
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
  - Метрики без аналога в выбранном фреймворке приглушены. На странице метрики видны все соответствия: ≡ / ≈, расхождение и источники. *(Ревью 30.09: больше не приглушаются — lens стал словарём, см. п. 11 ниже.)*
  - Выбор линзы запоминается в браузере.
- **Базовая линия elite** на всех 54 плитках: на конец истории нет ни одной красной и не больше 3 жёлтых (закреплено тестом). Прогноз PI — 87%. Seed 167 выбран по этим критериям. *(Ревью 30.09: заменён на seed 29, см. п. 1 ниже.)*

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
13. **PI Predictability** = фактическая BV всех целей / плановая BV committed-целей. ~~Цель = каждая фича PI~~ → по ревью: 4–6 бизнес-результатов на команду.
14. **MC How Many** использует общую недельную пропускную способность программы (для «сколько» суммирование корректно). **MC When** считается по командам совместно.
15. **Forecast Accuracy** — бэктест прогноза «How many P85» на 12 последних неделях. По построению ожидается около 85%.
16. **AI**: причина инцидента приписывается изменению; AI-изменения с весом 1,2× — это допущение модели, не находка. Поэтому цели у метрики нет.
17. **SYNTHETIC**:
    - «DXI-style» — шкала 0–100: сам DXI — проприетарный индекс DX, и мы его не копируем;
    - eNPS;
    - CSAT как EBM Current Value;
    - CPI с бюджетом 0,56 k€ на story point.
18. **Low confidence** держит часть плиток серыми даже в базе: Recovery time, Time to acknowledge/restore, Milestones, Dependency lead time. Выборки там честно малы.
19. ~~SAFe/Flow lens приглушает DORA и PR/CI~~ → по ревью: lens — словарь, не фильтр.

## ⚠ Требовали твоего решения (контент) — решено, см. «Решения Дмитрия»

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

## Решения Дмитрия (ревью 30.09.2026) и как они внесены

**Правки**

1. **Прогноз PI в живом хвосте.** Причина найдена. Истории PI создавались только в момент старта PI, а в спринте разработчики сначала брали перенесённые из IP задачи и техдолг. В итоге первая committed-история закрывалась лишь на 4-й день, и прогноз падал с 87% до 51% за неделю. Исправлено:
   - PI Planning следующего PI проходит **внутри IP-итерации**, за 3 рабочих дня до старта, как в SAFe;
   - в спринте первыми берутся committed-истории PI, затем задачи, затем остальные истории;
   - seed подобран заново по новым критериям (seed **29**): прогноз на старте PI 4 — **91.7 %**, минимум за весь живой PI 4 — **91 %**;
   - новый тест `src/app/liveBaseline.test.ts` проходит весь живой PI 4 с шагом 4 рабочих часа (как на 100×). Он требует, чтобы прогноз был ≥ 86% на каждом шаге и на Pulse не было ни одной красной плитки. `npm run baseline` печатает то же самое.
2. **Lens по первоисточникам:**
   - Cycle Time ≈ Flow Time (Flow Framework: начинается с первого активного статуса, [Planview](https://blog.planview.com/flow-time-vs-lead-time/));
   - Lead Time ≈ Flow Time (SAFe: «from when a backlog item enters the workflow to its release», Accelerating Flow);
   - PI Predictability ≡ SAFe Flow Predictability («overall planned versus actual business value»).
3. **XmR:** точки за пределом в сторону улучшения — серые, не красные. Красные только сигналы.
4. **Cycle Time больше не прилипает к 7,0.** Снижены ожидание QA и трудоёмкость; недельный P85 колеблется в 5,9–6,8.
   Ограничение: работа идёт только в рабочие часы, поэтому время цикла группируется у целых календарных дней (±0,3 дня), и P85 «перепрыгивает» между такими группами.
5. **Тренд** не показывает точки, пока окно не заполнено: для 28-дневного окна первые 4 недели пусты.
6. **Scatterplot и все временные оси** подписаны датами («8 Oct»).
7. **Реестр рисков:** у каждой команды свой список из 8 правдоподобных рисков, каждый используется один раз; команда-владелец — отдельной колонкой.

**Решения по ⚠**

8. Пары ≈ приняты, отмечены `verified: 2026-09-30` вместо ⚠. Sprint Goal ≈ Iteration Goals — ок.
9. PI Predictability 80–100% подписан «SAFe framework guidance, not a benchmark».
10. Цели PI укрупнены: 4–6 на команду (3–5 committed + 1 uncommitted). Цель — бизнес-результат, например «Reduce card authorisation declines», фичи сгруппированы под ней. Число помечено «⚠ practice»: рекомендация SAFe за логином.
11. Lens — словарь, не фильтр. DORA, PR/CI и другие метрики без аналога показываются под своим именем. Приглушается только то, что противоречит фреймворку: поле `lensConflict` в YAML, сейчас не заполнено ни у одной метрики. SPEC обновлён.
12. Rework Rate без порога — принято.
13. Источники подтверждены, отметки «не проверено» сняты:
    - Measure and Grow (обновлено 8 сен 2025);
    - PI Objectives;
    - Accelerating Flow (12 мар 2025);
    - Project to Product (Kersten, IT Revolution, 2018);
    - GAO-20-195G (12 марта 2020).
    В подписях указано, что полный текст SAFe за логином.
14. Все 19 решений реализации приняты с изменениями выше.

## Как проверить самому

- Клик по плитке → страница метрики; «← Back» возвращает назад.
- Шапка → Lens → SAFe: вкладка Flow переименуется, лишнее приглушится.
- `npm run baseline` — статусы плиток на конец истории и весь живой PI 4; `npm test` — все тесты.

## Следующий этап (3) — передача

Каталог ~180, синтетика, Library, 42 симптома (Diagnose), сценарии (Inject scenario), Learn, Tour.

**Важно:** весь контент каталога и Learn придёт из папки `content/`, её готовит Cowork:
- `content/catalog.yaml`;
- `content/articles/`;
- `content/sources.yaml`;
- `content/README.md`.

Контент не выдумывать — экраны строить из этих файлов. Если папки ещё нет или в ней чего-то не хватает, спросить Дмитрия.
