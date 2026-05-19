import { NextResponse } from 'next/server';
import { getOverview } from '../../../lib/queries/overview';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);

  try {
    const data = await getOverview({
      userId: searchParams.get('userId'),
      month: searchParams.get('month')
    });

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
