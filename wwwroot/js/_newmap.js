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
    // Публичный метод: отрисовать день
    // ──────────────────────────────────────────────────────
    function renderDay(dateStr) {
        Object.keys(_polylines).map(Number).forEach(function (id) { removeRoute(id); });

        var routes = getRoutesForDay(dateStr);
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
    // Публичный интерфейс
    // ──────────────────────────────────────────────────────
    return {
        init:            init,
        addRoute:        addRoute,
        removeRoute:     removeRoute,
        getRoutesForDay: getRoutesForDay,
        renderDay:       renderDay,
        toggleRoute:     toggleRoute
    };

}());

// ============================================================
// ROUTE APPROVAL — уведомления и подтверждение маршрутов
// ============================================================

var RouteApproval = (function () {

    var _queue   = [];
    var _current = null;

    // ──────────────────────────────────────────────────────
    // Запуск: строим DOM и начинаем опрос
    // ──────────────────────────────────────────────────────
    function start() {
        _buildStyles();
        _buildDOM();
        _poll();
        setInterval(_poll, 30000);
    }

    // ──────────────────────────────────────────────────────
    // Инъекция стилей
    // ──────────────────────────────────────────────────────
    function _buildStyles() {
        var style = document.createElement('style');
        style.textContent = [
            '#route-notifications{position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:8px;width:320px;pointer-events:none}',
            '.route-toast{background:rgba(15,17,23,0.95);border:1px solid rgba(255,255,255,0.1);border-left:2px solid #4f8ef7;border-radius:8px;padding:12px 16px;pointer-events:all;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:12px;color:#e8eaf0;font-size:13px;backdrop-filter:blur(8px);transition:opacity .2s,transform .2s;animation:ra-in .25s ease}',
            '.route-toast:hover{border-left-color:#7eb3ff}',
            '.route-toast.removing{opacity:0;transform:translateX(12px)}',
            '.toast-info{flex:1;min-width:0}',
            '.toast-route{font-weight:600;font-size:12px;color:#4f8ef7;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
            '.toast-time{font-size:11px;color:#6b7280}',
            '.toast-btn{background:#4f8ef7;color:#fff;border:none;border-radius:5px;padding:5px 10px;font-size:11px;cursor:pointer;white-space:nowrap;flex-shrink:0}',
            '.toast-btn:hover{background:#7eb3ff}',
            '#ra-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);backdrop-filter:blur(3px);z-index:10000;display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity .2s}',
            '#ra-overlay.visible{opacity:1;pointer-events:all}',
            '.ra-modal{background:#1a1d27;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:24px;width:420px;max-width:95vw;color:#e8eaf0;font-size:13px}',
            '.ra-modal-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px}',
            '.ra-modal-title{font-weight:700;font-size:14px}',
            '.ra-counter{font-size:11px;color:#6b7280}',
            '.ra-meta{background:rgba(255,255,255,0.04);border-radius:6px;padding:10px 12px;margin-bottom:18px;font-size:12px;color:#6b7280;display:flex;gap:16px}',
            '.ra-meta b{color:#e8eaf0}',
            '.ra-field{margin-bottom:14px}',
            '.ra-label{font-size:11px;color:#6b7280;margin-bottom:5px;text-transform:uppercase;letter-spacing:.5px}',
            '.ra-input{width:100%;background:#12141c;border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:9px 12px;color:#e8eaf0;font-size:13px;outline:none;box-sizing:border-box;transition:border-color .15s}',
            '.ra-input:focus{border-color:#4f8ef7}',
            '.ra-chip{display:inline-flex;align-items:center;gap:5px;margin-top:5px;padding:4px 10px;background:rgba(79,142,247,0.1);border:1px solid rgba(79,142,247,0.25);border-radius:4px;font-size:11px;color:#4f8ef7;cursor:pointer;transition:background .15s}',
            '.ra-chip:hover{background:rgba(79,142,247,0.2)}',
            '.ra-actions{display:flex;gap:8px;margin-top:20px}',
            '.ra-btn-primary{flex:1;background:#4f8ef7;color:#fff;border:none;border-radius:6px;padding:10px;font-size:13px;font-weight:600;cursor:pointer;transition:background .15s}',
            '.ra-btn-primary:hover{background:#7eb3ff}',
            '.ra-btn-secondary{background:transparent;color:#6b7280;border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:10px 16px;font-size:13px;cursor:pointer;transition:color .15s}',
            '.ra-btn-secondary:hover{color:#e8eaf0}',
            '@keyframes ra-in{from{opacity:0;transform:translateX(12px)}to{opacity:1;transform:translateX(0)}}'
        ].join('');
        document.head.appendChild(style);
    }

    // ──────────────────────────────────────────────────────
    // Построение DOM
    // ──────────────────────────────────────────────────────
    function _buildDOM() {
        // Контейнер тостов
        var notif = document.createElement('div');
        notif.id = 'route-notifications';
        document.body.appendChild(notif);

        // Оверлей модала
        var overlay = document.createElement('div');
        overlay.id = 'ra-overlay';
        overlay.innerHTML = [
            '<div class="ra-modal">',
            '  <div class="ra-modal-header">',
            '    <span class="ra-modal-title">Новый маршрут</span>',
            '    <span class="ra-counter" id="ra-counter"></span>',
            '  </div>',
            '  <div class="ra-meta" id="ra-meta"></div>',
            '  <div class="ra-field">',
            '    <div class="ra-label">Откуда</div>',
            '    <input class="ra-input" id="ra-origin" type="text" placeholder="Пункт А">',
            '    <div id="ra-suggest-origin"></div>',
            '  </div>',
            '  <div class="ra-field">',
            '    <div class="ra-label">Куда</div>',
            '    <input class="ra-input" id="ra-destination" type="text" placeholder="Пункт Б">',
            '    <div id="ra-suggest-destination"></div>',
            '  </div>',
            '  <div class="ra-actions">',
            '    <button class="ra-btn-secondary" id="ra-skip">Пропустить</button>',
            '    <button class="ra-btn-primary"   id="ra-approve">Сохранить</button>',
            '  </div>',
            '</div>'
        ].join('');
        document.body.appendChild(overlay);

        document.getElementById('ra-skip').onclick    = skip;
        document.getElementById('ra-approve').onclick = approve;
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
                _showToasts();
            })
            .catch(function (e) { console.error('GetNewRoutes:', e); });
    }

    // ──────────────────────────────────────────────────────
    // Тосты
    // ──────────────────────────────────────────────────────
    function _showToasts() {
        var container = document.getElementById('route-notifications');
        container.innerHTML = '';

        _queue.slice(0, 5).forEach(function (route) {
            var el = document.createElement('div');
            el.className = 'route-toast';
            el.innerHTML =
                '<div class="toast-info">'
                + '<div class="toast-route">' + (route.origin || '?') + ' \u2192 ' + (route.destination || '?') + '</div>'
                + '<div class="toast-time">' + route.date + ' \u00b7 ' + route.duration + '</div>'
                + '</div>'
                + '<button class="toast-btn">Уточнить</button>';

            el.querySelector('.toast-btn').onclick = (function (r) {
                return function () { openModal(r.id); };
            }(route));

            container.appendChild(el);
        });
    }

    // ──────────────────────────────────────────────────────
    // Открыть модал
    // ──────────────────────────────────────────────────────
    function openModal(id) {
        _current = _queue.find(function (r) { return r.id === id; });
        if (!_current) return;

        var idx = _queue.indexOf(_current);
        document.getElementById('ra-counter').textContent = (idx + 1) + ' / ' + _queue.length;
        document.getElementById('ra-meta').innerHTML =
            '<span>\uD83D\uDCC5 <b>' + _current.date + '</b></span>'
            + '<span>\u23F1 <b>' + _current.duration + '</b></span>'
            + '<span>\uD83D\uDCCD <b>' + _current.points + ' точек</b></span>';

        _setField('origin',      _current.origin,      _current.suggestedOrigin);
        _setField('destination', _current.destination, _current.suggestedDestination);

        document.getElementById('ra-overlay').classList.add('visible');
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
    // Пропустить маршрут
    // ──────────────────────────────────────────────────────
    function skip() {
        _removeFromQueue(_current && _current.id);
        _nextOrClose();
    }

    function _removeFromQueue(id) {
        _queue = _queue.filter(function (r) { return r.id !== id; });
        _showToasts();
    }

    function _nextOrClose() {
        if (_queue.length > 0) {
            openModal(_queue[0].id);
        } else {
            document.getElementById('ra-overlay').classList.remove('visible');
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
        skip:      skip
    };

}());

// ============================================================
// ЗАПУСК
// ============================================================
RouteManager.init('map');
