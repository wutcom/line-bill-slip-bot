import { NextResponse, NextRequest } from 'next/server';
import { getFoodLogs } from '../../../lib/queries/foodLog';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  try {
    const data = await getFoodLogs({
      userId: searchParams.get('userId'),
      date: searchParams.get('date'),
      month: searchParams.get('month'),
      mealName: searchParams.get('mealName'),
      sourceType: searchParams.get('sourceType'),
      search: searchParams.get('search')
    });

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
