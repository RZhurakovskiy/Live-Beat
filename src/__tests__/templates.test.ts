import { addTemplate, decodeTemplates, encodeTemplates, MAX_TEMPLATE_NAME, removeTemplate } from '../utils/templates';

const TABATA = { preset: 'tabata' as const, workSec: 20, restSec: 10, rounds: 8 };
const SIX = { preset: 'custom' as const, workSec: 90, restSec: 60, rounds: 6 };

describe('timer templates', () => {
  it('round-trips through the flag', () => {
    const list = [{ name: 'Табата', interval: TABATA }, { name: 'Интервалы 6×400', interval: SIX }];
    expect(decodeTemplates(encodeTemplates(list))).toEqual(list);
  });

  it('drops broken entries and survives garbage', () => {
    const json = JSON.stringify([{ name: 'ok', interval: SIX }, { name: '', interval: SIX }, { name: 'x', interval: { rounds: 0 } }, 5]);
    expect(decodeTemplates(json).map((t) => t.name)).toEqual(['ok']);
    expect(decodeTemplates('{nope')).toEqual([]);
    expect(decodeTemplates(null)).toEqual([]);
  });

  it('replaces a template with the same name instead of duplicating it', () => {
    const list = addTemplate([{ name: 'Табата', interval: TABATA }], { name: ' табата ', interval: SIX });
    expect(list).toEqual([{ name: 'табата', interval: SIX }]);
  });

  it('ignores an empty name and trims a long one', () => {
    expect(addTemplate([], { name: '   ', interval: SIX })).toEqual([]);
    const long = addTemplate([], { name: 'x'.repeat(50), interval: SIX });
    expect(long[0].name).toHaveLength(MAX_TEMPLATE_NAME);
  });

  it('removes by name', () => {
    const list = [{ name: 'A', interval: TABATA }, { name: 'B', interval: SIX }];
    expect(removeTemplate(list, 'A').map((t) => t.name)).toEqual(['B']);
  });
});
