// 나도 Teachers Supabase 연결 설정
window.NADO_CONFIG = {
  SUPABASE_URL: "https://ouanvcvzrjbzbpefslgd.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_CiXs7pxX70my52mglC4ecg_hTGc8G5R",
  SUPPORT_URL: "https://open.kakao.com/o/sCZAMCGi",
  SITE_NAME: "나도 Teachers"
};

// Keep teacher schedule/profile updates connected to the student matching database.
(() => {
  const syncScript = document.createElement('script');
  syncScript.src = 'js/matching-sync.js?v=20260910-1';
  syncScript.defer = true;
  document.head.appendChild(syncScript);

  const customAreaScript = document.createElement('script');
  customAreaScript.src = 'js/custom-seoul-areas.js?v=20260910-1';
  customAreaScript.defer = true;
  document.head.appendChild(customAreaScript);
})();
