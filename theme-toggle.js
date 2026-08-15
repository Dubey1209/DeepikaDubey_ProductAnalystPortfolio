(function () {
  var toggleBtn = document.getElementById('theme-toggle');
  var icon = document.getElementById('theme-toggle-icon');

  function isDark() {
    return document.body.classList.contains('dark-theme');
  }

  function setTheme(dark) {
    document.body.classList.toggle('dark-theme', dark);
    if (icon) icon.textContent = dark ? '🌙' : '☀️';
    try {
      localStorage.setItem('theme', dark ? 'dark' : 'light');
    } catch (e) {}
  }

  if (icon) icon.textContent = isDark() ? '🌙' : '☀️';

  if (toggleBtn) {
    toggleBtn.addEventListener('click', function () {
      setTheme(!isDark());
    });
  }
})();
