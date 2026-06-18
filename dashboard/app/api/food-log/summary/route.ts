import { NextResponse, NextRequest } from 'next/server';
import { getFoodLogSummary } from '../../../../lib/queries/foodLog';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  try {
    const data = await getFoodLogSummary({
      userId: searchParams.get('userId')
    });

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
