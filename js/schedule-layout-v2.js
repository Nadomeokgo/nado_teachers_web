(() => {
  'use strict';

  const style = document.createElement('style');
  style.id = 'nadoScheduleLayoutV2';
  style.textContent = `
    /* Keep the schedule page inside the viewport and reduce oversized cards. */
    #page-schedule {
      max-width: 100%;
      overflow-x: hidden;
    }

    #page-schedule .schedule-layout,
    #page-schedule .schedule-form-panel,
    #page-schedule .schedule-preference-field,
    #page-schedule .nado-v6-picker,
    #page-schedule #nadoScheduleV6 {
      width: 100%;
      max-width: 100%;
      box-sizing: border-box;
    }

    #page-schedule .schedule-form-panel {
      padding: 24px !important;
    }

    #page-schedule .schedule-preference-field {
      padding: 18px 20px !important;
      margin-bottom: 28px !important;
    }

    /* Location cards: compact, consistent, and no unnecessary stretching on desktop. */
    #page-schedule .nado-v6-location-buttons {
      display: grid !important;
      grid-template-columns: repeat(2, minmax(220px, 280px)) !important;
      justify-content: start !important;
      gap: 10px !important;
    }

    #page-schedule .nado-v6-location-button {
      min-height: 52px !important;
      width: 100% !important;
      padding: 10px 14px !important;
      border-radius: 13px !important;
      font-size: .95rem !important;
      line-height: 1.25 !important;
    }

    /* Seoul/Incheon detailed areas should size to their labels instead of filling columns. */
    #page-schedule .nado-v6-area-grid {
      display: flex !important;
      flex-wrap: wrap !important;
      align-items: center !important;
      gap: 8px !important;
    }

    #page-schedule .nado-v6-area-chip {
      flex: 0 0 auto !important;
      width: auto !important;
      max-width: 100%;
    }

    #page-schedule .nado-v6-area-chip span {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: auto !important;
      min-width: 96px !important;
      min-height: 42px !important;
      padding: 8px 14px !important;
      border-radius: 11px !important;
      font-size: .9rem !important;
      line-height: 1.15 !important;
      white-space: nowrap !important;
      box-sizing: border-box;
    }

    #page-schedule .nado-v6-custom {
      width: min(100%, 430px) !important;
      margin-top: 14px !important;
    }

    #page-schedule .nado-v6-custom input {
      min-height: 44px !important;
    }

    #page-schedule .nado-v6-custom button {
      min-width: 70px !important;
      min-height: 44px !important;
      padding: 0 14px !important;
    }

    #page-schedule .nado-v6-area-editor {
      width: min(100%, 430px) !important;
      margin-top: 18px !important;
    }

    #page-schedule .nado-v6-area-editor select {
      min-height: 46px !important;
    }

    /* Give the time picker heading/copy breathing room before the weekday tabs. */
    #page-schedule .form-section-head {
      margin: 0 0 26px !important;
    }

    #page-schedule .form-section-head h3 {
      margin: 0 !important;
      font-size: 1.32rem !important;
      line-height: 1.25 !important;
    }

    #page-schedule .form-section-head p {
      margin: 7px 0 0 !important;
      font-size: .94rem !important;
      line-height: 1.45 !important;
    }

    /* Weekdays stay in one row. */
    #page-schedule .nado-v6-days {
      grid-template-columns: repeat(7, 64px) !important;
      justify-content: start !important;
      gap: 6px !important;
      margin-bottom: 20px !important;
    }

    #page-schedule .nado-v6-day {
      width: 64px !important;
      min-width: 64px !important;
      min-height: 46px !important;
      padding: 5px 2px !important;
      border-radius: 10px !important;
      font-size: .82rem !important;
      line-height: 1 !important;
    }

    /* Time buttons use a fixed compact size instead of stretching to fill each row. */
    #page-schedule .nado-v6-time-grid {
      display: flex !important;
      flex-wrap: wrap !important;
      align-items: flex-start !important;
      justify-content: flex-start !important;
      gap: 8px !important;
    }

    #page-schedule .nado-v6-time {
      flex: 0 0 92px !important;
      width: 92px !important;
      min-width: 92px !important;
      min-height: 46px !important;
      padding: 8px 6px !important;
      border-radius: 10px !important;
      font-size: .9rem !important;
      line-height: 1 !important;
    }

    #page-schedule .nado-v6-status {
      margin-top: 16px !important;
      font-size: .88rem !important;
      line-height: 1.45 !important;
    }

    @media (max-width: 700px) {
      #page-schedule {
        padding-bottom: 90px;
      }

      #page-schedule .schedule-form-panel {
        width: 100% !important;
        padding: 0 !important;
        border: 0 !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        background: transparent !important;
      }

      #page-schedule .schedule-preference-field {
        width: 100% !important;
        padding: 0 !important;
        margin: 0 0 30px !important;
        border: 0 !important;
        border-radius: 0 !important;
        background: transparent !important;
      }

      #page-schedule .nado-v6-location-buttons {
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        gap: 8px !important;
      }

      #page-schedule .nado-v6-location-button {
        min-width: 0 !important;
        min-height: 48px !important;
        padding: 8px 7px !important;
        border-radius: 11px !important;
        font-size: clamp(.76rem, 3.25vw, .88rem) !important;
      }

      #page-schedule .nado-v6-area-panel {
        margin-top: 25px !important;
      }

      #page-schedule .nado-v6-area-panel > strong {
        font-size: 1.08rem !important;
      }

      #page-schedule .nado-v6-area-panel > p {
        margin: 7px 0 14px !important;
        font-size: .9rem !important;
        line-height: 1.42 !important;
      }

      #page-schedule .nado-v6-area-grid {
        gap: 7px !important;
      }

      #page-schedule .nado-v6-area-chip span {
        min-width: 82px !important;
        min-height: 40px !important;
        padding: 7px 11px !important;
        font-size: .82rem !important;
        border-radius: 10px !important;
      }

      #page-schedule .nado-v6-custom,
      #page-schedule .nado-v6-area-editor {
        width: min(100%, 360px) !important;
      }

      #page-schedule .form-section-head {
        margin: 0 0 24px !important;
      }

      #page-schedule .form-section-head h3 {
        font-size: 1.18rem !important;
      }

      #page-schedule .form-section-head p {
        margin-top: 6px !important;
        font-size: .88rem !important;
      }

      /* Fit Mon-Sun inside the viewport without horizontal scrolling. */
      #page-schedule .nado-v6-days {
        display: grid !important;
        grid-template-columns: repeat(7, minmax(0, 1fr)) !important;
        width: 100% !important;
        gap: 3px !important;
        margin: 0 0 20px !important;
        overflow: visible !important;
      }

      #page-schedule .nado-v6-day {
        width: 100% !important;
        min-width: 0 !important;
        min-height: 44px !important;
        padding: 4px 0 !important;
        font-size: clamp(.63rem, 2.9vw, .76rem) !important;
        border-radius: 9px !important;
      }

      #page-schedule .nado-v6-day b {
        right: -2px !important;
        top: -6px !important;
        min-width: 18px !important;
        height: 18px !important;
        padding: 0 3px !important;
        font-size: .58rem !important;
      }

      #page-schedule .nado-v6-time-grid {
        gap: 7px !important;
      }

      #page-schedule .nado-v6-time {
        flex-basis: 84px !important;
        width: 84px !important;
        min-width: 84px !important;
        min-height: 44px !important;
        padding: 7px 5px !important;
        font-size: .84rem !important;
        border-radius: 9px !important;
      }
    }

    @media (max-width: 390px) {
      #page-schedule .nado-v6-location-button {
        font-size: .74rem !important;
      }

      #page-schedule .nado-v6-area-chip span {
        min-width: 76px !important;
        padding-left: 9px !important;
        padding-right: 9px !important;
        font-size: .78rem !important;
      }

      #page-schedule .nado-v6-time {
        flex-basis: 80px !important;
        width: 80px !important;
        min-width: 80px !important;
      }
    }
  `;

  document.head.appendChild(style);
})();
