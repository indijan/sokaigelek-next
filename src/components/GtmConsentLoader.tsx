"use client";

import { useEffect, useState } from "react";
import Script from "next/script";

const STORAGE_KEY = "sg_cookie_notice_hidden";

export default function GtmConsentLoader({ gtmId }: { gtmId?: string }) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!gtmId) return;
    const isAllowed = window.localStorage.getItem(STORAGE_KEY) === "1";
    setEnabled(isAllowed);

    const onConsent = () => setEnabled(true);
    window.addEventListener("sg:consent:gtm", onConsent);
    return () => window.removeEventListener("sg:consent:gtm", onConsent);
  }, [gtmId]);

  if (!gtmId || !enabled) return null;

  return (
    <>
      <Script id="gtm" strategy="lazyOnload">
        {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtmId}');`}
      </Script>
      <noscript>
        <iframe
          src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
          height="0"
          width="0"
          style={{ display: "none", visibility: "hidden" }}
        />
      </noscript>
    </>
  );
}
