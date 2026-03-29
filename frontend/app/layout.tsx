import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AutoOps AI — Meeting Task Automation',
  description:
    'AI that doesn\'t just record meetings — it ensures decisions get executed. Multi-agent system that converts meeting transcripts into tracked, automated action items.',
  keywords: ['AI', 'meeting automation', 'task management', 'productivity', 'AutoOps'],
  authors: [{ name: 'AutoOps AI Team' }],
  openGraph: {
    title: 'AutoOps AI',
    description: 'AI-powered meeting task automation',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased bg-slate-950 text-slate-100 min-h-screen">
        {children}
      </body>
    </html>
  );
}
