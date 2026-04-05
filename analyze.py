#!/usr/bin/env python3
"""
Experiment Data Analyzer
========================
Reads the SQLite database and displays a formatted summary of all
experiment sessions, rounds, and convergence data.

Usage:
    python analyze.py                    # analyze all sessions
    python analyze.py SESSION_ID         # analyze a specific session
    python analyze.py --export SESSION_ID  # export session to CSV files
"""

import sqlite3
import sys
import os
import csv
from collections import defaultdict

DB_PATH = os.path.join(os.path.dirname(__file__), "data", "experiment.db")

# ─── Helpers ──────────────────────────────────────────────────────────────────

def connect():
    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH}")
        print("Start the server first to create the database.")
        sys.exit(1)
    return sqlite3.connect(DB_PATH)


def dict_cursor(conn):
    conn.row_factory = sqlite3.Row
    return conn.cursor()


def separator(char="─", width=70):
    print(char * width)


def header(title):
    print()
    separator("═")
    print(f"  {title}")
    separator("═")


def sub_header(title):
    print()
    print(f"  {title}")
    separator("─")


# ─── Data Fetchers ────────────────────────────────────────────────────────────

def get_sessions(cur):
    cur.execute("SELECT * FROM sessions ORDER BY created_at DESC")
    return [dict(row) for row in cur.fetchall()]


def get_session(cur, session_id):
    cur.execute("SELECT * FROM sessions WHERE id = ?", (session_id,))
    row = cur.fetchone()
    return dict(row) if row else None


def get_participants(cur, session_id):
    cur.execute(
        "SELECT * FROM participants WHERE session_id = ? ORDER BY joined_at",
        (session_id,),
    )
    return [dict(row) for row in cur.fetchall()]


def get_rounds(cur, session_id):
    cur.execute(
        "SELECT * FROM rounds WHERE session_id = ? ORDER BY round_number",
        (session_id,),
    )
    return [dict(row) for row in cur.fetchall()]


def get_round_data(cur, round_id):
    """Get pairs and results for a round."""
    cur.execute("SELECT * FROM pairs WHERE round_id = ?", (round_id,))
    pairs = [dict(row) for row in cur.fetchall()]

    for pair in pairs:
        cur.execute("SELECT * FROM results WHERE pair_id = ?", (pair["id"],))
        result = cur.fetchone()
        pair["result"] = dict(result) if result else None

        cur.execute("SELECT * FROM responses WHERE pair_id = ?", (pair["id"],))
        pair["responses"] = [dict(r) for r in cur.fetchall()]

    return pairs


def get_all_results(cur, session_id):
    """Get all results joined with round and participant info."""
    cur.execute("""
        SELECT
            rd.round_number,
            rd.image_id,
            p.participant_a,
            p.participant_b,
            p.pairing_algorithm,
            r.value_a,
            r.value_b,
            r.difference,
            r.matched
        FROM results r
        JOIN pairs p ON r.pair_id = p.id
        JOIN rounds rd ON p.round_id = rd.id
        WHERE rd.session_id = ?
        ORDER BY rd.round_number, p.participant_a
    """, (session_id,))
    return [dict(row) for row in cur.fetchall()]


# ─── Display Functions ────────────────────────────────────────────────────────

def show_sessions_overview(cur):
    sessions = get_sessions(cur)
    if not sessions:
        print("\n  No sessions found in database.")
        return

    header("ALL SESSIONS")
    print(f"  {'ID':<10} {'Name':<25} {'Status':<12} {'Created'}")
    separator("─")
    for s in sessions:
        print(f"  {s['id']:<10} {s['name']:<25} {s['status']:<12} {s['created_at']}")

    print(f"\n  Total: {len(sessions)} session(s)")
    print(f"\n  Tip: Run 'python analyze.py SESSION_ID' for detailed view")


def show_session_detail(cur, session_id):
    session = get_session(cur, session_id)
    if not session:
        print(f"\n  Session '{session_id}' not found.")
        return

    import json
    config = json.loads(session["config"])

    # ── Session Info ──
    header(f"SESSION: {session['name']} ({session['id']})")
    print(f"  Status:    {session['status']}")
    print(f"  Created:   {session['created_at']}")
    print(f"  Algorithm: {config.get('pairingAlgorithm', 'N/A')}")
    print(f"  Tolerance: {config.get('tolerance', 'N/A')}")
    print(f"  Feedback:  {config.get('feedbackMode', 'N/A')}")

    # ── Participants ──
    participants = get_participants(cur, session_id)
    sub_header(f"PARTICIPANTS ({len(participants)})")
    if participants:
        print(f"  {'ID':<12} {'Connected':<12} {'Joined'}")
        separator("─")
        for p in participants:
            connected = "Yes" if p["connected"] else "No"
            print(f"  {p['id']:<12} {connected:<12} {p['joined_at']}")
    else:
        print("  No participants joined.")

    # ── Rounds ──
    rounds = get_rounds(cur, session_id)
    sub_header(f"ROUNDS ({len(rounds)})")
    if not rounds:
        print("  No rounds played.")
        return

    for rnd in rounds:
        pairs = get_round_data(cur, rnd["id"])
        completed = [p for p in pairs if p["result"]]
        matches = [p for p in completed if p["result"]["matched"]]

        print(f"\n  Round {rnd['round_number']} — Image: {rnd['image_id']} — Status: {rnd['status']}")

        if completed:
            avg_diff = sum(p["result"]["difference"] for p in completed) / len(completed)
            match_rate = len(matches) / len(completed) * 100
            values = []
            for p in completed:
                values.append(p["result"]["value_a"])
                values.append(p["result"]["value_b"])
            avg_value = sum(values) / len(values) if values else 0
            min_val = min(values) if values else 0
            max_val = max(values) if values else 0

            print(f"  Pairs: {len(pairs)}  |  Completed: {len(completed)}  |  "
                  f"Matches: {len(matches)} ({match_rate:.0f}%)")
            print(f"  Avg Difference: {avg_diff:.1f}  |  "
                  f"Avg Value: {avg_value:.0f}  |  "
                  f"Range: [{min_val}, {max_val}]")
        else:
            print(f"  Pairs: {len(pairs)}  |  No results yet")

        # Show pair details
        if completed:
            print()
            print(f"    {'Player A':<10} {'Val A':>6}  {'Player B':<10} {'Val B':>6}  {'Diff':>5}  {'Match'}")
            print("    " + "─" * 52)
            for p in pairs:
                if p["result"]:
                    name_a = p["participant_a"][:8]
                    name_b = p["participant_b"][:8]
                    r = p["result"]
                    match_str = "YES" if r["matched"] else "no"
                    print(f"    {name_a:<10} {r['value_a']:>6}  "
                          f"{name_b:<10} {r['value_b']:>6}  "
                          f"{r['difference']:>5}  {match_str}")

    # ── Convergence Analysis ──
    all_results = get_all_results(cur, session_id)
    if len(rounds) > 1 and all_results:
        show_convergence(rounds, all_results)


def show_convergence(rounds, all_results):
    """Show whether participants converged over rounds."""
    sub_header("CONVERGENCE ANALYSIS")

    # Group by round
    by_round = defaultdict(list)
    for r in all_results:
        by_round[r["round_number"]].append(r)

    # Group by image
    by_image = defaultdict(lambda: defaultdict(list))
    for r in all_results:
        by_image[r["image_id"]][r["round_number"]].append(r)

    # Overall convergence per round
    print(f"  {'Round':>6}  {'Pairs':>6}  {'Match%':>7}  {'Avg Diff':>9}  {'Avg Value':>10}  {'Std Dev':>8}")
    print("  " + "─" * 55)

    round_stats = []
    for rnd_num in sorted(by_round.keys()):
        results = by_round[rnd_num]
        n = len(results)
        matches = sum(1 for r in results if r["matched"])
        avg_diff = sum(r["difference"] for r in results) / n
        values = []
        for r in results:
            values.extend([r["value_a"], r["value_b"]])
        avg_val = sum(values) / len(values) if values else 0

        # Standard deviation
        if len(values) > 1:
            mean = avg_val
            variance = sum((v - mean) ** 2 for v in values) / len(values)
            std_dev = variance ** 0.5
        else:
            std_dev = 0

        match_pct = matches / n * 100 if n > 0 else 0
        round_stats.append({
            "round": rnd_num, "match_pct": match_pct,
            "avg_diff": avg_diff, "avg_val": avg_val, "std_dev": std_dev,
        })

        print(f"  {rnd_num:>6}  {n:>6}  {match_pct:>6.1f}%  {avg_diff:>9.1f}  "
              f"{avg_val:>10.0f}  {std_dev:>8.1f}")

    # Convergence verdict
    if len(round_stats) >= 2:
        first = round_stats[0]
        last = round_stats[-1]
        print()
        if last["std_dev"] < first["std_dev"] * 0.5:
            print("  >> Strong convergence detected: value spread decreased significantly")
        elif last["std_dev"] < first["std_dev"] * 0.8:
            print("  >> Moderate convergence: value spread decreased")
        elif last["match_pct"] > first["match_pct"] + 20:
            print("  >> Match rate improved significantly over rounds")
        else:
            print("  >> No clear convergence pattern detected")

        diff_change = last["avg_diff"] - first["avg_diff"]
        print(f"  >> Average difference changed by {diff_change:+.1f} "
              f"(from {first['avg_diff']:.1f} to {last['avg_diff']:.1f})")

    # Per-image breakdown
    if len(by_image) > 1:
        sub_header("PER-IMAGE BREAKDOWN")
        for image_id in sorted(by_image.keys()):
            rounds_data = by_image[image_id]
            all_vals = []
            for rnd_results in rounds_data.values():
                for r in rnd_results:
                    all_vals.extend([r["value_a"], r["value_b"]])

            if all_vals:
                avg = sum(all_vals) / len(all_vals)
                min_v = min(all_vals)
                max_v = max(all_vals)
                print(f"  Image '{image_id}': avg={avg:.0f}, range=[{min_v}, {max_v}], "
                      f"n={len(all_vals)} values across {len(rounds_data)} round(s)")


# ─── Export ───────────────────────────────────────────────────────────────────

def export_session(cur, session_id):
    session = get_session(cur, session_id)
    if not session:
        print(f"Session '{session_id}' not found.")
        return

    export_dir = os.path.join(os.path.dirname(__file__), "exports")
    os.makedirs(export_dir, exist_ok=True)

    # Export results
    all_results = get_all_results(cur, session_id)
    results_path = os.path.join(export_dir, f"{session_id}_results.csv")
    if all_results:
        with open(results_path, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=all_results[0].keys())
            writer.writeheader()
            writer.writerows(all_results)
        print(f"  Results: {results_path} ({len(all_results)} rows)")
    else:
        print("  No results to export.")

    # Export participants
    participants = get_participants(cur, session_id)
    parts_path = os.path.join(export_dir, f"{session_id}_participants.csv")
    if participants:
        with open(parts_path, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=["id", "connected", "joined_at"])
            writer.writeheader()
            for p in participants:
                writer.writerow({k: p[k] for k in ["id", "connected", "joined_at"]})
        print(f"  Participants: {parts_path} ({len(participants)} rows)")

    # Export all responses (raw)
    cur.execute("""
        SELECT
            rd.round_number, rd.image_id,
            p.participant_a, p.participant_b,
            resp.participant_id, resp.value, resp.submitted_at
        FROM responses resp
        JOIN pairs p ON resp.pair_id = p.id
        JOIN rounds rd ON p.round_id = rd.id
        WHERE rd.session_id = ?
        ORDER BY rd.round_number, resp.submitted_at
    """, (session_id,))
    responses = [dict(row) for row in cur.fetchall()]
    resp_path = os.path.join(export_dir, f"{session_id}_responses.csv")
    if responses:
        with open(resp_path, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=responses[0].keys())
            writer.writeheader()
            writer.writerows(responses)
        print(f"  Responses: {resp_path} ({len(responses)} rows)")

    print(f"\n  All files saved to: {export_dir}/")


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    conn = connect()
    cur = dict_cursor(conn)

    if len(sys.argv) > 1:
        if sys.argv[1] == "--export" and len(sys.argv) > 2:
            header(f"EXPORTING SESSION: {sys.argv[2]}")
            export_session(cur, sys.argv[2])
        elif sys.argv[1] == "--help":
            print(__doc__)
        else:
            show_session_detail(cur, sys.argv[1])
    else:
        show_sessions_overview(cur)

    conn.close()


if __name__ == "__main__":
    main()
