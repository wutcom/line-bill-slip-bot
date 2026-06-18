import { NextResponse } from 'next/server';
import { getSyncMonitor } from '../../../lib/queries/sync';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(await getSyncMonitor());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

