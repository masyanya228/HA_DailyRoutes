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

        body.appendChild(dayLabel);
        body.appendChild(daySelect);
        body.appendChild(divider);
        body.appendChild(routeLabel);
        body.appendChild(routeList);
        body.appendChild(noMsg);

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
        //var from = { r: 245, g: 158, b: 11  }; // #f59e0b янтарь
        //var to = { r: 99, g: 102, b: 241 }; // #6366f1 индиго
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

    var _queue   = [];
    var _current = null;

    // ──────────────────────────────────────────────────────
    // Запуск: строим DOM и делаем единственный запрос
    // ──────────────────────────────────────────────────────
    function start() {
        _buildStyles();
        _buildDOM();
        _poll(); // единственный запрос при старте
    }

    // ──────────────────────────────────────────────────────
    // Инъекция стилей
    // ──────────────────────────────────────────────────────
    function _buildStyles() {
        var style = document.createElement('style');
        style.textContent = [
            // Иконка уведомления
            '#ra-bell{position:fixed;bottom:24px;right:24px;z-index:9999;width:44px;height:44px;background:rgba(15,17,23,0.95);border:1px solid rgba(255,255,255,0.1);border-radius:50%;display:none;align-items:center;justify-content:center;cursor:pointer;backdrop-filter:blur(8px);transition:transform .15s,background .15s;box-shadow:0 2px 12px rgba(0,0,0,0.4)}',
            '#ra-bell:hover{background:rgba(30,35,50,0.98);transform:scale(1.08)}',
            '#ra-bell svg{width:20px;height:20px;fill:none;stroke:#4f8ef7;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
            '#ra-badge{position:absolute;top:-4px;right:-4px;background:#4f8ef7;color:#fff;border-radius:50%;width:18px;height:18px;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;line-height:1}',
            '#ra-bell.active{display:flex}',
            // Нижняя панель
            '#ra-panel{position:fixed;bottom:0;left:0;right:0;z-index:9998;background:rgba(15,17,23,0.97);border-top:1px solid rgba(255,255,255,0.08);backdrop-filter:blur(10px);padding:14px 16px;transform:translateY(100%);transition:transform .25s ease;color:#e8eaf0;font-size:13px}',
            '#ra-panel.visible{transform:translateY(0)}',
            // Мета-строка (второстепенная)
            '.ra-meta-row{font-size:11px;color:#4b5563;margin-bottom:10px;display:flex;gap:12px}',
            // Основная строка: поля + кнопки в ряд на десктопе
            '.ra-main-row{display:flex;align-items:flex-end;gap:10px}',
            '.ra-fields{display:flex;gap:10px;flex:1;min-width:0}',
            '.ra-field{display:flex;flex-direction:column;gap:4px;flex:1;min-width:0}',            '.ra-label{font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px}',
            '.ra-input-wrap{display:flex;align-items:center;gap:6px}',
            '.ra-input{flex:1;background:#12141c;border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:9px 12px;color:#e8eaf0;font-size:14px;font-weight:500;outline:none;box-sizing:border-box;transition:border-color .15s;min-width:0;width:100%}',
            '.ra-input:focus{border-color:#4f8ef7}',
            '.ra-chip{display:inline-flex;align-items:center;padding:3px 8px;background:rgba(79,142,247,0.1);border:1px solid rgba(79,142,247,0.25);border-radius:4px;font-size:11px;color:#4f8ef7;cursor:pointer;white-space:nowrap;flex-shrink:0;transition:background .15s}',
            '.ra-chip:hover{background:rgba(79,142,247,0.2)}',
            // Кнопки — справа на десктопе, снизу на мобилке
            '.ra-actions{display:flex;gap:8px;flex-shrink:0;align-items:flex-end}',
            '.ra-btn-primary{background:#4f8ef7;color:#fff;border:none;border-radius:6px;padding:9px 20px;font-size:13px;font-weight:600;cursor:pointer;transition:background .15s;white-space:nowrap;height:38px}',
            '.ra-btn-primary:hover{background:#7eb3ff}',
            '.ra-btn-secondary{background:transparent;color:#6b7280;border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:9px 14px;font-size:13px;cursor:pointer;transition:color .15s;white-space:nowrap;height:38px}',
            '.ra-btn-secondary:hover{color:#e8eaf0}',
            // Мобилка: поля во всю ширину в 2 строки, кнопки снизу
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
    // Построение DOM
    // ──────────────────────────────────────────────────────
    function _buildDOM() {
        // Иконка-колокольчик
        var bell = document.createElement('div');
        bell.id = 'ra-bell';
        bell.innerHTML = [
            '<svg viewBox="0 0 24 24">',
            '  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>',
            '  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
            '</svg>',
            '<span id="ra-badge"></span>'
        ].join('');
        bell.onclick = function () {
            // Сворачиваем боковую панель
            var panelBody = document.getElementById('panelBody');
            if (panelBody && panelBody.style.display !== 'none') {
                document.getElementById('panelToggle').innerHTML = '&#9660;';
                panelBody.style.display = 'none';
            }
            var newest = _queue.slice().sort(function (a, b) {
                return new Date(b.start) - new Date(a.start);
            })[0];
            if (newest) openModal(newest.id);
        };
        document.body.appendChild(bell);

        // Нижняя панель
        var panel = document.createElement('div');
        panel.id = 'ra-panel';
        panel.innerHTML = [
            // Второстепенная информация
            '<div class="ra-meta-row">',
            '  <span id="ra-route-time"></span>',
            '  <span id="ra-counter"></span>',
            '</div>',
            // Основная строка
            '<div class="ra-main-row">',
            '  <div class="ra-fields">',
            '    <div class="ra-field">',
            '      <div class="ra-label">Откуда</div>',
            '      <div class="ra-input-wrap">',
            '        <input class="ra-input" id="ra-origin" type="text" placeholder="Пункт А">',
            '        <div id="ra-suggest-origin"></div>',
            '      </div>',
            '    </div>',
            '    <div class="ra-field">',
            '      <div class="ra-label">Куда</div>',
            '      <div class="ra-input-wrap">',
            '        <input class="ra-input" id="ra-destination" type="text" placeholder="Пункт Б">',
            '        <div id="ra-suggest-destination"></div>',
            '      </div>',
            '    </div>',
            '  </div>',
            '  <div class="ra-actions">',
            '    <button class="ra-btn-secondary" id="ra-skip">Пропустить</button>',
            '    <button class="ra-btn-primary"   id="ra-approve">Сохранить</button>',
            '  </div>',
            '</div>'
        ].join('');
        document.body.appendChild(panel);

        document.getElementById('ra-skip').onclick    = skip;
        document.getElementById('ra-approve').onclick = approve;

        // ESC
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && _current) close();
        });

        // Кнопка "Назад" браузера
        history.pushState({ ra: true }, '');
        window.addEventListener('popstate', function () {
            if (_current) {
                close(); // close() сам вызывает _updateBell — колокольчик появится
                history.pushState({ ra: true }, ''); // не уходим со страницы
            }
        });
    }

    // ──────────────────────────────────────────────────────
    // Опрос новых маршрутов
    // ──────────────────────────────────────────────────────
    function _poll() {
        fetch('/Home/GetNewRoutes')
            .then(function (r) { return r.json(); })
            .then(function (routes) {
                if (!Array.isArray(routes) || !routes.length) return;
                routes.forEach(function (r) {
                    if (!_queue.find(function (x) { return x.id === r.id; }))
                        _queue.push(r);
                });
                // Сортируем от свежих к старым
                _queue.sort(function (a, b) { return new Date(b.start) - new Date(a.start); });
                _updateBell();
            })
            .catch(function (e) { console.error('GetNewRoutes:', e); });
    }

    // ──────────────────────────────────────────────────────
    // Обновить иконку уведомления
    // ──────────────────────────────────────────────────────
    function _updateBell() {
        var bell  = document.getElementById('ra-bell');
        var badge = document.getElementById('ra-badge');
        if (_queue.length > 0) {
            bell.classList.add('active');
            badge.textContent = _queue.length > 9 ? '9+' : _queue.length;
        } else {
            bell.classList.remove('active');
        }
    }

    // ──────────────────────────────────────────────────────
    // Открыть панель
    // ──────────────────────────────────────────────────────
    var _PREVIEW_ID = '__ra_preview__';

    function openModal(id) {
        _current = _queue.find(function (r) { return r.id === id; });
        if (!_current) return;

        var idx = _queue.indexOf(_current);
        document.getElementById('ra-counter').textContent   = (idx + 1) + ' / ' + _queue.length;
        document.getElementById('ra-route-time').textContent = _fmtDate(_current.start) + ' \u00b7 ' + _current.duration + ' \u00b7 ' + _current.points + ' \u0442\u043e\u0447\u0435\u043a';

        _setField('origin',      _current.origin,      _current.suggestedOrigin);
        _setField('destination', _current.destination, _current.suggestedDestination);

        _previewOnMap(_current);

        document.getElementById('ra-bell').style.display = 'none'; // скрываем колокольчик
        document.getElementById('ra-panel').classList.add('visible');
    }

    // ──────────────────────────────────────────────────────
    // Предпросмотр маршрута на карте
    // ──────────────────────────────────────────────────────
    var _pins = [];

    function _previewOnMap(route) {
        var daySelect = document.getElementById('daySelect');
        if (daySelect) {
            RouteManager.getRoutesForDay(daySelect.value)
                .forEach(function (r) { RouteManager.toggleRoute(r.id, false); });
        }

        if (_animFrame) { cancelAnimationFrame(_animFrame); _animFrame = null; }
        RouteManager.removeRoute(_PREVIEW_ID);
        _removePins();

        if (!route.coordinates || !route.coordinates.length) {
            console.warn('RouteApproval: маршрут без координат', route);
            return;
        }

        var coords = route.coordinates;

        // 1. Fit карты
        RouteManager.fitTo(coords);

        // 2. Пины А и Б с временем отправления/прибытия
        _addPin(coords[0],             'А', '#2ecc71', _fmtTime(route.start));
        _addPin(coords[coords.length - 1], 'Б', '#e74c3c', _fmtTime(route.end));

        // 3. Анимированный маршрут
        _animateRoute(coords, '#4f8ef7');
    }

    function _addPin(coords, label, color, time) {
        if (!RouteManager.getMap()) return;

        var layout = ymaps.templateLayoutFactory.createClass(
            '<div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);text-align:center;white-space:nowrap">'
            + '<div style="background:' + color + ';color:#fff;font-size:13px;font-weight:700;'
            + 'width:30px;height:30px;border-radius:50%;display:flex;align-items:center;'
            + 'justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.45);margin:0 auto">'
            + label + '</div>'
            + (time ? '<div style="font-size:11px;font-weight:600;color:#fff;background:rgba(0,0,0,0.6);'
            + 'border-radius:4px;padding:2px 6px;margin-top:4px;display:inline-block">' + time + '</div>' : '')
            + '</div>'
        );

        var height = time ? 58 : 34; // высота иконки с учётом времени
        var pm = new ymaps.Placemark(coords,
            { balloonContent: label + (time ? ' · ' + time : '') },
            {
                iconLayout: layout,
                iconShape:  { type: 'Rectangle', coordinates: [[-15, -height], [15, 0]] }
            }
        );
        RouteManager.getMap().geoObjects.add(pm);
        _pins.push(pm);
    }

    // ──────────────────────────────────────────────────────
    // Форматирование дат
    // ──────────────────────────────────────────────────────
    var _months = ['января','февраля','марта','апреля','мая','июня',
                   'июля','августа','сентября','октября','ноября','декабря'];

    function _fmtDate(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        return d.getDate() + ' ' + _months[d.getMonth()] + ' '
             + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
    }

    function _fmtTime(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
    }

    // ──────────────────────────────────────────────────────
    // Анимация маршрута — рисуем точки постепенно за 3 сек
    // ──────────────────────────────────────────────────────
    var _animFrame = null;

    function _animateRoute(coords, color) {
        if (_animFrame) cancelAnimationFrame(_animFrame);

        var map      = RouteManager.getMap();
        var duration = 3000; // мс
        var start    = null;
        var total    = coords.length;

        // Начальная пустая линия
        var polyline = new ymaps.Polyline([], {}, {
            strokeColor:   color || '#4f8ef7',
            strokeWidth:   5,
            strokeOpacity: 0.85
        });
        map.geoObjects.add(polyline);

        // Сохраняем под _PREVIEW_ID чтобы removeRoute его убрал
        RouteManager._setPreviewPolyline(polyline);

        function step(timestamp) {
            if (!start) start = timestamp;
            var elapsed  = timestamp - start;
            var progress = Math.min(elapsed / duration, 1);
            var count    = Math.max(2, Math.round(progress * total));

            polyline.geometry.setCoordinates(coords.slice(0, count));

            if (progress < 1) {
                _animFrame = requestAnimationFrame(step);
            } else {
                _animFrame = null;
            }
        }

        _animFrame = requestAnimationFrame(step);
    }

    function _removePins() {
        if (typeof ymaps === 'undefined') return;
        _pins.forEach(function (pm) { RouteManager.getMap().geoObjects.remove(pm); });
        _pins = [];
    }

    // ──────────────────────────────────────────────────────
    // Восстановить маршруты выбранного дня
    // ──────────────────────────────────────────────────────
    function _restoreDay() {
        RouteManager.removeRoute(_PREVIEW_ID);
        _removePins();
        var daySelect = document.getElementById('daySelect');
        if (daySelect) RouteManager.renderDay(daySelect.value);
    }

    // ──────────────────────────────────────────────────────
    // Установить поле + подсказку
    // ──────────────────────────────────────────────────────
    function _setField(field, value, suggestion) {
        var input     = document.getElementById('ra-' + field);
        var suggestEl = document.getElementById('ra-suggest-' + field);

        input.value       = value || '';
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
    // Сохранить маршрут
    // ──────────────────────────────────────────────────────
    function approve() {
        if (!_current) return;
        var payload = {
            id:          _current.id,
            origin:      document.getElementById('ra-origin').value,
            destination: document.getElementById('ra-destination').value
        };
        fetch('/Home/AproveRoute', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload)
        })
        .then(function () {
            _removeFromQueue(_current.id);
            _nextOrClose();
        })
        .catch(function (e) { console.error('AproveRoute:', e); });
    }

    // ──────────────────────────────────────────────────────
    // Пропустить маршрут (убирает из очереди)
    // ──────────────────────────────────────────────────────
    function skip() {
        _removeFromQueue(_current && _current.id);
        _nextOrClose();
    }

    // ──────────────────────────────────────────────────────
    // Закрыть панель (маршрут остаётся в очереди)
    // ──────────────────────────────────────────────────────
    function close() {
        if (!_current) return;
        _restoreDay();
        document.getElementById('ra-panel').classList.remove('visible');
        _updateBell(); // возвращаем колокольчик (если очередь не пуста)
        _current = null;
    }

    function _removeFromQueue(id) {
        _queue = _queue.filter(function (r) { return r.id !== id; });
        _updateBell();
    }

    function _nextOrClose() {
        if (_queue.length > 0) {
            openModal(_queue[0].id);
        } else {
            _restoreDay();
            document.getElementById('ra-panel').classList.remove('visible');
            _updateBell(); // очередь пуста — колокольчик скроется сам
            _current = null;
        }
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
// ЗАПУСК
// ============================================================
RouteManager.init('map');
