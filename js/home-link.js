/* The way back to the front page (the region picker). Every page has a link marked data-home; this sets where it goes:
   "/" on the public site, home.html from the source tree. The public build gives this file a hashed name (home-link.1a2b3c4d5e.js), which is how it knows. */
(() => {
  const built = /home-link\.[0-9a-f]{10}\.js/.test(document.currentScript ? document.currentScript.src : '');
  document.querySelectorAll('a[data-home]').forEach(a => { a.setAttribute('href', built ? '/' : 'home.html'); });
  if (built) document.querySelectorAll('a[data-dash]').forEach(a => { a.setAttribute('href', '/switzerland/'); });      // index.html of the public build is the front page; the explorer is at the address of its region
})();
