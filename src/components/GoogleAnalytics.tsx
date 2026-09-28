import Script from "next/script";

const MEASUREMENT_ID = "G-377T7N93Q6";

export function GoogleAnalytics() {
  return (
    <>
      <Script id="scamdunk-google-analytics-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){window.dataLayer.push(arguments);}
window.gtag = window.gtag || gtag;
gtag('js', new Date());
gtag('config', '${MEASUREMENT_ID}');`}
      </Script>
      <Script
        id="scamdunk-google-analytics-script"
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`}
      />
    </>
  );
}
