import { NextResponse } from 'next/server';
import { getTransactions } from '../../../lib/queries/transactions';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);

  try {
    const data = await getTransactions({
      userId: searchParams.get('userId'),
      month: searchParams.get('month'),
      category: searchParams.get('category'),
      status: searchParams.get('status'),
      search: searchParams.get('search'),
      page: searchParams.get('page'),
      pageSize: searchParams.get('pageSize')
    });

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
