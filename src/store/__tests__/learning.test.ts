import { kvGet, kvSet } from '../db';
import { getBookmarks, setBookmark, getStudy, saveStudy, resetLearningStudy } from '../learning';

jest.mock('../db', () => {
  const data = new Map<string, string>();
  return { kvGet: (key: string) => data.get(key) ?? null, kvSet: (key: string, value: string) => data.set(key, value), clear: () => data.clear() };
});

describe('new mobile learning storage', () => {
  beforeEach(() => jest.requireMock('../db').clear());
  test('bookmarks persist without modifying existing circuit/progress keys', () => {
    kvSet('existing-setting', 'keep');
    setBookmark('ic-nand', true);
    setBookmark('ic-nand', true);
    expect(getBookmarks()).toEqual(['ic-nand']);
    setBookmark('ic-nand', false);
    expect(getBookmarks()).toEqual([]);
    expect(kvGet('existing-setting')).toBe('keep');
  });
  test('study stores only checklists and knowledge answers, never notes', () => {
    saveStudy('pi-gpio', { steps: [0, 1, 1], answers: { 0: 1 } });
    expect(getStudy('pi-gpio')).toEqual({ steps: [0, 1], answers: { 0: 1 } });
    const raw = JSON.parse(kvGet('learning.study.v1')!);
    expect(Object.keys(raw['pi-gpio']).sort()).toEqual(['answers', 'steps']);
  });
  test('progress reset clears guide study, but retains bookmarks and unrelated data', () => {
    setBookmark('pi-gpio', true);
    saveStudy('pi-gpio', { steps: [0], answers: { 0: 1 } });
    kvSet('existing-setting', 'keep');
    resetLearningStudy();
    expect(getStudy('pi-gpio')).toEqual({ steps: [], answers: {} });
    expect(getBookmarks()).toEqual(['pi-gpio']);
    expect(kvGet('existing-setting')).toBe('keep');
  });
  test('malformed saved learning data recovers safely', () => {
    kvSet('learning.bookmarks.v1', 'bad json');
    expect(getBookmarks()).toEqual([]);
    kvSet('learning.study.v1', JSON.stringify({ 'pi-gpio': { steps: [-1, 0, 'bad'], answers: { bad: 1, '0': 1, '2': -3 } } }));
    expect(getStudy('pi-gpio')).toEqual({ steps: [0], answers: { 0: 1 } });
  });
});
