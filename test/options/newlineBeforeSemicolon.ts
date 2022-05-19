import dedent from 'dedent-js';
import { FormatFn } from '../../src/sqlFormatter';

export default function supportsNewlineBeforeSemicolon(format: FormatFn) {
  it('defaults to semicolon on end of last line', () => {
    const result = format(`SELECT a FROM b;`);
    expect(result).toBe(dedent`
      SELECT
        a
      FROM
        b;
    `);
  });

  it('supports semicolon on separate line', () => {
    const result = format(`SELECT a FROM b;`, { newlineBeforeSemicolon: true });
    expect(result).toBe(dedent`
      SELECT
        a
      FROM
        b
      ;
    `);
  });
}