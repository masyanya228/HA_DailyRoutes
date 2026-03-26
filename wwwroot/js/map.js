/**
 * map.js — Менеджер маршрутов на Яндекс Картах
 *
 * Публичное API RouteManager:
 *   RouteManager.init(mapContainerId)       — инициализация карты и загрузка данных
 *   RouteManager.addRoute(routeObject)      — добавить маршрут на карту
 *   RouteManager.removeRoute(routeId)       — убрать маршрут с карты
 *   RouteManager.renderDay(dateString)      — показать маршруты за день (YYYY-MM-DD)
 *   RouteManager.getRoutesForDay(dateStr)   — получить массив маршрутов за день
 *   RouteManager.toggleRoute(id, visible)   — переключить видимость маршрута
 *
 * Публичное API RouteApproval:
 *   RouteApproval.start()                  — запуск опроса новых маршрутов
 *   RouteApproval.openModal(id)            — открыть модал для конкретного маршрута
 *   RouteApproval.approve()                — сохранить пункты А и Б
 *   RouteApproval.skip()                   — пропустить текущий маршрут
 */

// ============================================================
// НАСТРОЙКИ
// ============================================================

var API_URL = '/Home/Routes';
const dayBefore = 30;

// ============================================================
// ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ: дата N дней назад → "YYYY-MM-DD"
// ============================================================

function getDateString(daysAgo) {
    var d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.getFullYear()
        + '-' + String(d.getMonth() + 1).padStart(2, '0')
        + '-' + String(d.getDate()).padStart(2, '0');
}

// ============================================================
// ROUTE MANAGER
// ============================================================

var RouteManager = (function () {

    var _map        = null;
    var _polylines  = {};
    var _routesData = [];
    var _panelOpen  = true;   // панель развёрнута по умолчанию

    // ──────────────────────────────────────────────────────
    // Публичный метод: инициализация
    // ──────────────────────────────────────────────────────
    function init(mapContainerId) {

        _applyPageStyles();
        _buildPanel();
        _setStatus('loading');

        var mapReady   = false;
        var dataReady  = false;
        var fetchError = null;

        // 1. Яндекс Карта
        ymaps.ready(function () {
            var container = document.getElementById(mapContainerId);
            _css(container, {
                position: 'fixed',
                top: '0', left: '0',
                width: '100%', height: '100%',
                zIndex: '0'
            });

            _map = new ymaps.Map(mapContainerId, {
                center:   [55.7558, 37.6173],
                zoom:     12,
                controls: ['zoomControl', 'fullscreenControl', 'geolocationControl']
            });

            mapReady = true;
            _tryStart();
        });

        // 2. Загрузка данных
        fetch(API_URL)
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + r.statusText);
                return r.json();
            })
            .then(function (json) {
                _routesData = Array.isArray(json) ? json : [];
                dataReady   = true;
                _tryStart();
            })
            .catch(function (err) {
                fetchError = err.message || 'Неизвестная ошибка';
                dataReady  = true;
                _tryStart();
            });

        function _tryStart() {
            if (!mapReady || !dataReady) return;
            if (fetchError) { _setStatus('error', fetchError); return; }

            _setStatus('ready');
            _buildDaySelector();

            var todayStr = getDateString(0);
            document.getElementById('daySelect').value = todayStr;
            renderDay(todayStr);

            // Запускаем опрос новых маршрутов
            RouteApproval.start();
        }
    }

    // ──────────────────────────────────────────────────────
    // Базовые стили страницы (убираем отступы, скролл)
    // ──────────────────────────────────────────────────────
    function _applyPageStyles() {
        _css(document.documentElement, { height: '100%' });
        _css(document.body, {
            margin: '0', padding: '0',
            height: '100%', overflow: 'hidden'
        });

        // Скрываем navbar и footer от _Layout если есть
        ['header', 'footer', 'nav', '.navbar', '.footer'].forEach(function (sel) {
            var els = document.querySelectorAll(sel);
            els.forEach(function (el) { el.style.display = 'none'; });
        });

        // Контейнер контента MVC (.container, main и т.п.) — убираем отступы
        var main = document.querySelector('main') || document.querySelector('.container');
        if (main) _css(main, { padding: '0', margin: '0', maxWidth: 'none' });
    }

    // ──────────────────────────────────────────────────────
    // Строим плавающую панель
    // ──────────────────────────────────────────────────────
    function _buildPanel() {
        var panel = document.getElementById('panel');
        _css(panel, {
            position:     'fixed',
            top:          '12px',
            left:         '12px',
            zIndex:       '100',
            minWidth:     '220px',
            maxWidth:     '280px',
            maxHeight:    'calc(100vh - 24px)',
            background:   'rgba(255,255,255,0.96)',
            borderRadius: '10px',
            boxShadow:    '0 2px 12px rgba(0,0,0,0.25)',
            overflow:     'hidden',
            display:      'flex',
            flexDirection:'column'
        });

        // ── Заголовок панели с кнопкой сворачивания ──
        var header = document.createElement('div');
        _css(header, {
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            padding:        '10px 12px',
            background:     '#2c3e50',
            cursor:         'pointer',
            userSelect:     'none',
            WebkitUserSelect: 'none'
        });

        var title = document.createElement('span');
        title.innerHTML = '&#128205; Мои маршруты';
        _css(title, { color: '#fff', fontWeight: 'bold', fontSize: '14px' });

        var toggleBtn = document.createElement('span');
        toggleBtn.id        = 'panelToggle';
        toggleBtn.innerHTML = '&#9650;';  // ▲
        _css(toggleBtn, { color: '#fff', fontSize: '12px', marginLeft: '8px' });

        header.appendChild(title);
        header.appendChild(toggleBtn);
        header.onclick = _togglePanel;

        // ── Тело панели ──
        var body = document.createElement('div');
        body.id = 'panelBody';
        _css(body, {
            padding:    '10px 12px',
            overflowY:  'auto',
            flex:       '1'
        });

        // Select дня
        var dayLabel = document.createElement('div');
        _css(dayLabel, { fontSize: '12px', color: '#666', marginBottom: '4px' });
        dayLabel.textContent = 'Выберите день:';

        var daySelect = document.createElement('select');
        daySelect.id = 'daySelect';
        _css(daySelect, {
            width:        '100%',
            padding:      '6px 4px',
            fontSize:     '13px',
            borderRadius: '5px',
            border:       '1px solid #ccc',
            boxSizing:    'border-box'
        });

        var divider = document.createElement('hr');
        _css(divider, { margin: '10px 0', border: 'none', borderTop: '1px solid #eee' });

        var routeLabel = document.createElement('div');
        _css(routeLabel, { fontSize: '12px', color: '#666', marginBottom: '6px' });
        routeLabel.textContent = 'Маршруты за день:';

        var routeList = document.createElement('div');
        routeList.id = 'routeListContainer';

        var noMsg = document.createElement('div');
        noMsg.id = 'noRoutesMsg';
        _css(noMsg, { fontSize: '13px', color: '#999' });

        // Кнопка тепловой карты
        var heatmapDivider = document.createElement('hr');
        _css(heatmapDivider, { margin: '10px 0', border: 'none', borderTop: '1px solid #eee' });

        var heatmapBtn = document.createElement('button');
        heatmapBtn.id          = 'heatmapToggle';
        heatmapBtn.textContent = '🌡 Тепловая карта';
        _css(heatmapBtn, {
            width:        '100%',
            padding:      '7px 4px',
            fontSize:     '13px',
            borderRadius: '5px',
            border:       '1px solid #ccc',
            background:   '#fff',
            cursor:       'pointer',
            boxSizing:    'border-box'
        });
        heatmapBtn.onclick = function () { HeatmapLayer.toggle(); }

        body.appendChild(dayLabel);
        body.appendChild(daySelect);
        body.appendChild(divider);
        body.appendChild(routeLabel);
        body.appendChild(routeList);
        body.appendChild(noMsg);
        body.appendChild(heatmapDivider);
        body.appendChild(heatmapBtn);

        panel.appendChild(header);
        panel.appendChild(body);
    }

    // ──────────────────────────────────────────────────────
    // Сворачивание / разворачивание панели
    // ──────────────────────────────────────────────────────
    function _togglePanel() {
        _panelOpen = !_panelOpen;
        var body      = document.getElementById('panelBody');
        var toggleBtn = document.getElementById('panelToggle');
        if (_panelOpen) {
            body.style.display      = 'block';
            toggleBtn.innerHTML     = '&#9650;';  // ▲
        } else {
            body.style.display      = 'none';
            toggleBtn.innerHTML     = '&#9660;';  // ▼
        }
    }

    // ──────────────────────────────────────────────────────
    // Управление состоянием загрузки / ошибки
    // ──────────────────────────────────────────────────────
    function _setStatus(state, message) {
        var loadingEl = document.getElementById('loadingMsg');
        var errorEl   = document.getElementById('errorMsg');

        // Базовые стили оверлеев (только один раз не страшно)
        _css(loadingEl, {
            position:     'fixed',
            top:          '50%', left: '50%',
            transform:    'translate(-50%, -50%)',
            background:   'rgba(0,0,0,0.7)',
            color:        '#fff',
            padding:      '16px 24px',
            borderRadius: '8px',
            fontSize:     '15px',
            zIndex:       '200',
            display:      'none'
        });

        _css(errorEl, {
            position:     'fixed',
            top:          '50%', left: '50%',
            transform:    'translate(-50%, -50%)',
            background:   '#fff',
            border:       '1px solid #e74c3c',
            color:        '#c0392b',
            padding:      '20px 24px',
            borderRadius: '8px',
            fontSize:     '14px',
            textAlign:    'center',
            zIndex:       '200',
            maxWidth:     '300px',
            display:      'none'
        });

        if (state === 'loading') {
            loadingEl.innerHTML    = '&#9203; Загрузка маршрутов...';
            loadingEl.style.display = 'block';
        } else if (state === 'error') {
            errorEl.innerHTML =
                '<b>&#9888; Ошибка загрузки</b><br><br>'
                + '<span style="color:#555;font-size:12px">' + message + '</span><br><br>'
                + '<a href="javascript:location.reload()" style="color:#2980b9">&#8635; Повторить</a>';
            errorEl.style.display  = 'block';
            loadingEl.style.display = 'none';
        } else if (state === 'ready') {
            loadingEl.style.display = 'none';
            errorEl.style.display   = 'none';
        }
    }

    // ──────────────────────────────────────────────────────
    // Публичный метод: добавить маршрут на карту
    // ──────────────────────────────────────────────────────
    function addRoute(route) {
        if (!_map) { console.warn('Карта ещё не инициализирована'); return; }
        if (_polylines[route.id]) return;

        var polyline = new ymaps.Polyline(
            route.coordinates,
            {
                hintContent:    route.name,
                balloonContent: '<b>' + route.name + '</b><br>Точек: ' + route.coordinates.length
            },
            {
                strokeColor:   route.color || '#3498db',
                strokeWidth:   5,
                strokeOpacity: 0.85
            }
        );

        _map.geoObjects.add(polyline);
        _polylines[route.id] = polyline;
    }

    // ──────────────────────────────────────────────────────
    // Публичный метод: убрать маршрут с карты
    // ──────────────────────────────────────────────────────
    function removeRoute(routeId) {
        var polyline = _polylines[routeId];
        if (polyline) {
            _map.geoObjects.remove(polyline);
            delete _polylines[routeId];
        }
    }

    // ──────────────────────────────────────────────────────
    // Публичный метод: получить маршруты за день
    // ──────────────────────────────────────────────────────
    function getRoutesForDay(dateStr) {
        return _routesData.filter(function (r) { return r.date === dateStr; });
    }

    // ──────────────────────────────────────────────────────
    // Утилита: интерполяция цвета янтарь→индиго по индексу
    // ──────────────────────────────────────────────────────
    function _routeColor(index, total) {
        if (total <= 1) return '#f59e0b';
        var t   = index / (total - 1);         // 0..1
        var from = { r: 239, g: 68, b: 68 }; // #f59e0b янтарь
        var to = { r: 59, g: 130, b: 246 }; // #6366f1 индиго
        var r = Math.round(from.r + (to.r - from.r) * t);
        var g = Math.round(from.g + (to.g - from.g) * t);
        var b = Math.round(from.b + (to.b - from.b) * t);
        return 'rgb(' + r + ',' + g + ',' + b + ')';
    }

    // ──────────────────────────────────────────────────────
    // Публичный метод: отрисовать день
    // ──────────────────────────────────────────────────────
    function renderDay(dateStr) {
        Object.keys(_polylines).map(Number).forEach(function (id) { removeRoute(id); });

        var routes = getRoutesForDay(dateStr);

        // Назначаем цвета по порядку
        routes.forEach(function (route, i) {
            route.color = _routeColor(i, routes.length);
        });

        _buildRouteList(routes);
        routes.forEach(function (route) { addRoute(route); });

        if (routes.length > 0) _fitMapToRoutes(routes);
    }

    // ──────────────────────────────────────────────────────
    // Публичный метод: переключить видимость маршрута
    // ──────────────────────────────────────────────────────
    function toggleRoute(routeId, visible) {
        if (visible) {
            var route = _routesData.find(function (r) { return r.id === routeId; });
            if (route) addRoute(route);
        } else {
            removeRoute(routeId);
        }
    }

    // ──────────────────────────────────────────────────────
    // Приватный: выпадающий список дней
    // ──────────────────────────────────────────────────────
    function _buildDaySelector() {
        var select     = document.getElementById('daySelect');
        var dayNames   = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
        var monthNames = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];

        select.innerHTML = '';

        for (var i = 0; i < dayBefore; i++) {
            var d = new Date();
            d.setDate(d.getDate() - i);

            var dateStr  = getDateString(i);
            var count    = getRoutesForDay(dateStr).length;
            var dayLabel = i === 0 ? 'Сегодня'
                         : i === 1 ? 'Вчера'
                         : dayNames[d.getDay()] + ', ' + d.getDate() + ' ' + monthNames[d.getMonth()];

            var opt         = document.createElement('option');
            opt.value       = dateStr;
            opt.textContent = dayLabel + '  (' + count + ')';
            select.appendChild(opt);
        }

        select.onchange = function () { renderDay(this.value); };
    }

    // ──────────────────────────────────────────────────────
    // Приватный: список маршрутов с чекбоксами
    // ──────────────────────────────────────────────────────
    function _buildRouteList(routes) {
        var container = document.getElementById('routeListContainer');
        var noMsg     = document.getElementById('noRoutesMsg');
        container.innerHTML = '';
        noMsg.innerHTML     = '';

        if (routes.length === 0) {
            noMsg.textContent = 'Нет маршрутов за этот день';
            return;
        }

        routes.forEach(function (route) {
            var row = document.createElement('label');
            _css(row, {
                display:       'flex',
                alignItems:    'center',
                padding:       '6px 0',
                cursor:        'pointer',
                borderBottom:  '1px solid #f0f0f0',
                gap:           '8px'
            });

            var checkbox     = document.createElement('input');
            checkbox.type    = 'checkbox';
            checkbox.checked = true;
            _css(checkbox, { width: '16px', height: '16px', cursor: 'pointer', flexShrink: '0' });
            checkbox.addEventListener('change', (function (r) {
                return function (e) { toggleRoute(r.id, e.target.checked); };
            }(route)));

            var colorDot = document.createElement('span');
            _css(colorDot, {
                display:      'inline-block',
                width:        '12px',
                height:       '12px',
                borderRadius: '50%',
                background:   route.color || '#3498db',
                flexShrink:   '0'
            });

            var nameSpan = document.createElement('span');
            nameSpan.textContent = route.name;
            _css(nameSpan, { fontSize: '13px', color: '#333', lineHeight: '1.3' });

            row.appendChild(checkbox);
            row.appendChild(colorDot);
            row.appendChild(nameSpan);
            container.appendChild(row);
        });
    }

    // ──────────────────────────────────────────────────────
    // Приватный: подогнать карту под маршруты
    // ──────────────────────────────────────────────────────
    function _fitMapToRoutes(routes) {
        var allCoords = [];
        routes.forEach(function (r) {
            r.coordinates.forEach(function (c) { allCoords.push(c); });
        });
        if (allCoords.length > 0) {
            _map.setBounds(
                ymaps.util.bounds.fromPoints(allCoords),
                { checkZoomRange: true, zoomMargin: 80 }
            );
        }
    }

    // ──────────────────────────────────────────────────────
    // Утилита: применить объект стилей к элементу
    // ──────────────────────────────────────────────────────
    function _css(el, styles) {
        if (!el) return;
        Object.keys(styles).forEach(function (k) { el.style[k] = styles[k]; });
    }

    // ──────────────────────────────────────────────────────
    // Публичный метод: подогнать карту под список координат
    // ──────────────────────────────────────────────────────
    function fitTo(coordinates) {
        if (!_map || !coordinates || !coordinates.length) return;
        _map.setBounds(
            ymaps.util.bounds.fromPoints(coordinates),
            { checkZoomRange: true, zoomMargin: 100 }
        );
    }

    // ──────────────────────────────────────────────────────
    // Публичный интерфейс
    // ──────────────────────────────────────────────────────
    // ──────────────────────────────────────────────────────
    // Публичный метод: зарегистрировать анимированный полилайн как preview
    // ──────────────────────────────────────────────────────
    function setPreviewPolyline(polyline) {
        // Убираем предыдущий если есть
        if (_polylines['__ra_preview__']) {
            _map.geoObjects.remove(_polylines['__ra_preview__']);
        }
        _polylines['__ra_preview__'] = polyline;
    }

    // ──────────────────────────────────────────────────────
    // Публичный интерфейс
    // ──────────────────────────────────────────────────────
    return {
        init:               init,
        addRoute:           addRoute,
        removeRoute:        removeRoute,
        getRoutesForDay:    getRoutesForDay,
        renderDay:          renderDay,
        toggleRoute:        toggleRoute,
        fitTo:              fitTo,
        getMap:             function () { return _map; },
        _setPreviewPolyline: setPreviewPolyline
    };

}());

// ============================================================
// ROUTE APPROVAL — уведомления и подтверждение маршрутов
// ============================================================

var RouteApproval = (function () {

    var _allIds      = [];   // все ID новых маршрутов с сервера
    var _current     = null; // текущий маршрут
    var _currentIdx  = -1;   // индекс текущего в _allIds

    // Редактор маршрута
    var _deletedIds    = [];
    var _movedPoints   = [];
    var _splitPointId  = null;
    var _origCoords    = []; // исходные координаты для сброса
    var _editorMarkers = [];
    var _dragMarkers   = [];
    var _editorPolyline  = null;
    var _editorPolyline2 = null; // серая часть после разделения
    var _editorCoords  = []; // [[id, lat, lng], ...]
    var _pointMenu     = null; // текущее открытое контекстное меню

    // ──────────────────────────────────────────────────────
    // Запуск
    // ──────────────────────────────────────────────────────
    function start() {
        _buildStyles();
        _buildDOM();
        _fetchRoute(null);
    }

    // ──────────────────────────────────────────────────────
    // Стили
    // ──────────────────────────────────────────────────────
    function _buildStyles() {
        var style = document.createElement('style');
        style.textContent = [
            '#ra-bell{position:fixed;bottom:24px;right:24px;z-index:9999;width:44px;height:44px;background:rgba(15,17,23,0.95);border:1px solid rgba(255,255,255,0.1);border-radius:50%;display:none;align-items:center;justify-content:center;cursor:pointer;backdrop-filter:blur(8px);transition:transform .15s,background .15s;box-shadow:0 2px 12px rgba(0,0,0,0.4)}',
            '#ra-bell:hover{background:rgba(30,35,50,0.98);transform:scale(1.08)}',
            '#ra-bell svg{width:20px;height:20px;fill:none;stroke:#4f8ef7;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
            '#ra-badge{position:absolute;top:-4px;right:-4px;background:#4f8ef7;color:#fff;border-radius:50%;width:18px;height:18px;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;line-height:1}',
            '#ra-bell.active{display:flex}',
            '#ra-panel{position:fixed;bottom:0;left:0;right:0;z-index:9998;background:rgba(15,17,23,0.97);border-top:1px solid rgba(255,255,255,0.08);backdrop-filter:blur(10px);padding:14px 16px;transform:translateY(100%);transition:transform .25s ease;color:#e8eaf0;font-size:13px}',
            '#ra-panel.visible{transform:translateY(0)}',
            '.ra-meta-row{font-size:11px;color:#4b5563;margin-bottom:10px;display:flex;gap:12px}',
            '.ra-main-row{display:flex;align-items:flex-end;gap:10px}',
            '.ra-fields{display:flex;gap:10px;flex:1;min-width:0}',
            '.ra-field{display:flex;flex-direction:column;gap:4px;flex:1;min-width:0}',
            '.ra-label{font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px}',
            '.ra-input-wrap{display:flex;align-items:center;gap:6px}',
            '.ra-input{flex:1;background:#12141c;border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:9px 12px;color:#e8eaf0;font-size:14px;font-weight:500;outline:none;box-sizing:border-box;transition:border-color .15s;min-width:0;width:100%}',
            '.ra-input:focus{border-color:#4f8ef7}',
            '.ra-chip{display:inline-flex;align-items:center;padding:3px 8px;background:rgba(79,142,247,0.1);border:1px solid rgba(79,142,247,0.25);border-radius:4px;font-size:11px;color:#4f8ef7;cursor:pointer;white-space:nowrap;flex-shrink:0;transition:background .15s}',
            '.ra-chip:hover{background:rgba(79,142,247,0.2)}',
            '.ra-actions{display:flex;gap:8px;flex-shrink:0;align-items:flex-end}',
            '.ra-btn-primary{background:#4f8ef7;color:#fff;border:none;border-radius:6px;padding:9px 20px;font-size:13px;font-weight:600;cursor:pointer;transition:background .15s;white-space:nowrap;height:38px}',
            '.ra-btn-primary:hover{background:#7eb3ff}',
            '.ra-btn-secondary{background:transparent;color:#6b7280;border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:9px 14px;font-size:13px;cursor:pointer;transition:color .15s;white-space:nowrap;height:38px}',
            '.ra-btn-secondary:hover{color:#e8eaf0}',
            '.ra-btn-reset{background:transparent;color:#6b7280;border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:9px 14px;font-size:13px;cursor:pointer;transition:color .15s;white-space:nowrap;height:38px}',
            '.ra-btn-reset:hover{color:#f87171}',
            '.ra-btn-danger{background:transparent;color:#f87171;border:1px solid rgba(248,113,113,0.3);border-radius:6px;padding:9px 14px;font-size:13px;cursor:pointer;transition:background .15s;white-space:nowrap;height:38px}',
            '.ra-btn-danger:hover{background:rgba(239,68,68,0.15)}',
            '.ra-point-menu{position:fixed;z-index:10001;background:rgba(15,17,23,0.97);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:4px;box-shadow:0 4px 16px rgba(0,0,0,0.5);display:flex;flex-direction:column;gap:2px;min-width:160px}',
            '.ra-point-menu button{background:transparent;border:none;color:#e8eaf0;font-size:12px;padding:7px 12px;border-radius:5px;cursor:pointer;text-align:left;white-space:nowrap}',
            '.ra-point-menu button:hover{background:rgba(255,255,255,0.08)}',
            '.ra-point-menu .menu-danger:hover{background:rgba(239,68,68,0.15);color:#f87171}',
            '@media(max-width:600px){',
            '.ra-main-row{flex-direction:column;align-items:stretch}',
            '.ra-fields{flex-direction:column}',
            '.ra-field{flex:none;width:100%}',
            '.ra-input{width:100%}',
            '.ra-actions{width:100%;margin-top:4px}',
            '.ra-btn-primary,.ra-btn-secondary{flex:1;text-align:center}',
            '}'
        ].join('');
        document.head.appendChild(style);
    }

    // ──────────────────────────────────────────────────────
    // DOM
    // ──────────────────────────────────────────────────────
    function _buildDOM() {
        var bell = document.createElement('div');
        bell.id = 'ra-bell';
        bell.innerHTML = '<svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg><span id="ra-badge"></span>';
        bell.onclick = function () {
            // Сворачиваем боковую панель
            var panelBody = document.getElementById('panelBody');
            if (panelBody && panelBody.style.display !== 'none') {
                document.getElementById('panelToggle').innerHTML = '&#9660;';
                panelBody.style.display = 'none';
            }
            if (_current) {
                openModal(_current.id);
            } else if (_allIds.length > 0) {
                // Грузим маршрут по текущему индексу (или первый)
                var idx = Math.min(_currentIdx, _allIds.length - 1);
                _fetchRoute(_allIds[Math.max(idx, 0)]);
            }
        };
        document.body.appendChild(bell);

        var panel = document.createElement('div');
        panel.id = 'ra-panel';
        panel.innerHTML = [
            '<div class="ra-meta-row"><span id="ra-route-time"></span><span id="ra-counter"></span></div>',
            '<div class="ra-main-row">',
            '  <div class="ra-fields">',
            '    <div class="ra-field"><div class="ra-label">Откуда</div>',
            '      <div class="ra-input-wrap"><input class="ra-input" id="ra-origin" type="text" placeholder="Пункт А"><div id="ra-suggest-origin"></div></div>',
            '    </div>',
            '    <div class="ra-field"><div class="ra-label">Куда</div>',
            '      <div class="ra-input-wrap"><input class="ra-input" id="ra-destination" type="text" placeholder="Пункт Б"><div id="ra-suggest-destination"></div></div>',
            '    </div>',
            '  </div>',
            '  <div class="ra-actions">',
            '    <button class="ra-btn-secondary" id="ra-skip">Пропустить</button>',
            '    <button class="ra-btn-reset"     id="ra-reset">&#8635; Сбросить</button>',
            '    <button class="ra-btn-danger"    id="ra-delete">Удалить</button>',
            '    <button class="ra-btn-primary"   id="ra-approve">Сохранить</button>',
            '  </div>',
            '</div>'
        ].join('');
        document.body.appendChild(panel);

        document.getElementById('ra-skip').onclick    = skip;
        document.getElementById('ra-approve').onclick = approve;
        document.getElementById('ra-delete').onclick  = deleteRoute;
        document.getElementById('ra-reset').onclick   = resetEditor;

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && _current) close();
        });

        history.pushState({ ra: true }, '');
        window.addEventListener('popstate', function () {
            if (_current) { close(); history.pushState({ ra: true }, ''); }
        });
    }

    // ──────────────────────────────────────────────────────
    // Загрузить маршрут с сервера (id = null → первый)
    // ──────────────────────────────────────────────────────
    function _fetchRoute(id, onDone) {
        var url = '/Home/GetNextRoute' + (id ? '?id=' + id : '');
        fetch(url)
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (!data || !data.route) {
                    _updateBell();
                    return;
                }
                if (Array.isArray(data.allIds)) _allIds = data.allIds;
                _currentIdx = _allIds.indexOf(data.route.id);
                _current    = data.route;
                _updateBell();
                if (onDone) onDone();
            })
            .catch(function (e) { console.error('GetNextRoute:', e); });
    }

    // ──────────────────────────────────────────────────────
    // Колокольчик
    // ──────────────────────────────────────────────────────
    function _updateBell() {
        var bell  = document.getElementById('ra-bell');
        var badge = document.getElementById('ra-badge');
        var count = _allIds.length;
        if (count > 0) {
            bell.classList.add('active');
            badge.textContent = count > 9 ? '9+' : count;
        } else {
            bell.classList.remove('active');
        }
    }

    // ──────────────────────────────────────────────────────
    // Открыть панель с маршрутом
    // ──────────────────────────────────────────────────────
    var _PREVIEW_ID = '__ra_preview__';

    function openModal(id) {
        if (!_current || _current.id !== id) return;

        document.getElementById('ra-counter').textContent    = (_currentIdx + 1) + ' / ' + _allIds.length;
        document.getElementById('ra-route-time').textContent = _fmtDate(_current.start) + ' \u00b7 ' + _current.duration + ' \u00b7 ' + _current.points + ' \u0442\u043e\u0447\u0435\u043a';

        _setField('origin',      _current.origin,      _current.suggestedOrigin);
        _setField('destination', _current.destination, _current.suggestedDestination);

        _previewOnMap(_current);

        document.getElementById('ra-bell').style.display = 'none';
        document.getElementById('ra-panel').classList.add('visible');
    }

    // ──────────────────────────────────────────────────────
    // Предпросмотр + редактор на карте
    // ──────────────────────────────────────────────────────
    var _pins      = [];
    var _animFrame = null;

    function _previewOnMap(route) {
        var daySelect = document.getElementById('daySelect');
        if (daySelect) {
            RouteManager.getRoutesForDay(daySelect.value)
                .forEach(function (r) { RouteManager.toggleRoute(r.id, false); });
        }

        if (_animFrame) { cancelAnimationFrame(_animFrame); _animFrame = null; }
        RouteManager.removeRoute(_PREVIEW_ID);
        _removePins();
        _clearEditor();

        if (!route.coordinates || !route.coordinates.length) {
            console.warn('RouteApproval: маршрут без координат', route);
            return;
        }

        // Инициализируем состояние редактора
        _editorCoords  = route.coordinates.slice(); // [[id, lat, lng], ...]
        _origCoords    = route.coordinates.slice();
        _deletedIds    = [];
        _movedPoints   = [];
        _splitPointId  = null;

        var latLngs = _editorCoords.map(function (c) { return [c[1], c[2]]; });

        RouteManager.fitTo(latLngs);
        _addPin(latLngs[0],                 'А', '#2ecc71', _fmtTime(route.start));
        _addPin(latLngs[latLngs.length - 1], 'Б', '#e74c3c', _fmtTime(route.end));

        _animateRoute(latLngs, '#4f8ef7', function () {
            _redrawEditor();
        });
    }

    // ──────────────────────────────────────────────────────
    // Редактор маршрута
    // ──────────────────────────────────────────────────────
    function _addMidMarker(idx) {
        var c   = _editorCoords[idx];
        var map = RouteManager.getMap();

        var isSplit = (_splitPointId !== null && c[0] === _splitPointId);
        var dotColor = isSplit ? '#9ca3af' : '#4f8ef7';

        var layout = ymaps.templateLayoutFactory.createClass(
            '<div style="width:12px;height:12px;border-radius:50%;background:' + dotColor + ';'
            + 'border:2px solid #fff;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,0.4);'
            + 'position:absolute;transform:translate(-50%,-50%)"></div>'
        );

        var pm = new ymaps.Placemark([c[1], c[2]], {}, {
            iconLayout: layout,
            iconShape:  { type: 'Circle', coordinates: [0, 0], radius: 10 }
        });

        (function (pointIdx, pointId) {
            pm.events.add('click', function (e) {
                e.preventDefault();
                var domEvent = e.get('domEvent');
                var clientX = domEvent.get('clientX');
                var clientY = domEvent.get('clientY');
                _showPointMenu(clientX, clientY, pointIdx, pointId);
            });
        }(idx, c[0]));

        map.geoObjects.add(pm);
        _editorMarkers.push({ pm: pm, idx: idx });
    }

    function _showPointMenu(x, y, idx, pointId) {
        _closePointMenu();

        var menu = document.createElement('div');
        menu.className = 'ra-point-menu';
        menu.style.left = (x + 14) + 'px';
        menu.style.top  = (y - 10) + 'px';

        function btn(label, cls, fn) {
            var b = document.createElement('button');
            if (cls) b.className = cls;
            b.textContent = label;
            b.onclick = function () { _closePointMenu(); fn(); };
            menu.appendChild(b);
        }

        btn('Удалить точку', 'menu-danger', function () { _deletePoint(idx, pointId); });
        btn('Разделить маршрут', '', function () { _splitRoute(idx, pointId); });
        btn('Удалить начало (до этой)', '', function () { _trimStart(idx); });
        btn('Удалить конец (с этой)', '', function () { _trimEnd(idx); });

        document.body.appendChild(menu);
        _pointMenu = menu;

        // Закрыть при клике вне меню
        setTimeout(function () {
            document.addEventListener('click', _closePointMenu, { once: true });
        }, 0);
    }

    function _closePointMenu() {
        if (_pointMenu) { _pointMenu.remove(); _pointMenu = null; }
    }

    function _deletePoint(idx, pointId) {
        _deletedIds.push(pointId);
        // Если удаляем точку разделения — сбрасываем split
        if (_splitPointId === pointId) _splitPointId = null;
        _editorCoords.splice(idx, 1);
        _redrawEditor();
    }

    // ──────────────────────────────────────────────────────
    // Разделить маршрут в точке idx
    // ──────────────────────────────────────────────────────
    function _splitRoute(idx, pointId) {
        _splitPointId = pointId;
        _redrawEditor();
    }

    // ──────────────────────────────────────────────────────
    // Удалить все точки с начала до idx (не включая idx)
    // ──────────────────────────────────────────────────────
    function _trimStart(idx) {
        var removed = _editorCoords.splice(0, idx);
        removed.forEach(function (c) { _deletedIds.push(c[0]); });
        if (_splitPointId !== null) {
            var stillHas = _editorCoords.find(function (c) { return c[0] === _splitPointId; });
            if (!stillHas) _splitPointId = null;
        }
        _redrawEditor();
    }

    // ──────────────────────────────────────────────────────
    // Удалить все точки с idx+1 до конца
    // ──────────────────────────────────────────────────────
    function _trimEnd(idx) {
        var removed = _editorCoords.splice(idx + 1);
        removed.forEach(function (c) { _deletedIds.push(c[0]); });
        if (_splitPointId !== null) {
            var stillHas = _editorCoords.find(function (c) { return c[0] === _splitPointId; });
            if (!stillHas) _splitPointId = null;
        }
        _redrawEditor();
    }

    // ──────────────────────────────────────────────────────
    // Сбросить редактор к исходному состоянию
    // ──────────────────────────────────────────────────────
    function resetEditor() {
        _editorCoords  = _origCoords.slice();
        _deletedIds    = [];
        _movedPoints   = [];
        _splitPointId  = null;
        _removePins();

        var latLngs = _editorCoords.map(function (c) { return [c[1], c[2]]; });
        _addPin(latLngs[0],                  'А', '#2ecc71', _fmtTime(_current.start));
        _addPin(latLngs[latLngs.length - 1], 'Б', '#e74c3c', _fmtTime(_current.end));

        _redrawEditor();
    }

    // ──────────────────────────────────────────────────────
    // Перерисовать редактор (полилайн + маркеры)
    // ──────────────────────────────────────────────────────
    function _redrawEditor() {
        if (!_current) return;  // маршрут мог быть сброшен пока шла анимация
        _clearEditor();
        var map = RouteManager.getMap();

        var splitIdx = _splitPointId
            ? _editorCoords.findIndex(function (c) { return c[0] === _splitPointId; })
            : -1;

        var part1 = _editorCoords.slice(0, splitIdx >= 0 ? splitIdx + 1 : _editorCoords.length);
        var part2 = splitIdx >= 0 ? _editorCoords.slice(splitIdx) : [];

        var ll1 = part1.map(function (c) { return [c[1], c[2]]; });
        var ll2 = part2.map(function (c) { return [c[1], c[2]]; });

        // Основной полилайн
        _editorPolyline = new ymaps.Polyline(ll1, {}, {
            strokeColor: '#4f8ef7', strokeWidth: 5, strokeOpacity: 0.85
        });
        map.geoObjects.add(_editorPolyline);
        RouteManager._setPreviewPolyline(_editorPolyline);

        // Серая часть после разделения
        if (ll2.length > 1) {
            _editorPolyline2 = new ymaps.Polyline(ll2, {}, {
                strokeColor: '#6b7280', strokeWidth: 5, strokeOpacity: 0.6
            });
            map.geoObjects.add(_editorPolyline2);
        }

        // Переносим пин Б в точку разделения
        _removePins();
        var allLL = _editorCoords.map(function (c) { return [c[1], c[2]]; });
        _addPin(allLL[0], 'А', '#2ecc71', _fmtTime(_current.start));
        if (splitIdx >= 0) {
            _addPin(ll1[ll1.length - 1], 'Б', '#e74c3c', _fmtTime(_current.end));
        } else {
            _addPin(allLL[allLL.length - 1], 'Б', '#e74c3c', _fmtTime(_current.end));
        }

        // Маркеры промежуточных точек
        for (var i = 1; i < _editorCoords.length - 1; i++) _addMidMarker(i);
        _addDragMarker(0,                          '#2ecc71');
        _addDragMarker(_editorCoords.length - 1,    '#e74c3c');
    }

    function _addDragMarker(idx, color) {
        var c   = _editorCoords[idx];
        var map = RouteManager.getMap();

        var layout = ymaps.templateLayoutFactory.createClass(
            '<div style="width:18px;height:18px;border-radius:50%;background:' + color + ';'
            + 'border:3px solid #fff;cursor:grab;box-shadow:0 2px 6px rgba(0,0,0,0.5);'
            + 'position:absolute;transform:translate(-50%,-50%)"></div>'
        );

        var pm = new ymaps.Placemark([c[1], c[2]], {}, {
            iconLayout:  layout,
            iconShape:   { type: 'Circle', coordinates: [0, 0], radius: 12 },
            draggable:   true
        });

        (function (pointIdx) {
            pm.events.add('dragend', function () {
                var newCoords = pm.geometry.getCoordinates();
                _editorCoords[pointIdx][1] = newCoords[0];
                _editorCoords[pointIdx][2] = newCoords[1];

                // Обновляем movedPoints
                var existing = _movedPoints.find(function (p) { return p.id === _editorCoords[pointIdx][0]; });
                if (existing) {
                    existing.lat = newCoords[0];
                    existing.lng = newCoords[1];
                } else {
                    _movedPoints.push({ id: _editorCoords[pointIdx][0], lat: newCoords[0], lng: newCoords[1] });
                }

                // Обновляем полилайн
                var latLngs = _editorCoords.map(function (cc) { return [cc[1], cc[2]]; });
                _editorPolyline.geometry.setCoordinates(latLngs);
            });
        }(idx));

        map.geoObjects.add(pm);
        _dragMarkers.push(pm);
    }

    function _clearEditor() {
        var map = RouteManager.getMap();
        if (!map) return;
        _editorMarkers.forEach(function (m) { map.geoObjects.remove(m.pm); });
        _editorMarkers = [];
        _dragMarkers.forEach(function (m) { map.geoObjects.remove(m); });
        _dragMarkers = [];
        if (_editorPolyline)  { map.geoObjects.remove(_editorPolyline);  _editorPolyline  = null; }
        if (_editorPolyline2) { map.geoObjects.remove(_editorPolyline2); _editorPolyline2 = null; }
    }

    // ──────────────────────────────────────────────────────
    // Пины А и Б
    // ──────────────────────────────────────────────────────
    function _addPin(coords, label, color, time) {
        if (!RouteManager.getMap()) return;
        var layout = ymaps.templateLayoutFactory.createClass(
            '<div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);text-align:center;white-space:nowrap">'
            + '<div style="background:' + color + ';color:#fff;font-size:13px;font-weight:700;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.45);margin:0 auto">' + label + '</div>'
            + (time ? '<div style="font-size:11px;font-weight:600;color:#fff;background:rgba(0,0,0,0.6);border-radius:4px;padding:2px 6px;margin-top:4px;display:inline-block">' + time + '</div>' : '')
            + '</div>'
        );
        var height = time ? 58 : 34;
        var pm = new ymaps.Placemark(coords, { balloonContent: label + (time ? ' \u00b7 ' + time : '') }, {
            iconLayout: layout,
            iconShape:  { type: 'Rectangle', coordinates: [[-15, -height], [15, 0]] }
        });
        RouteManager.getMap().geoObjects.add(pm);
        _pins.push(pm);
    }

    function _removePins() {
        if (typeof ymaps === 'undefined') return;
        _pins.forEach(function (pm) { RouteManager.getMap().geoObjects.remove(pm); });
        _pins = [];
    }

    // ──────────────────────────────────────────────────────
    // Форматирование дат
    // ──────────────────────────────────────────────────────
    var _months = ['\u044f\u043d\u0432\u0430\u0440\u044f','\u0444\u0435\u0432\u0440\u0430\u043b\u044f','\u043c\u0430\u0440\u0442\u0430','\u0430\u043f\u0440\u0435\u043b\u044f','\u043c\u0430\u044f','\u0438\u044e\u043d\u044f','\u0438\u044e\u043b\u044f','\u0430\u0432\u0433\u0443\u0441\u0442\u0430','\u0441\u0435\u043d\u0442\u044f\u0431\u0440\u044f','\u043e\u043a\u0442\u044f\u0431\u0440\u044f','\u043d\u043e\u044f\u0431\u0440\u044f','\u0434\u0435\u043a\u0430\u0431\u0440\u044f'];

    function _fmtDate(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        return d.getDate() + ' ' + _months[d.getMonth()] + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
    }

    function _fmtTime(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
    }

    // ──────────────────────────────────────────────────────
    // Анимация маршрута за 3 секунды, callback по завершению
    // ──────────────────────────────────────────────────────
    function _animateRoute(latLngs, color, onDone) {
        if (_animFrame) cancelAnimationFrame(_animFrame);

        var map      = RouteManager.getMap();
        var duration = 3000;
        var startTs  = null;
        var total    = latLngs.length;

        var polyline = new ymaps.Polyline([], {}, {
            strokeColor: color || '#4f8ef7', strokeWidth: 5, strokeOpacity: 0.85
        });
        map.geoObjects.add(polyline);
        RouteManager._setPreviewPolyline(polyline);

        function step(ts) {
            if (!startTs) startTs = ts;
            var progress = Math.min((ts - startTs) / duration, 1);
            var count    = Math.max(2, Math.round(progress * total));
            polyline.geometry.setCoordinates(latLngs.slice(0, count));
            if (progress < 1) {
                _animFrame = requestAnimationFrame(step);
            } else {
                _animFrame = null;
                if (onDone) onDone();
            }
        }
        _animFrame = requestAnimationFrame(step);
    }

    // ──────────────────────────────────────────────────────
    // Восстановить маршруты дня
    // ──────────────────────────────────────────────────────
    function _restoreDay() {
        _clearEditor();
        RouteManager.removeRoute(_PREVIEW_ID);
        _removePins();
        var daySelect = document.getElementById('daySelect');
        if (daySelect) RouteManager.renderDay(daySelect.value);
    }

    // ──────────────────────────────────────────────────────
    // Поле ввода + подсказка
    // ──────────────────────────────────────────────────────
    function _setField(field, value, suggestion) {
        var input     = document.getElementById('ra-' + field);
        var suggestEl = document.getElementById('ra-suggest-' + field);
        input.value         = value || '';
        suggestEl.innerHTML = '';
        if (suggestion && suggestion !== value) {
            var chip = document.createElement('div');
            chip.className   = 'ra-chip';
            chip.textContent = '\u2756 ' + suggestion;
            chip.onclick = (function (s, inp, el) {
                return function () { inp.value = s; el.innerHTML = ''; };
            }(suggestion, input, suggestEl));
            suggestEl.appendChild(chip);
        }
    }

    // ──────────────────────────────────────────────────────
    // Удалить маршрут
    // ──────────────────────────────────────────────────────
    function deleteRoute() {
        if (!_current) return;
        var id = _current.id;
        fetch('/Home/DeleteRoute?id=' + id, { method: 'GET' })
            .then(function () { _goNext(); })
            .catch(function (e) { console.error('DeleteRoute:', e); });
    }

    // ──────────────────────────────────────────────────────
    // Сохранить маршрут
    // ──────────────────────────────────────────────────────
    function approve() {
        if (!_current) return;
        var payload = {
            id:             _current.id,
            origin:         document.getElementById('ra-origin').value,
            destination:    document.getElementById('ra-destination').value,
            deletedPointIds: _deletedIds,
            movedPoints:    _movedPoints,
            splitPointId: _splitPointId ?? ""
        };
        fetch('/Home/AproveRoute', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload)
        })
        .then(function () { _goNext(); })
        .catch(function (e) { console.error('AproveRoute:', e); });
    }

    // ──────────────────────────────────────────────────────
    // Пропустить — запросить следующий, не удаляя из очереди
    // ──────────────────────────────────────────────────────
    function skip() {
        var nextIdx = _currentIdx + 1;
        _restoreDay();
        _current = null;
        if (nextIdx < _allIds.length) {
            _fetchRoute(_allIds[nextIdx], function () { openModal(_current.id); });
        } else {
            _closePanel();
        }
    }

    // ──────────────────────────────────────────────────────
    // После сохранения — следующий маршрут
    // ──────────────────────────────────────────────────────
    function _goNext() {
        _allIds.splice(_currentIdx, 1);
        _current = null;
        if (_allIds.length > 0) {
            var nextId = _allIds[Math.min(_currentIdx, _allIds.length - 1)];
            _fetchRoute(nextId, function () { openModal(_current.id); });
        } else {
            _closePanel();
        }
    }

    // ──────────────────────────────────────────────────────
    // Закрыть панель без действий (маршрут остаётся в очереди)
    // ──────────────────────────────────────────────────────
    function close() {
        if (!_current) return;
        _restoreDay();
        _current = null;
        document.getElementById('ra-panel').classList.remove('visible');
        _updateBell();
    }

    function _closePanel() {
        _current = null;
        _restoreDay();
        document.getElementById('ra-panel').classList.remove('visible');
        _updateBell();
    }

    // ──────────────────────────────────────────────────────
    // Публичный интерфейс
    // ──────────────────────────────────────────────────────
    return {
        start:     start,
        openModal: openModal,
        approve:   approve,
        skip:      skip,
        close:     close
    };

}());

// ============================================================
// HEATMAP LAYER — тепловая карта исторических точек
// ============================================================

var HeatmapLayer = (function () {
    var _heatmap = null;
    var _active = false;

    // ──────────────────────────────────────────────────────
    // Переключить тепловую карту
    // ──────────────────────────────────────────────────────
    function toggle() {
        var btn = document.getElementById('heatmapToggle');
        if (_active) {
            _hide();
            if (btn) {
                btn.textContent = '🌡 Тепловая карта';
                btn.style.background = '#fff';
            }
        } else {
            if (_heatmap) {
                _show();
                if (btn) {
                    btn.textContent = '✕ Скрыть карту';
                    btn.style.background = '#fef3c7';
                }
            } else {
                if (btn) {
                    btn.textContent = '⏳ Загрузка...';
                    btn.disabled = true;
                }
                _load(function () {
                    if (btn) {
                        btn.textContent = '✕ Скрыть карту';
                        btn.style.background = '#fef3c7';
                        btn.disabled = false;
                    }
                });
            }
        }
    }

    // ──────────────────────────────────────────────────────
    // Загрузить точки и построить heatmap (актуальная версия)
    // ──────────────────────────────────────────────────────
    function _load(onDone) {
        console.log('[Heatmap] fetch start');
        fetch('/Home/HeatmapPoints')
            .then(function (r) { return r.json(); })
            .then(function (points) {
                console.log('[Heatmap] points loaded:', points.length);

                if (!ymaps || !ymaps.modules) {
                    console.error('[Heatmap] ymaps.modules недоступен');
                    _resetButton();
                    return;
                }

                ymaps.modules.require(['Heatmap'], function (HeatmapModule) {
                    console.log('[Heatmap] module loaded');

                    // Преобразуем точки в GeoJSON (ВАЖНО: [lng, lat]!)
                    var features = points.map(function (p) {
                        return {
                            id: p.id || Math.random().toString(36),
                            type: 'Feature',
                            geometry: {
                                type: 'Point',
                                coordinates: [p.lat, p.lng]   // ← исправлено!
                            },
                            properties: {
                                weight: p.weight || 1
                            }
                        };
                    });

                    var data = {
                        type: 'FeatureCollection',
                        features: features
                    };

                    var options = {
                        radius: 20,
                        dissipating: false,
                        opacity: 0.8,
                        intensityOfMidpoint: 0.2,
                        gradient: {
                            0.0: 'rgba(0, 0, 255, 0)',
                            0.3: 'rgba(0, 255, 255, 0.6)',
                            0.6: 'rgba(0, 255, 0, 0.8)',
                            0.8: 'rgba(255, 165, 0, 0.9)',
                            1.0: 'rgba(255, 0, 0, 1)'
                        }
                    };

                    _heatmap = new HeatmapModule(data, options);

                    _show();
                    if (onDone) onDone();
                }, function (err) {
                    console.error('[Heatmap] модуль не загружен:', err);
                    console.warn('[Heatmap] Убедитесь, что подключён heatmap.min.js (см. выше)');
                    _resetButton();
                });
            })
            .catch(function (e) {
                console.error('[Heatmap] ошибка загрузки точек:', e);
                _resetButton();
            });
    }

    function _show() {
        if (_heatmap) {
            _heatmap.setMap(RouteManager.getMap());
            _active = true;
        }
    }

    function _hide() {
        if (_heatmap) {
            _heatmap.setMap(null);
            _active = false;
        }
    }

    function _resetButton() {
        var btn = document.getElementById('heatmapToggle');
        if (btn) {
            btn.textContent = '🌡 Тепловая карта';
            btn.disabled = false;
        }
    }

    return { toggle: toggle };
}());

// ============================================================
// ЗАПУСК
// ============================================================
RouteManager.init('map');
