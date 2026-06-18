import { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'MindLife',
  description: 'Personal Balance Dashboard'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}

