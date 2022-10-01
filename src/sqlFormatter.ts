import BigQueryFormatter from 'src/languages/bigquery/bigquery.formatter';
import Db2Formatter from 'src/languages/db2/db2.formatter';
import HiveFormatter from 'src/languages/hive/hive.formatter';
import MariaDbFormatter from 'src/languages/mariadb/mariadb.formatter';
import MySqlFormatter from 'src/languages/mysql/mysql.formatter';
import N1qlFormatter from 'src/languages/n1ql/n1ql.formatter';
import PlSqlFormatter from 'src/languages/plsql/plsql.formatter';
import PostgreSqlFormatter from 'src/languages/postgresql/postgresql.formatter';
import RedshiftFormatter from 'src/languages/redshift/redshift.formatter';
import SparkFormatter from 'src/languages/spark/spark.formatter';
import SqliteFormatter from 'src/languages/sqlite/sqlite.formatter';
import SqlFormatter from 'src/languages/sql/sql.formatter';
import TrinoFormatter from 'src/languages/trino/trino.formatter';
import TransactSqlFormatter from 'src/languages/transactsql/transactsql.formatter';
import SingleStoreDbFormatter from './languages/singlestoredb/singlestoredb.formatter';
import SnowflakeFormatter from './languages/snowflake/snowflake.formatter';

import { FormatOptions } from './FormatOptions';
import { ConfigError, validateConfig, validateQuery } from './validateConfigs';

export const formatters = {
  bigquery: BigQueryFormatter,
  db2: Db2Formatter,
  hive: HiveFormatter,
  mariadb: MariaDbFormatter,
  mysql: MySqlFormatter,
  n1ql: N1qlFormatter,
  plsql: PlSqlFormatter,
  postgresql: PostgreSqlFormatter,
  redshift: RedshiftFormatter,
  singlestoredb: SingleStoreDbFormatter,
  snowflake: SnowflakeFormatter,
  spark: SparkFormatter,
  sql: SqlFormatter,
  sqlite: SqliteFormatter,
  transactsql: TransactSqlFormatter,
  trino: TrinoFormatter,
  tsql: TransactSqlFormatter, // alias for transactsql
};
export type SqlLanguage = keyof typeof formatters;
export const supportedDialects = Object.keys(formatters);

const defaultOptions: FormatOptions = {
  language: 'sql',
  tabWidth: 2,
  useTabs: false,
  keywordCase: 'preserve',
  indentStyle: 'standard',
  logicalOperatorNewline: 'before',
  tabulateAlias: false,
  commaPosition: 'after',
  expressionWidth: 50,
  linesBetweenQueries: 1,
  denseOperators: false,
  newlineBeforeSemicolon: false,
};

/**
 * Format whitespace in a query to make it easier to read.
 *
 * @param {string} query - input SQL query string
 * @param {FormatOptions} cfg Configuration options (see docs in README)
 * @return {string} formatted query
 */
export const format = (query: string, cfg: Partial<FormatOptions> = defaultOptions): string => {
  validateQuery(query);

  if (typeof cfg.language === 'string' && !supportedDialects.includes(cfg.language)) {
    throw new ConfigError(`Unsupported SQL dialect: ${cfg.language}`);
  }

  const options = validateConfig({
    ...defaultOptions,
    ...cfg,
  });

  const FormatterCls =
    typeof options.language === 'string' ? formatters[options.language] : options.language;

  return new FormatterCls(options).format(query);
};

export const formatStandardSQL: FormatFn = (
  query: string,
  cfg: Partial<Exclude<FormatOptions, 'language'>> = {}
): string => {
  validateQuery(query);
  const options = validateConfig({
    ...defaultOptions,
    ...cfg,
  });
  return new SqlFormatter(options).format(query);
};

export type FormatFn = typeof format;
