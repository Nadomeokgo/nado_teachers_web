(() => {
  "use strict";

  const NADO_FEE_RATE = 0.35;
  const PACKAGE_SESSIONS = 4;
  const PRICING_VERSION = "NADO-2026-09-GROUP-1TO4";
  const TRIAL_PLAN = "economy";
  const TRIAL_TEACHER_PAYOUT = 20000;
  const TRIAL_PRICING_VERSION = "NADO-TRIAL-FREE-20000-2026-08";
  const lessonPriceTable = Object.freeze({
    economy: Object.freeze({ 30: 80000, 35: 93400, 40: 106700, 45: 120000, 60: 140000, 70: 163400, 80: 186700, 90: 210000, 100: 233400, 110: 256700, 120: 280000 }),
    standard: Object.freeze({ 30: 100000, 35: 116700, 40: 133400, 45: 150000, 60: 180000, 70: 210000, 80: 240000, 90: 270000, 100: 300000, 110: 330000, 120: 360000 }),
    premium: Object.freeze({ 30: 120000, 35: 140000, 40: 160000, 45: 180000, 60: 220000, 70: 256700, 80: 293400, 90: 330000, 100: 366700, 110: 403400, 120: 440000 })
  });
  const durationOptions = Object.freeze([60, 120]);
  const groupSizeOptions = Object.freeze([1, 2, 3, 4]);
  const groupLessonPriceTable = Object.freeze({
    economy: Object.freeze({ 1: 140000, 2: 200000, 3: 270000, 4: 320000 }),
    standard: Object.freeze({ 1: 180000, 2: 260000, 3: 360000, 4: 440000 }),
    premium: Object.freeze({ 1: 220000 })
  });

  function packageSessionCount(weeklyFrequency) {
    return PACKAGE_SESSIONS * (Number(weeklyFrequency) === 2 ? 2 : 1);
  }

  function tuitionFor(plan, durationMinutes, groupSize = 1) {
    const minutes = Number(durationMinutes);
    const size = Number(groupSize) || 1;
    const oneHourTuition = groupLessonPriceTable[plan]?.[size];
    if (oneHourTuition && [60, 120].includes(minutes)) return oneHourTuition * (minutes / 60);
    if (size !== 1) return null;
    return lessonPriceTable[plan]?.[minutes] || null;
  }

  function basePricing(plan, durationMinutes, groupSize = 1) {
    const tuition = tuitionFor(plan, durationMinutes, groupSize);
    if (!tuition) return null;
    const nadoFee = Math.round(tuition * NADO_FEE_RATE);
    return {
      tuition,
      nadoFee,
      teacherPayout: tuition - nadoFee
    };
  }

  function teacherPayoutForSessions(plan, durationMinutes, settlementSessions, groupSize = 1) {
    const base = basePricing(plan, durationMinutes, groupSize);
    const sessions = Number(settlementSessions);
    if (!base || !Number.isInteger(sessions) || sessions < 1) return null;
    return Math.round((base.teacherPayout * sessions) / PACKAGE_SESSIONS);
  }

  function hourlyRates(plan, durationMinutes, groupSize = 1) {
    const base = basePricing(plan, durationMinutes, groupSize);
    const minutes = Number(durationMinutes);
    if (!base || !minutes) return null;
    const hoursPerLesson = minutes / 60;
    return {
      firstMonth: Math.round((base.teacherPayout / PACKAGE_SESSIONS) / hoursPerLesson),
      monthTwo: Math.round((base.tuition / PACKAGE_SESSIONS) / hoursPerLesson)
    };
  }

  function trialPricing(durationMinutes) {
    const minutes = Number(durationMinutes);
    if (!durationOptions.includes(minutes)) return null;
    return {
      plan: TRIAL_PLAN,
      durationMinutes: minutes,
      studentTuition: 0,
      teacherPayout: TRIAL_TEACHER_PAYOUT,
      sessions: 1
    };
  }

  window.NADO_PRICING = Object.freeze({
    NADO_FEE_RATE,
    PACKAGE_SESSIONS,
    PRICING_VERSION,
    TRIAL_PLAN,
    TRIAL_TEACHER_PAYOUT,
    TRIAL_PRICING_VERSION,
    lessonPriceTable,
    groupLessonPriceTable,
    durationOptions,
    groupSizeOptions,
    packageSessionCount,
    tuitionFor,
    basePricing,
    teacherPayoutForSessions,
    hourlyRates,
    trialPricing
  });
})();
