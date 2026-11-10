/* The cross that closes the preview sits in the row of buttons under the frame, on the left of the layers symbol, on phones and on desktop (css: .vf-btns>.vf-close). The same button is moved, so every handler stays. */
(function () {
  function place() {
    var c = document.getElementById('vfClose'), f = document.getElementById('videoFrame'); if (!c || !f) return;
    var row = f.querySelector('.vf-btns'); if (row && c.parentNode !== row) row.insertBefore(c, row.firstChild);
  }
  document.addEventListener('DOMContentLoaded', place); place();
})();
