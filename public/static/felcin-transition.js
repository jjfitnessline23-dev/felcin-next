(function(){
  // Force black immediately on every page load
  document.documentElement.style.background='#000';

  // Full-page black overlay
  var ov=document.createElement('div');
  ov.style.cssText='position:fixed;top:0;left:0;right:0;bottom:0;background:#000;z-index:2147483647;transition:opacity .18s ease;pointer-events:none;opacity:1;';

  function hide(){
    ov.style.opacity='0';
    setTimeout(function(){if(ov.parentNode)ov.parentNode.removeChild(ov);},220);
  }
  function show(){
    ov.style.transition='none';
    ov.style.opacity='1';
    if(document.body&&!ov.parentNode)document.body.appendChild(ov);
  }

  // Show black overlay before navigating away, auto-hide for client-side (Next.js) navigation
  document.addEventListener('click',function(e){
    var a=e.target;
    while(a&&a.tagName!=='A')a=a.parentElement;
    if(a&&a.href&&a.hostname===location.hostname&&!a.target&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey){show();setTimeout(hide,500);}
  },true);

  // Fade out overlay once page content is ready
  function ready(){
    if(document.body){
      document.body.appendChild(ov);
      requestAnimationFrame(function(){requestAnimationFrame(hide);});
    }
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',ready);
  }else{
    ready();
  }

  // Handle back/forward cache
  window.addEventListener('pageshow',function(e){
    if(e.persisted){show();setTimeout(hide,50);}
  });

  // Register service worker to cache pages for instant refresh (no white flash)
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('/sw.js');
  }
})();
