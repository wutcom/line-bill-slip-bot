import { NextResponse, NextRequest } from 'next/server';
import { getBudgetPlans } from '../../../lib/queries/budget';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  try {
    const data = await getBudgetPlans({
      userId: searchParams.get('userId'),
      month: searchParams.get('month')
    });

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

