import { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'Expense Dashboard',
  description: 'Dashboard for LINE bill and slip expense tracking'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}

