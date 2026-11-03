/* Injected into the page by scripts/make_film.py while the new teaser ("Where the ice was") is recorded. Not part of the site.
   The film's own layer is deliberately small: one quiet line of text low on the picture, a year ticker, two year labels for the slider, a lower-third and an end card.
   No sheets, no red: white text on a soft dark gradient, ice blue for the accent. Sizes are css px of the 1280 x 720 page. */
(() => {
  const go = () => {
    if (window.F) return;
    const css = `
    #fl{position:fixed;inset:0;z-index:99990;pointer-events:none;font-family:'Schibsted Grotesk','Helvetica Neue',Arial,sans-serif;color:#fff;overflow:hidden}
    #fl .shade{position:absolute;left:0;right:0;bottom:0;height:34%;background:linear-gradient(to top,rgba(4,9,14,.72),rgba(4,9,14,0));opacity:0;transition:opacity .8s}
    #fl .shade.on{opacity:1}
    #fl .line{position:absolute;left:48px;bottom:56px;font-size:34px;line-height:1.12;font-weight:500;letter-spacing:-.01em;max-width:640px;opacity:0;transform:translateY(6px);transition:opacity .6s,transform .8s cubic-bezier(.2,.8,.2,1);text-shadow:0 1px 14px rgba(0,0,0,.35)}
    #fl .line.on{opacity:1;transform:none}
    #fl .tick{position:absolute;left:0;right:0;top:34px;text-align:center;font:500 54px 'DM Mono','SF Mono',ui-monospace,monospace;letter-spacing:.04em;font-variant-numeric:tabular-nums;opacity:0;transition:opacity .5s;text-shadow:0 1px 16px rgba(0,0,0,.45)}
    #fl .tick.on{opacity:1}
    #fl .lab{position:absolute;top:30px;font:500 22px 'DM Mono',ui-monospace,monospace;letter-spacing:.05em;opacity:0;transition:opacity .5s;text-shadow:0 1px 12px rgba(0,0,0,.55)}
    #fl .lab.on{opacity:1}
    #fl .lower{position:absolute;left:48px;bottom:52px;opacity:0;transition:opacity .6s}
    #fl .lower.on{opacity:1}
    #fl .lower b{display:block;font-size:44px;font-weight:600;letter-spacing:-.01em}
    #fl .lower span{display:block;margin-top:4px;font:400 13px 'DM Mono',ui-monospace,monospace;letter-spacing:.04em;color:rgba(255,255,255,.78)}
    #fl .end{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 60%,rgba(4,9,14,.25),rgba(4,9,14,.62));display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;opacity:0;transition:opacity 1s}
    #fl .end.on{opacity:1}
    #fl .end b{font-size:58px;font-weight:600;letter-spacing:-.015em}
    #fl .end i{font-style:normal;font-size:26px;color:rgba(255,255,255,.88)}
    #fl .end u{text-decoration:none;font:500 22px 'DM Mono',ui-monospace,monospace;letter-spacing:.06em;color:#8FD6EA;border-bottom:1px solid #8FD6EA;padding-bottom:5px;margin-top:10px}
    #fl .cur{position:absolute;left:0;top:0;width:22px;height:22px;margin:-2px 0 0 -2px;opacity:0;transition:opacity .3s,transform .12s;filter:drop-shadow(0 1px 3px rgba(0,0,0,.45))}
    #fl .cur.show{opacity:1} #fl .cur.down{transform:scale(.88)}
    #fl .rip{position:absolute;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;border:2px solid #fff;opacity:.9;animation:rip .6s ease-out forwards}
    @keyframes rip{to{transform:scale(3.2);opacity:0}}
    body.film *{cursor:none!important}
    `;
    const st = document.createElement('style'); st.textContent = css; (document.head || document.documentElement).appendChild(st);
    const root = document.createElement('div'); root.id = 'fl'; document.body.appendChild(root);
    const mk = (cls, html = '') => { const e = document.createElement('div'); e.className = cls; e.innerHTML = html; root.appendChild(e); return e; };
    const shade = mk('shade'), line = mk('line'), tick = mk('tick'), labL = mk('lab'), labR = mk('lab'), lower = mk('lower'), end = mk('end');
    labL.style.left = '48px'; labR.style.right = '48px';
    const on = (e, v = true) => requestAnimationFrame(() => requestAnimationFrame(() => e.classList.toggle('on', v)));
    window.F = {
      /* one quiet line, bottom left, on a soft shade */
      say(t){ line.innerHTML = t; on(shade); on(line); },
      hush(){ on(line, false); on(shade, false); },
      year(y){ tick.textContent = y; on(tick); },
      yearOff(){ on(tick, false); },
      labels(a, b){ labL.textContent = a; labR.textContent = b; on(labL); on(labR); },
      labelsOff(){ on(labL, false); on(labR, false); },
      lower(big, small){ lower.innerHTML = `<b>${big}</b><span>${small}</span>`; on(lower); },
      lowerOff(){ on(lower, false); },
      end(l1, l2, url){ end.innerHTML = `<b>${l1}</b><i>${l2}</i><u>${url}</u>`; on(end); },
      cine(v = true){ document.body.classList.toggle('film', v); },
      cursor(x, y, show = true){ let c = root.querySelector('.cur'); if (!c) c = mk('cur', '<svg viewBox="0 0 22 22" width="22" height="22"><path d="M4 2l0 15 3.8-3.5 2.6 5.9 2.9-1.3-2.6-5.8 5.2-.3z" fill="#fff" stroke="#0E1A22" stroke-width="1.3" stroke-linejoin="round"/></svg>'); c.style.left = x + 'px'; c.style.top = y + 'px'; c.classList.toggle('show', show); },
      tween(ms, fn, ease = true){ return new Promise(res => { const t0 = performance.now(); const tick = now => { const u = Math.min(1, (now - t0) / ms); fn(ease ? u * u * (3 - 2 * u) : u); if (u < 1) requestAnimationFrame(tick); else res(); }; requestAnimationFrame(tick); }); }
    };
    addEventListener('pointermove', e => { if (window.F.follow) window.F.cursor(e.clientX, e.clientY); }, true);
    addEventListener('pointerdown', e => { if (window.F.follow) { const r = mk('rip'); r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; setTimeout(() => r.remove(), 700); } }, true);
  };
  if (document.body) go(); else addEventListener('DOMContentLoaded', go);
})();
