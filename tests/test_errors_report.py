"""scripts/errors_report.py builds the query it sends to Cloudflare: only known columns, bounded numbers, nothing typed by a person ends up in the SQL."""
import os, sys, unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts"))
import errors_report  # noqa: E402


class TestSql(unittest.TestCase):
    def test_the_query_counts_error_events_of_the_last_days(self):
        sql = errors_report.build_sql(7, ("note", "page"))
        self.assertEqual(sql, "SELECT blob6 AS note, blob3 AS page, SUM(_sample_interval) AS n FROM tsf_events WHERE blob1 = 'error-js' AND timestamp > NOW() - INTERVAL '7' DAY GROUP BY note, page ORDER BY n DESC LIMIT 25 FORMAT JSON")

    def test_nothing_unknown_can_get_into_the_query(self):
        for bad in (dict(days=0, group=("note",)), dict(days=100, group=("note",)), dict(days=7, group=("note; DROP TABLE x",)), dict(days=7, group=("blob1",)), dict(days=7, group=("note",), limit=0)):
            with self.assertRaises(ValueError, msg=str(bad)):
                errors_report.build_sql(**bad)
        with self.assertRaises((ValueError, TypeError)):
            errors_report.build_sql("7' OR '1'='1", ("note",))


if __name__ == "__main__":
    unittest.main()
