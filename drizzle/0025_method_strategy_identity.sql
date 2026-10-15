-- drizzle-kit splits JSON expressions at commas in generated SQLite index SQL.
-- Keep the expression unquoted; the schema and snapshot retain the full expression.
CREATE UNIQUE INDEX `uq_math_method_strategy_key` ON `math_methods`
  (`owner_id`, `scope_id`, json_extract(`content`, '$.strategy.key'))
  WHERE json_extract(`content`, '$.strategy.key') IS NOT NULL;
