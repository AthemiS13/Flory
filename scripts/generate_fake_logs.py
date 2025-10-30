#!/usr/bin/env python3
"""
Generate fake Flory (Smart-Pot) CSV logs for debugging.

Log format per Documentation.md:
timestamp,soilPercent,waterPercent,temp,hum,pumpOn,timeSynced
- timestamp: "YYYY-MM-DD HH:MM:SS" or "ms:<millis>"
- soilPercent, waterPercent, temp, hum: floats
- pumpOn: 1 or 0
- timeSynced: 1 or 0

You can generate by number of lines (--lines) or by date range:
    --start-date YYYY-MM-DD [--end-date YYYY-MM-DD]
or
    --month YYYY-MM (generates for that calendar month)

Safety: generating a very large file (many lines) will be refused unless --force is provided.

Usage examples:
    python3 scripts/generate_fake_logs.py --lines 120 --interval-seconds 60 --outfile log/log.txt
    python3 scripts/generate_fake_logs.py --month 2025-10 --interval-seconds 3600 --outfile log/log_oct2025_hourly.txt

The script creates parent directories as needed.
"""
from __future__ import annotations
import argparse
import csv
import datetime
import os
import random
import time
from typing import Optional


def make_row(ts: str, soil: float, water: float, temp: float, hum: float, pump: int, synced: int) -> list:
    # Format floats with 1 decimal like 12.3
    return [ts, f"{soil:.1f}", f"{water:.1f}", f"{temp:.1f}", f"{hum:.1f}", str(pump), str(synced)]


def generate_lines(count: int, start_dt: Optional[datetime.datetime], interval_s: int, seed: Optional[int], time_synced_prob: float):
    rnd = random.Random(seed)
    now_ms = int(time.time() * 1000)

    for i in range(count):
        # Decide if this line is time-synced
        synced = 1 if rnd.random() < time_synced_prob else 0

        if synced:
            if start_dt is None:
                dt = datetime.datetime.now() + datetime.timedelta(seconds=i * interval_s)
            else:
                dt = start_dt + datetime.timedelta(seconds=i * interval_s)
            ts = dt.strftime('%Y-%m-%d %H:%M:%S')
        else:
            ts = f"ms:{now_ms + i * interval_s * 1000}"

        # soilPercent: base around 20-60 but allow some drift and occasional dry/wet extremes
        soil = max(0.0, min(100.0, rnd.normalvariate(40.0, 12.0)))
        # waterPercent (touch sensor): independent-ish
        water = max(0.0, min(100.0, rnd.normalvariate(30.0, 18.0)))
        # temp degC typical indoor 15-30
        temp = max(-40.0, min(125.0, rnd.normalvariate(22.0, 3.0)))
        # humidity %
        hum = max(0.0, min(100.0, rnd.normalvariate(55.0, 12.0)))

        # pumpOn: small chance pump is active; if soil is very low, bump chance
        pump_chance = 0.01
        if soil < 25.0:
            pump_chance += 0.08
        pump = 1 if rnd.random() < pump_chance else 0

        yield make_row(ts, soil, water, temp, hum, pump, synced)


def write_log(outfile: str, rows, header: list[str] = None, mode: str = 'w'):
    outdir = os.path.dirname(outfile)
    if outdir and not os.path.exists(outdir):
        os.makedirs(outdir, exist_ok=True)

    with open(outfile, mode, newline='') as f:
        writer = csv.writer(f)
        if header:
            writer.writerow(header)
        for r in rows:
            writer.writerow(r)


def parse_dt(s: str) -> datetime.datetime:
    # Accept "YYYY-MM-DD HH:MM:SS" or ISO-ish
    try:
        return datetime.datetime.strptime(s, '%Y-%m-%d %H:%M:%S')
    except ValueError:
        # try ISO
        return datetime.datetime.fromisoformat(s)


def main():
    p = argparse.ArgumentParser(description='Generate fake Flory (Smart-Pot) CSV logs')
    grp = p.add_mutually_exclusive_group()
    grp.add_argument('--lines', '-n', type=int, help='Number of log lines to generate')
    grp.add_argument('--month', type=str, help='Generate logs for calendar month, format YYYY-MM')
    p.add_argument('--start-date', type=str, help='Start date YYYY-MM-DD (inclusive) for range generation')
    p.add_argument('--end-date', type=str, help='End date YYYY-MM-DD (inclusive) for range generation')
    p.add_argument('--interval-seconds', '-i', type=int, default=60, help='Interval between log lines in seconds')
    p.add_argument('--outfile', '-o', type=str, default='log/log.txt', help='Output file path (will create parent dirs)')
    p.add_argument('--seed', type=int, default=None, help='Random seed (optional)')
    p.add_argument('--start-time', '-s', type=str, default=None, help='Start timestamp for first synced line ("YYYY-MM-DD HH:MM:SS")')
    p.add_argument('--time-synced-prob', type=float, default=0.95, help='Probability a given line has a synced human timestamp (0..1). Default 0.95')
    p.add_argument('--append', action='store_true', help='Append to outfile instead of overwriting')
    p.add_argument('--force', action='store_true', help='Allow generating very large files')
    args = p.parse_args()

    start_dt = None
    if args.start_time:
        start_dt = parse_dt(args.start_time)

    # Determine generation mode
    interval = args.interval_seconds
    header = ['timestamp', 'soilPercent', 'waterPercent', 'temp', 'hum', 'pumpOn', 'timeSynced']

    if args.lines is not None:
        count = int(args.lines)
        # If a start-date was provided, use it as base for synced timestamps
        if args.start_date:
            start_dt = parse_dt(args.start_date + ' 00:00:00')
    else:
        # Range or month mode
        if args.month:
            # parse YYYY-MM
            try:
                y, m = args.month.split('-')
                y = int(y); m = int(m)
                start_dt = datetime.datetime(y, m, 1, 0, 0, 0)
                # compute first day of next month
                if m == 12:
                    next_dt = datetime.datetime(y+1, 1, 1, 0, 0, 0)
                else:
                    next_dt = datetime.datetime(y, m+1, 1, 0, 0, 0)
                end_dt_inclusive = next_dt - datetime.timedelta(seconds=interval)
            except Exception as e:
                raise SystemExit(f"Invalid --month format, expected YYYY-MM: {e}")
        elif args.start_date:
            # parse start and end dates
            try:
                start_dt = parse_dt(args.start_date + ' 00:00:00')
                if args.end_date:
                    end_dt = parse_dt(args.end_date + ' 23:59:59')
                else:
                    # default to same day
                    end_dt = start_dt + datetime.timedelta(days=1) - datetime.timedelta(seconds=1)
                end_dt_inclusive = end_dt
            except Exception as e:
                raise SystemExit(f"Invalid date input: {e}")
        else:
            raise SystemExit('Specify --lines or --month or --start-date')

        # compute count from start_dt..end_dt_inclusive
        total_seconds = (end_dt_inclusive - start_dt).total_seconds()
        count = int(total_seconds // interval) + 1

    # Safety guard
    if count > 20000 and not args.force:
        raise SystemExit(f"Refusing to generate {count} lines (>{20000}). Re-run with --force if you really want this.")

    mode = 'a' if args.append else 'w'

    rows = list(generate_lines(count, start_dt, interval, args.seed, args.time_synced_prob))

    write_log(args.outfile, rows, header=header, mode=mode)

    print(f"Wrote {len(rows)} lines to {args.outfile}")


if __name__ == '__main__':
    main()
