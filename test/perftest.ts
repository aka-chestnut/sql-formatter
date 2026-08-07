import { format } from '../src/sqlFormatter.js';

const BASELINE = 300;

describe('Performance test', () => {
  it('uses about 300 MB of memory to format empty query', () => {
    format('', { language: 'sql' });

    expect(memoryUsageInMB()).toBeLessThan(BASELINE);
  });

  // Issue #840
  it('should use less than 100 MB of additional memory to format ~100 KB of SQL', () => {
    // Long list of values
    const values = Array(10000).fill('myid');
    const sql = `SELECT ${values.join(', ')}`;
    expect(sql.length).toBeGreaterThan(50000);
    expect(sql.length).toBeLessThan(100000);

    format(sql, { language: 'sql' });

    expect(memoryUsageInMB()).toBeLessThan(BASELINE + 100);
  });

  it('formats all 10,000 values in a parenthesized IN list', () => {
    const values = Array(10000).fill('myid');
    const sql = `SELECT * FROM my_table WHERE col IN (${values.join(', ')})`;

    const formatted = format(sql, { language: 'sql' });

    expect(formatted.match(/\bmyid\b/g)).toHaveLength(values.length);
  });

  it('formats a parenthesized OR chain with 5,000 conditions', () => {
    const conditions = Array(5000).fill('col = myid');
    const sql = `SELECT * FROM my_table WHERE (${conditions.join(' OR ')})`;

    const formatted = format(sql, { language: 'sql' });

    expect(formatted.match(/\bOR\b/g)).toHaveLength(conditions.length - 1);
  });

  it('formats an unparenthesized OR chain with 5,000 conditions', () => {
    const conditions = Array(5000).fill('col = myid');
    const sql = `SELECT * FROM my_table WHERE ${conditions.join(' OR ')}`;

    const formatted = format(sql, { language: 'sql' });

    expect(formatted.match(/\bOR\b/g)).toHaveLength(conditions.length - 1);
  });
});

function memoryUsageInMB() {
  return Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
}
