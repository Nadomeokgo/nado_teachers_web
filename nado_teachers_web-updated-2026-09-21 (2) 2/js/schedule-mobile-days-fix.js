(() => {
  'use strict';

  const style = document.createElement('style');
  style.id = 'nadoScheduleMobileDaysFix';
  style.textContent = `
    @media (max-width:700px) {
      #page-schedule .nado-v5-days {
        display:grid !important;
        grid-template-columns:repeat(7,minmax(0,1fr)) !important;
        gap:4px !important;
        width:100% !important;
        margin:0 0 18px !important;
        padding:2px 0 8px !important;
        overflow:visible !important;
      }

      #page-schedule .nado-v5-day {
        min-width:0 !important;
        width:100% !important;
        min-height:48px !important;
        padding:5px 1px !important;
        border-radius:10px !important;
        font-size:clamp(.68rem,2.7vw,.82rem) !important;
        line-height:1 !important;
      }

      #page-schedule .nado-v5-day b {
        right:-2px !important;
        top:-6px !important;
        min-width:19px !important;
        height:19px !important;
        padding:0 4px !important;
        font-size:.62rem !important;
      }
    }

    @media (max-width:380px) {
      #page-schedule .nado-v5-days {
        gap:3px !important;
      }

      #page-schedule .nado-v5-day {
        min-height:46px !important;
        font-size:.68rem !important;
        border-radius:9px !important;
      }
    }
  `;
  document.head.appendChild(style);
})();
