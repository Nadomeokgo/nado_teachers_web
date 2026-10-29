(() => {
  "use strict";
  const letter = /\p{L}/u;
  const latin = /\p{Script=Latin}/u;
  function isEnglishText(value) {
    return [...String(value ?? "")].every((character) => !letter.test(character) || latin.test(character));
  }
  function message(label = "") {
    const text = window.NADO_I18N?.getLanguage?.() === "en"
      ? "Please write in English. Numbers and punctuation are allowed."
      : "영어로 작성해주세요. 숫자와 문장부호는 사용할 수 있습니다.";
    return label ? `${label}: ${text}` : text;
  }
  window.NADO_PROFILE_LANGUAGE = { isEnglishText, message };
})();
