import { NextResponse, NextRequest } from 'next/server';
import { getTransactions } from '../../../lib/queries/transactions';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  try {
    const data = await getTransactions({
      userId: searchParams.get('userId'),
      month: searchParams.get('month'),
      category: searchParams.get('category'),
      status: searchParams.get('status'),
      search: searchParams.get('search'),
      page: searchParams.get('page') || undefined,
      pageSize: searchParams.get('pageSize') || undefined
    });

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

