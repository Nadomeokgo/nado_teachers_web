(() => {
  "use strict";

  const NADO_FEE_RATE = 0.35;
  const PACKAGE_SESSIONS = 4;
  const PRICING_VERSION = "NADO-2026-08-W2";
  const lessonPriceTable = Object.freeze({
    economy: Object.freeze({ 30: 80000, 35: 93400, 40: 106700, 45: 120000, 60: 140000, 70: 163400, 80: 186700, 90: 210000, 100: 233400, 110: 256700, 120: 280000 }),
    standard: Object.freeze({ 30: 100000, 35: 116700, 40: 133400, 45: 150000, 60: 180000, 70: 210000, 80: 240000, 90: 270000, 100: 300000, 110: 330000, 120: 360000 }),
    premium: Object.freeze({ 30: 120000, 35: 140000, 40: 160000, 45: 180000, 60: 220000, 70: 256700, 80: 293400, 90: 330000, 100: 366700, 110: 403400, 120: 440000 })
  });
  const durationOptions = Object.freeze([30, 35, 40, 45, 60, 70, 80, 90, 100, 110, 120]);

  function packageSessionCount(weeklyFrequency) {
    return PACKAGE_SESSIONS * (Number(weeklyFrequency) === 2 ? 2 : 1);
  }

  function basePricing(plan, durationMinutes) {
    const tuition = lessonPriceTable[plan]?.[Number(durationMinutes)];
    if (!tuition) return null;
    const nadoFee = Math.round(tuition * NADO_FEE_RATE);
    return {
      tuition,
      nadoFee,
      teacherPayout: tuition - nadoFee
    };
  }

  function teacherPayoutForSessions(plan, durationMinutes, settlementSessions) {
    const base = basePricing(plan, durationMinutes);
    const sessions = Number(settlementSessions);
    if (!base || !Number.isInteger(sessions) || sessions < 1) return null;
    return Math.round((base.teacherPayout * sessions) / PACKAGE_SESSIONS);
  }

  function hourlyRates(plan, durationMinutes) {
    const base = basePricing(plan, durationMinutes);
    const minutes = Number(durationMinutes);
    if (!base || !minutes) return null;
    const hoursPerLesson = minutes / 60;
    return {
      firstMonth: Math.round((base.teacherPayout / PACKAGE_SESSIONS) / hoursPerLesson),
      monthTwo: Math.round((base.tuition / PACKAGE_SESSIONS) / hoursPerLesson)
    };
  }

  window.NADO_PRICING = Object.freeze({
    NADO_FEE_RATE,
    PACKAGE_SESSIONS,
    PRICING_VERSION,
    lessonPriceTable,
    durationOptions,
    packageSessionCount,
    basePricing,
    teacherPayoutForSessions,
    hourlyRates
  });
})();
