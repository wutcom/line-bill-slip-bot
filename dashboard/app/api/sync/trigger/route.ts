import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

export async function POST() {
  try {
    // Run the sync script. We are in the docker container context, so we can run the script using node.
    // It will connect to the docker database service (defined by DATABASE_URL in env).
    const { stdout, stderr } = await execPromise('node /opt/apps/line-bill-slip-bot/src/scripts/sync-to-postgres.js');

    return NextResponse.json({
      success: true,
      stdout: stdout.toString(),
      stderr: stderr.toString()
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      stdout: error.stdout?.toString(),
      stderr: error.stderr?.toString()
    }, { status: 500 });
  }
}
