import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  title: "Felcin",
  description: "Felcin — Share moments with the world.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/static/logo-nav.svg", type: "image/svg+xml" },
      { url: "/logo512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/logo512.png",
    shortcut: "/logo512.png",
  },
  openGraph: {
    title: "Felcin",
    description: "Felcin — Share moments with the world.",
    url: "https://www.felcin.com",
    siteName: "Felcin",
    images: [{ url: "https://www.felcin.com/logo512.png", width: 1024, height: 1024, alt: "Felcin" }],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Felcin",
    description: "Felcin — Share moments with the world.",
    images: ["https://www.felcin.com/logo512.png"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#000000",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ background: "#000", colorScheme: "dark" }}>
      <head>
        <meta name="apple-itunes-app" content="app-id=6763660775" />
        {/* Google Ads conversion tracking — replace AW-XXXXXXXXXX with your Google Ads tag ID */}
        {process.env.NEXT_PUBLIC_GOOGLE_ADS_ID && (
          <>
            <script async src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GOOGLE_ADS_ID}`} />
            <script dangerouslySetInnerHTML={{ __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${process.env.NEXT_PUBLIC_GOOGLE_ADS_ID}');
            ` }} />
          </>
        )}
        <script dangerouslySetInnerHTML={{ __html: `
          document.documentElement.style.background='#000';
          window.addEventListener('pagehide',function(){document.documentElement.style.background='#000';if(document.body)document.body.style.background='#000';});
          window.addEventListener('beforeunload',function(){document.documentElement.style.background='#000';if(document.body)document.body.style.background='#000';});
        ` }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
          rel="stylesheet"
        />
        <style dangerouslySetInnerHTML={{ __html: `
          .material-symbols-outlined { opacity: 0; transition: opacity 0.15s; }
          .fonts-loaded .material-symbols-outlined { opacity: 1; }
        ` }} />
        <script dangerouslySetInnerHTML={{ __html: `
          document.fonts.ready.then(function() { document.documentElement.classList.add('fonts-loaded'); });
        ` }} />
      </head>
      <body className={`${manrope.variable} antialiased`} style={{ fontFamily: "var(--font-manrope), system-ui, sans-serif" }}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
