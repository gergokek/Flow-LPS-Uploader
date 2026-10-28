(function () {
  const started = Date.now();
  function show(message) {
    const output = document.getElementById('authResult');
    if (output && output.textContent === 'Bejelentkezés előkészítése...') {
      output.textContent = message;
    }
  }
  window.addEventListener('error', function (event) {
    if (event.target && event.target !== window) {
      show('A bejelentkezési JavaScript-fájl vagy egy szükséges erőforrás nem töltődött be. Ellenőrizd a GitHub Pages build állapotát, és frissítsd az oldalt.');
    } else {
      show('JavaScript-indítási hiba. Ellenőrizd a böngésző konzolját: ' + String(event.message || 'ismeretlen hiba').slice(0,180));
    }
  }, true);
  window.addEventListener('unhandledrejection', function () {
    show('A bejelentkezési modul indulásakor hiba történt. Ellenőrizd a GitHub Pages buildet és a böngésző konzolját.');
  });
  window.addEventListener('DOMContentLoaded', function () {
    window.setTimeout(function () {
      if (!window.__flowAuthBooted) {
        show('A bejelentkezési modul nem indult el 12 másodpercen belül. Ellenőrizd a GitHub Actions legutóbbi sikeres telepítését és a böngésző konzolját. Az oldal nem próbált SharePointot módosítani.');
      }
    }, 12000);
  });
})();
