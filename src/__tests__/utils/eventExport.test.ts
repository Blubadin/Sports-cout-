import { describe, expect, it } from 'vitest';
import { createMockEvent } from '../fixtures';
import { applyEventQuery, type EventQuery } from '../../utils/eventQuery';
import { createEventsCsv } from '../../utils/eventExport';

describe('filtered event export', () => {
  it('exports exactly the filtered events with review metadata', () => {
    const events = [
      createMockEvent({
        id: 'visible-event',
        no: 1,
        note: 'Coach said "watch this"',
        isBookmarked: true,
        actions: [{
          teamCode: 'THA',
          skillCode: 'SPK',
          resultCode: 'Yes',
          areaCode: 'LN',
          courtSide: 'teamA',
          gridX: 2,
          gridY: 1,
          pointX: 0.25,
          pointY: 0.75,
          courtViewMode: 'full',
          foulCode: 'NET_TOUCH',
          playerNumber: '7',
          playerName: 'Mali',
        }],
      }),
      createMockEvent({
        id: 'hidden-event',
        no: 2,
        actions: [{ teamCode: 'JPN', skillCode: 'REC', resultCode: 'Pass' }],
      }),
    ];
    const query: EventQuery = {
      search: '', team: 'THA', skill: '', result: '', foul: '', area: '',
      bookmark: 'all', player: '', sortBy: 'no', sortDirection: 'asc',
    };

    const csv = createEventsCsv(applyEventQuery(events, query), 'en');

    expect(csv).toContain('visible-event');
    expect(csv).not.toContain('hidden-event');
    expect(csv).toContain('#7 Mali');
    expect(csv).toContain('NET_TOUCH');
    expect(csv).toContain('LN');
    expect(csv).toContain('true');
    expect(csv).toContain('courtSide,gridX,gridY,pointX,pointY,courtViewMode');
    expect(csv).toContain('"teamA","2","1","0.25","0.75","full"');
    expect(csv).toContain('"Coach said ""watch this"""');
  });

  it('neutralizes spreadsheet formulas in user-authored cells', () => {
    const csv = createEventsCsv([
      createMockEvent({ note: '=HYPERLINK("https://example.test","open")' }),
    ]);

    expect(csv).toContain('"\'=HYPERLINK(""https://example.test"",""open"")"');
  });
});
