import './globals.css';

export const metadata = {
  title: 'Expense Dashboard',
  description: 'Dashboard for LINE bill and slip expense tracking'
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
