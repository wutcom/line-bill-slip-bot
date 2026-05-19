import { NextResponse } from 'next/server';
import { getSyncMonitor } from '../../../lib/queries/sync';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(await getSyncMonitor());
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
