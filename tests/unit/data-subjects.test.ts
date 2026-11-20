import { describe, expect, it } from 'vitest';
import { NEUTRAL_SUBJECT, subjectOf } from '../../src/data/subjects';
import { SUBJECTS } from '../../src/styles';

describe('subjectOf', () => {
  it('maps real short descriptions to the twelve families', () => {
    const cases: [string, string, string][] = [
      ['Brutalist architecture', 'Architectural style', 'Architecture'],
      ['Alvar Aalto', 'Finnish architect and designer (1898–1976)', 'Architecture'],
      ['Ankara', 'Capital of Turkey', 'Geography'],
      ['Buffalo, New York', 'City in New York, United States', 'Geography'],
      ['Marcus Junius Brutus', 'Roman politician and assassin of Julius Caesar (85–42 BC)', 'History'],
      ['Concrete', 'Composite construction material', 'Civil engineering'],
      ['Golden Gate Bridge', 'Suspension bridge in the San Francisco Bay Area', 'Civil engineering'],
      ['Zoning', 'Government policy allowing certain uses of land in different places', 'Urban planning'],
      ['Passive house', 'Type of house', 'Sustainable design'],
      ['Betelgeuse', 'Red supergiant star in the constellation of Orion', 'Astronomy'],
      ['Kind of Blue', '1959 studio album by Miles Davis', 'Music'],
      ['Red fox', 'Species of mammal', 'Biology'],
      ['Stoicism', 'Hellenistic philosophical school', 'Philosophy'],
      ['Trie', 'Search tree data structure', 'Computer science'],
      ['Hades (video game)', '2020 video game', 'Video game'],
    ];
    for (const [title, description, subject] of cases) expect(subjectOf({ title, description }), title).toBe(subject);
  });

  it('only ever answers with one of the twelve, or the neutral subject', () => {
    expect(SUBJECTS).not.toContain(NEUTRAL_SUBJECT);
    for (const s of SUBJECTS) expect(subjectOf({ title: s }), s).toBe(s);
    expect(subjectOf({ title: 'Cell (biology)' })).toBe('Biology');
    expect(subjectOf({ title: 'Jane Doe', description: 'American actress' })).toBe(NEUTRAL_SUBJECT);
    expect(subjectOf({ title: 'Xyzzy' })).toBe(NEUTRAL_SUBJECT);
  });

  it('falls back to categories, and lets the description outweigh them', () => {
    expect(subjectOf({ title: 'Jane Jacobs', categories: ['Category:Urban theorists', 'Category:1916 births'] })).toBe('Urban planning');
    expect(
      subjectOf({ title: 'Seagram Building', description: 'Skyscraper in Manhattan, New York', categories: ['Category:Roman Catholic history', 'Category:War memorials'] }),
    ).toBe('Architecture');
  });

  it('matches whole words only', () => {
    expect(subjectOf({ title: 'Warsaw Pact Starbucks' })).toBe(NEUTRAL_SUBJECT);
  });
});
