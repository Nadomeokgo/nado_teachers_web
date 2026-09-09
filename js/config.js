// 나도 Teachers Supabase 연결 설정
window.NADO_CONFIG = {
  SUPABASE_URL: "https://ouanvcvzrjbzbpefslgd.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_CiXs7pxX70my52mglC4ecg_hTGc8G5R",
  SUPPORT_URL: "https://open.kakao.com/o/sCZAMCGi",
  SITE_NAME: "나도 Teachers"
};

// Load the current schedule editor. Seoul availability is managed per service area.
(() => {
  const scheduleScript = document.createElement('script');
  scheduleScript.src = 'js/schedule-v2.js?v=20260910-2';
  scheduleScript.defer = true;
  document.head.appendChild(scheduleScript);
})();
