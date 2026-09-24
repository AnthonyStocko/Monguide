import { describe, expect, it } from 'vitest';
import { clearResolvedConflicts, markConflicts } from './conflicts.js';
import { personal, rules, standardDay } from './testing/dayFixture.js';

describe('markConflicts / clearResolvedConflicts', () => {
  it('marque les étapes qui se chevauchent, et rien sur une journée valide', () => {
    const day = standardDay();
    expect(markConflicts(day, 'walk', rules)).toBe(day);
    const clash = { ...day, steps: [...day.steps.slice(0, 2), personal('p', '14:00', '15:00'), ...day.steps.slice(2)] };
    clash.steps[3] = { ...clash.steps[3], start: '14:30' };
    const marked = markConflicts(clash, 'walk', rules);
    expect(marked.steps.find((s) => s.id === 'p').conflicts).toEqual(['outdoor']);
    expect(marked.steps.find((s) => s.id === 'outdoor').conflicts).toEqual(['p']);
  });

  it("efface les conflits corrigés sans en créer de nouveaux", () => {
    const day = standardDay();
    const withBadge = { ...day, steps: day.steps.map((s) => (s.id === 'outdoor' ? { ...s, conflicts: ['p'] } : s)) };
    const cleared = clearResolvedConflicts(withBadge, 'walk', rules);
    expect(cleared.steps.some((s) => s.conflicts)).toBe(false);
    // Un chevauchement existant sans badge n'en reçoit pas.
    const overlap = { ...day, steps: [day.steps[0], { ...day.steps[1], start: '11:00' }] };
    expect(clearResolvedConflicts(overlap, 'walk', rules)).toBe(overlap);
  });
});
