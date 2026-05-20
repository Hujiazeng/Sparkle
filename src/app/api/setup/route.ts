import { NextRequest, NextResponse } from 'next/server';
import { getSetting, setSetting } from '@/lib/db';
import { SKYHUMAN_TOKEN_KEY } from '@/lib/skyhuman';

export async function GET() {
  try {
    // Check if setup was already completed
    const completedRaw = getSetting('setup_completed');
    let completed = completedRaw === 'true';

    // Digital human API status
    let digitalHuman: 'not-configured' | 'completed' | 'skipped' | 'needs-fix' = 'not-configured';
    const digitalHumanSkipped = getSetting('setup_digital_human_skipped');
    if (digitalHumanSkipped === 'true') {
      digitalHuman = 'skipped';
    } else if (getSetting(SKYHUMAN_TOKEN_KEY)) {
      digitalHuman = 'completed';
    }

    // Project status
    let project: 'not-configured' | 'completed' | 'skipped' | 'needs-fix' = 'not-configured';
    const projectSkipped = getSetting('setup_project_skipped');
    const defaultProject = getSetting('setup_default_project');
    if (projectSkipped === 'true') {
      project = 'skipped';
    } else if (defaultProject) {
      // Validate path exists
      const fs = await import('fs');
      try {
        const stat = fs.statSync(defaultProject);
        project = stat.isDirectory() ? 'completed' : 'needs-fix';
      } catch {
        project = 'needs-fix';
      }
    }

    // Normalize stale per-card state: if every card is already completed or
    // skipped but the top-level setup_completed flag never got written, write
    // it now. Fixes users whose three cards landed at 3/3 without ever
    // triggering the frontend auto-close path (e.g. initial GET returned 3/3,
    // so SetupCenter's `initialCompletedCount < 3` gate never fired).
    const allCardsDone =
      (digitalHuman === 'completed' || digitalHuman === 'skipped') &&
      (project === 'completed' || project === 'skipped');
    if (allCardsDone && !completed) {
      setSetting('setup_completed', 'true');
      completed = true;
    }

    return NextResponse.json({
      completed,
      digitalHuman,
      project,
      defaultProject: defaultProject || undefined,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to get setup state' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { card, status, value } = body;

    if (!card || !status) {
      return NextResponse.json({ error: 'Missing card or status' }, { status: 400 });
    }

    switch (card) {
      case 'digitalHuman':
        if (status === 'skipped') setSetting('setup_digital_human_skipped', 'true');
        else if (status === 'completed') setSetting('setup_digital_human_skipped', '');
        break;
      case 'project':
        if (status === 'skipped') {
          setSetting('setup_project_skipped', 'true');
        } else if (status === 'completed' && value) {
          setSetting('setup_default_project', value);
          setSetting('setup_project_skipped', '');
        }
        break;
      case 'completed':
        setSetting('setup_completed', 'true');
        break;
      default:
        return NextResponse.json({ error: 'Unknown card' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to update setup state' }, { status: 500 });
  }
}
