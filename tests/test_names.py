"""Saved real examples for the box-score name handling in scripts/build_career_stats.py and the lifting typo check in
scripts/validate_data.py. Every name below is a real spelling from the box-score archive or the lifting sheets, and each
group of asserts names the bug it guards against.

Run:   python -m unittest discover -s tests          (needs openpyxl, which build_career_stats imports)
"""
import collections
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import build_career_stats as b  # noqa: E402
import validate_data as v  # noqa: E402


class SplitRawName(unittest.TestCase):
    def test_common_formats(self):
        self.assertEqual(b.split_raw_name("Williams,Lamont"), ("Williams", "Lamont"))
        self.assertEqual(b.split_raw_name("Lamont Williams"), ("Williams", "Lamont"))  # 2014: no comma, all season
        self.assertEqual(b.split_raw_name("Burlingame"), ("Burlingame", ""))          # bare last name (passing rows)
        self.assertEqual(b.split_raw_name("Cadet, Jr.,Carlos"), ("Cadet Jr.", "Carlos"))

    def test_not_players(self):
        self.assertEqual(b.split_raw_name("TEAM"), (None, None))
        self.assertEqual(b.split_raw_name("70"), (None, None))  # a bare jersey number (2011)

    def test_multi_word_surnames(self):
        # Before 2026-10-25 these were "unparseable" and their lines dropped (2012 was 19 tackles short).
        self.assertEqual(b.split_raw_name("Ted Van Thiel"), ("Van Thiel", "Ted"))
        self.assertEqual(b.split_raw_name("Adam Van Schyndel"), ("Van Schyndel", "Adam"))
        self.assertEqual(b.split_raw_name("Van Schaick"), ("Van Schaick", ""))  # a surname alone, not first name "Van"

    def test_suffix_is_not_a_first_name(self):
        self.assertEqual(b.split_raw_name("Carlos Cadet, Jr."), ("Cadet Jr.", "Carlos"))  # was first name "Jr."
        self.assertEqual(b.split_raw_name("Muth, JR"), ("Muth", "JR"))  # J.R. Muth: initials after a lone surname


class Initials(unittest.TestCase):
    def test_initials(self):
        for first in ("K.", "J.R", "J.R.", "JR", "CJ"):
            self.assertTrue(b.is_initial(first), first)

    def test_short_first_names_are_names(self):
        # Before 2026-10-25 any first name of 3 letters or fewer was read as initials: "Joe Kashul" -> "J.O.E. Kashul".
        for first in ("Ted", "Joe", "Tim", "Dan", "Ty", "Bo", "Clay."):
            self.assertFalse(b.is_initial(first), first)

    def test_unmatched_identities(self):
        got = b.resolve_unmatched_identities({"kashul": collections.Counter({("Joe", "Kashul"): 5})})
        self.assertEqual(got[("Joe", "Kashul")], "Joe Kashul")
        got = b.resolve_unmatched_identities({"campbell": collections.Counter({
            ("Hunter", "Campbell"): 9, ("H.", "Campbell"): 3, ("Garret", "Campbell"): 4, ("G.", "Campbell"): 1})})
        self.assertEqual(got[("H.", "Campbell")], "Hunter Campbell")
        self.assertEqual(got[("G.", "Campbell")], "Garret Campbell")
        got = b.resolve_unmatched_identities({"burlingame": collections.Counter({
            ("Kyle", "Burlingame"): 20, ("K.", "Burlingame"): 4, ("", "Burlingame"): 6})})
        self.assertEqual({got[k] for k in got}, {"Kyle Burlingame"})


class LiftingTypos(unittest.TestCase):
    def test_edit_distance(self):
        # the five 2026-10-23 splits and the Banks one found by the check: all one or two letters apart
        for a, bb in (("Lichuki", "Lichucki"), ("Collin", "Colin"), ("Dominic", "Dominick"), ("Grifftihs", "Griffiths"),
                      ("Qunitin", "Quintin"), ("Camren", "Cameran")):
            self.assertLessEqual(v.edit_distance(a, bb), 2, (a, bb))
        self.assertGreater(v.edit_distance("Jacob", "Jackson"), 2)


if __name__ == "__main__":
    unittest.main()
