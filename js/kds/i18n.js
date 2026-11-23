(function (root) {
  "use strict";

  const STR = {
    hi: {
      brand: "किचन डिस्प्ले",
      waiting: "नया / इंतज़ार",
      preparing: "बन रहा है",
      ready: "तैयार",
      served: "परोसा गया",
      cancelled: "रद्द",
      allTypes: "सभी",
      dinein: "डाइन-इन",
      takeaway: "टेकअवे",
      delivery: "डिलीवरी",
      table: "टेबल",
      undo: "वापस",
      advance: "आगे बढ़ाएँ",
      newItem: "नया जोड़ा गया",
      newNote: "नोट आया",
      empty: "कोई ऑर्डर नहीं",
      online: "ऑनलाइन",
      offline: "ऑफ़लाइन — अंतिम डेटा",
      reconnecting: "फिर से जुड़ रहा है…",
      loginTitle: "किचन लॉगिन",
      loginHint: "मैनेजर अकाउंट से साइन इन करें",
      email: "ईमेल",
      password: "पासवर्ड",
      signIn: "साइन इन",
      lang: "English",
      beep: "आवाज़",
      logout: "लॉग आउट",
      waiter: "वेटर",
      note: "नोट"
    },
    en: {
      brand: "Kitchen Display",
      waiting: "New / Waiting",
      preparing: "Preparing",
      ready: "Ready",
      served: "Served",
      cancelled: "Cancelled",
      allTypes: "All",
      dinein: "Dine-in",
      takeaway: "Takeaway",
      delivery: "Delivery",
      table: "Table",
      undo: "Undo",
      advance: "Advance",
      newItem: "Newly added",
      newNote: "Note received",
      empty: "No orders",
      online: "Online",
      offline: "Offline — last known",
      reconnecting: "Reconnecting…",
      loginTitle: "Kitchen login",
      loginHint: "Sign in with a staff account",
      email: "Email",
      password: "Password",
      signIn: "Sign in",
      lang: "हिंदी",
      beep: "Voice",
      logout: "Log out",
      waiter: "Waiter",
      note: "Note"
    }
  };

  let lang = root.localStorage?.getItem("kg_kds_lang") || "hi";

  function t(key) {
    return (STR[lang] && STR[lang][key]) || STR.en[key] || key;
  }

  function setLang(l) {
    lang = l === "en" ? "en" : "hi";
    root.localStorage?.setItem("kg_kds_lang", lang);
    return lang;
  }

  function toggle() {
    return setLang(lang === "hi" ? "en" : "hi");
  }

  function getLang() {
    return lang;
  }

  function itemName(it) {
    if (lang === "hi") return it.nameHi || it.nameEn || "—";
    return it.nameEn || it.nameHi || "—";
  }

  root.KG = root.KG || {};
  root.KG.kdsI18n = { t, setLang, toggle, getLang, itemName, STR };
})(typeof window !== "undefined" ? window : globalThis);
