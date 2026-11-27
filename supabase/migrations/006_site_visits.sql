-- Page visits, counted on DIG's own server without cookies.
--
-- Only daily totals are kept: no IP address, no browser details, no per-person
-- row. Unique visitors are worked out in the server's memory from the IP and
-- browser type mixed with a random value that changes every day and is then
-- thrown away (backend/Application/Services/VisitCounter.cs). The Privacy
-- Policy says so in plain words.

CREATE TABLE IF NOT EXISTS site_visits (
  day       DATE  NOT NULL,
  path      TEXT  NOT NULL,            -- '*' is the whole site
  source    TEXT  NOT NULL DEFAULT '', -- the other site a visitor came from, '' for none
  views     INT   NOT NULL DEFAULT 0,
  visitors  INT   NOT NULL DEFAULT 0,
  PRIMARY KEY (day, path, source)
);

-- No policies: only the server's secret key can read or write it.
ALTER TABLE site_visits ENABLE ROW LEVEL SECURITY;

-- One page view: the page's row and the whole site's row, each counted once,
-- in one call. A plain upsert can't add to a count.
CREATE OR REPLACE FUNCTION record_visit(
  p_day DATE, p_path TEXT, p_source TEXT, p_new_visitor BOOLEAN, p_new_site_visitor BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO site_visits AS v (day, path, source, views, visitors)
  VALUES (p_day, p_path, p_source, 1, CASE WHEN p_new_visitor THEN 1 ELSE 0 END)
  ON CONFLICT (day, path, source) DO UPDATE
    SET views = v.views + 1,
        visitors = v.visitors + CASE WHEN p_new_visitor THEN 1 ELSE 0 END;

  INSERT INTO site_visits AS v (day, path, source, views, visitors)
  VALUES (p_day, '*', '', 1, CASE WHEN p_new_site_visitor THEN 1 ELSE 0 END)
  ON CONFLICT (day, path, source) DO UPDATE
    SET views = v.views + 1,
        visitors = v.visitors + CASE WHEN p_new_site_visitor THEN 1 ELSE 0 END;
END;
$$;

REVOKE ALL ON FUNCTION record_visit(DATE, TEXT, TEXT, BOOLEAN, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION record_visit(DATE, TEXT, TEXT, BOOLEAN, BOOLEAN) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION record_visit(DATE, TEXT, TEXT, BOOLEAN, BOOLEAN) TO service_role;
