(() => {
  'use strict';

  const style = document.createElement('style');
  style.id = 'nadoScheduleLayoutFixV3';
  style.textContent = `
    /* Center only the time-slot buttons as a group. */
    #page-schedule .nado-v6-time-grid {
      justify-content: center !important;
    }

    /* Keep the selected-time count perfectly centered inside the blue circle. */
    #page-schedule .nado-v6-day b {
      display: grid !important;
      place-items: center !important;
      width: 22px !important;
      min-width: 22px !important;
      height: 22px !important;
      padding: 0 !important;
      line-height: 1 !important;
      text-align: center !important;
      box-sizing: border-box !important;
      border-radius: 50% !important;
      right: -3px !important;
      top: -7px !important;
    }

    @media (max-width: 700px) {
      #page-schedule .nado-v6-day b {
        width: 21px !important;
        min-width: 21px !important;
        height: 21px !important;
        right: -2px !important;
        top: -7px !important;
        font-size: .6rem !important;
      }
    }
  `;

  document.head.appendChild(style);
})();
