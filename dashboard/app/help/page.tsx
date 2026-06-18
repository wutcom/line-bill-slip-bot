import AppShell from '../../components/AppShell';

export const metadata = {
  title: 'วิธีใช้ | LINE Bill Slip Bot',
  description: 'วิธีใช้งาน LINE Bill Slip Bot'
};

const summaryItems = [
  ['ส่งบิล', 'ส่งรูปบิล ใบเสร็จ หรือสลิปโอนเงิน แล้วระบบจะอ่านและบันทึกให้'],
  ['ดูวันนี้', 'ดูจำนวนรายการ ยอดรวม หมวดหมู่ และร้านค้าที่ใช้จ่ายวันนี้'],
  ['เดือนนี้', 'ดูสรุปยอดรวมและหมวดหมู่ของเดือนนี้'],
  ['แผนเดือนนี้', 'ดูแผนรายจ่ายที่ตั้งไว้ของเดือนนี้'],
  ['ดูคงเหลือ', 'ดูยอดคงเหลือของแผนรายเดือน'],
  ['วิธีใช้', 'เปิดหน้านี้']
];

export default function HelpPage() {
  return (
    <AppShell active="help">
      <div className="help-page">
      <section className="help-hero">
        <p className="eyebrow">LINE Bill Slip Bot</p>
        <h1>วิธีใช้งาน</h1>
        <p>
          ใช้เมนูใน LINE เพื่อบันทึกบิล สลิปโอนเงิน ดูสรุปรายวัน รายเดือน
          และติดตามแผนรายจ่ายของแต่ละคน
        </p>
      </section>

      <section className="help-section">
        <h2>เมนูหลัก</h2>
        <div className="help-grid">
          {summaryItems.map(([title, detail]) => (
            <article className="help-item" key={title}>
              <h3>{title}</h3>
              <p>{detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="help-section">
        <h2>คำสั่งพิมพ์เอง</h2>
        <div className="command-list">
          <code>เพิ่มแผน UOB 24677</code>
          <code>เพิ่มแผน ค่าไฟ 3500</code>
          <code>จ่ายแล้ว UOB</code>
          <code>จ่ายแล้ว UOB 5000</code>
          <code>copy แผนเดือนก่อน</code>
        </div>
      </section>

      <section className="help-section">
        <h2>หมายเหตุ</h2>
        <p>
          รายการโอนเงินถูกนับเป็นรายจ่าย และข้อมูลจะถูกแยกตาม LINE user
          ของคนที่ส่งคำสั่ง
        </p>
      </section>
      </div>
    </AppShell>
  );
}
