import { NextResponse } from 'next/server';
import { getTransactionCsv } from '../../../../lib/queries/transactions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);

  try {
    const csv = await getTransactionCsv({
      userId: searchParams.get('userId'),
      month: searchParams.get('month'),
      category: searchParams.get('category'),
      status: searchParams.get('status'),
      search: searchParams.get('search')
    });

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="transactions.csv"'
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
