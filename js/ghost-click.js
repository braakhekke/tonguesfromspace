/* Touch screens: a control that sits on top of the page (the shrink/enlarge pill, the dock's fold tab, the full-screen exit, panes, sheets) often changes the layout when it is used, and the click that follows the tap then lands on whatever is now under the finger (a menu, a button). A click whose target has nothing to do with where the finger went up is swallowed, for a short moment after the touch. Real taps are never affected: their click target is the element the finger went up on, or its parent or child. */
(function () {
  var up = null, upT = 0;
  document.addEventListener('pointerup', function (e) { if (e.pointerType === 'mouse') return; up = e.target; upT = Date.now(); }, true);
  document.addEventListener('click', function (e) {
    if (!up || Date.now() - upT > 700 || e.detail === 0) return;      // detail 0: a keyboard or script click
    var t = e.target; if (t === up || (up.contains && up.contains(t)) || (t.contains && t.contains(up))) return;
    e.stopPropagation(); e.preventDefault();
  }, true);
})();
