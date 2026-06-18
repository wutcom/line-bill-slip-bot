import { NextResponse } from 'next/server';
import { appendRows } from '../../../../lib/sheets';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      lineUserId,
      shopOrBankName,
      amount,
      transactionDate,
      category,
      description,
      referenceNo
    } = body;

    if (!lineUserId || !amount || !transactionDate) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const sheetName = process.env.SHEET_NAME || 'Sheet1';
    const messageId = `web-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    // Prepare Google Sheets row in the correct order:
    // 0: CreatedAt, 1: MessageId, 2: UserId, 3: DocumentType, 4: ShopOrBankName,
    // 5: Amount, 6: TransactionDate, 7: ReferenceNo, 8: Category, 9: Description,
    // 10: RawText, 11: ImageFileId, 12: ImageUrl, 13: ImageStoredAt, 14: OcrConfidence
    const row = [
      new Date().toISOString(), // CreatedAt
      messageId,                // MessageId
      lineUserId,               // UserId
      'manual',                 // DocumentType
      shopOrBankName || '',     // ShopOrBankName
      String(amount),           // Amount
      transactionDate,          // TransactionDate
      referenceNo || '',        // ReferenceNo
      category || 'other',      // Category
      description || '',        // Description
      `Manual entry: ${description || ''}`.trim(), // RawText
      '',                       // ImageFileId
      '',                       // ImageUrl
      '',                       // ImageStoredAt
      '1.0'                     // OcrConfidence
    ];

    await appendRows(sheetName, 'A:O', [row]);

    return NextResponse.json({ success: true, messageId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
