// 나도 Teachers Supabase 연결 설정
window.NADO_CONFIG = {
  SUPABASE_URL: "https://ouanvcvzrjbzbpefslgd.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_CiXs7pxX70my52mglC4ecg_hTGc8G5R",
  SUPPORT_URL: "https://open.kakao.com/o/sCZAMCGi",
  SITE_NAME: "나도 Teachers"
};

// Reuse one Supabase client per page so auth does not create duplicate GoTrueClient instances.
(() => {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.NADO_CONFIG;
  const supabaseLib = window.supabase;
  if (!supabaseLib?.createClient || !SUPABASE_URL || !SUPABASE_ANON_KEY) return;

  const originalCreateClient = supabaseLib.createClient.bind(supabaseLib);

  if (!window.NADO_SUPABASE_CLIENT) {
    window.NADO_SUPABASE_CLIENT = originalCreateClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  supabaseLib.createClient = (url, key, options) => {
    if (url === SUPABASE_URL && key === SUPABASE_ANON_KEY) {
      return window.NADO_SUPABASE_CLIENT;
    }
    return originalCreateClient(url, key, options);
  };
})();

// Load the current schedule editor.
(() => {
  const scheduleScript = document.createElement('script');
  scheduleScript.src = 'js/schedule-v6.js?v=20260910-2';
  scheduleScript.defer = true;
  document.head.appendChild(scheduleScript);

  const layoutScript = document.createElement('script');
  layoutScript.src = 'js/schedule-layout-v2.js?v=20260910-1';
  layoutScript.defer = true;
  document.head.appendChild(layoutScript);
})();
