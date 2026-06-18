import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import util from 'util';
import fs from 'fs';
import path from 'path';

const execPromise = util.promisify(exec);

export async function POST() {
  try {
    const paths = [
      '/app/src/scripts/sync-to-postgres.js',
      '/opt/apps/line-bill-slip-bot/src/scripts/sync-to-postgres.js',
      path.resolve(process.cwd(), '../src/scripts/sync-to-postgres.js'),
      path.resolve(process.cwd(), 'src/scripts/sync-to-postgres.js')
    ];

    let scriptPath = '';
    for (const p of paths) {
      if (fs.existsSync(p)) {
        scriptPath = p;
        break;
      }
    }

    if (!scriptPath) {
      scriptPath = '/app/src/scripts/sync-to-postgres.js';
    }

    const { stdout, stderr } = await execPromise(`node ${scriptPath}`);

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
