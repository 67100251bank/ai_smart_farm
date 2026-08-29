/* ลงทะเบียน service worker — ล้อมด้วย try/catch เพราะเปิดจากไฟล์ในเครื่อง (file://) จะทำไม่ได้ */
(function () {
  try {
    if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () {});
      });
    }
  } catch (e) {}
})();
