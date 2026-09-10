/* The hero must now run entirely from this site: no CDN requests at all,
   and every local asset must actually resolve. */
const { chromium } = require('playwright');
const path=require('path'), DIR=__dirname;
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const p=await b.newPage({viewport:{width:1280,height:900}});
 const external=[], failed=[];
 p.on('request', r=>{ const u=r.url();
   if (/cloudfront|higgsfield/i.test(u)) external.push(u); });
 p.on('requestfailed', r=>{ if (r.url().startsWith('file://')) failed.push(r.url().split('/').pop()); });
 await p.route('**/leaflet.js', r=>r.fulfill({path:require.resolve('leaflet/dist/leaflet.js'),contentType:'application/javascript'}));
 await p.route('**/leaflet.css', r=>r.fulfill({path:require.resolve('leaflet/dist/leaflet.css'),contentType:'text/css'}));
 await p.route('**tile.openstreetmap.org/**', r=>r.abort());
 for (const x of ['**://fonts.**/**','**google**','**nicholsland.net**']) await p.route(x, r=>r.abort());
 await p.route('**/data/properties.json', r=>r.fulfill({path:path.join(DIR,'fixture-properties.json'),contentType:'application/json'}));
 await p.route('**/data/ga-counties.json', r=>r.fulfill({status:200,contentType:'application/json',body:'["Clarke"]'}));
 await p.goto('file://'+path.join(DIR,'index.html'));
 await p.waitForTimeout(2500);
 const info = await p.evaluate(()=>{
   const stage=document.querySelector('.hero__stage');
   const srcs=[...document.querySelectorAll('.hero__slide video source')].map(s=>s.getAttribute('src'));
   const imgs=[...document.querySelectorAll('.hero__slide img, .hero__stage > img')].map(i=>({src:i.getAttribute('src'), ok:i.complete && i.naturalWidth>0}));
   return {srcs, imgs, baseStillLoaded: (()=>{const i=stage.querySelector(':scope > img'); return i.complete && i.naturalWidth>0;})()};
 });
 console.log('external CDN requests :', external.length ? external : 'none');
 console.log('failed local requests :', failed.length ? failed : 'none');
 console.log('clip sources          :', info.srcs);
 console.log('stills all decoded    :', info.imgs.every(i=>i.ok), info.imgs.map(i=>i.src.split('/').pop()+'='+i.ok).join(' '));
 await b.close();
 process.exit(external.length || failed.length || !info.imgs.every(i=>i.ok) ? 1 : 0);
})();
