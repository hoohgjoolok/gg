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
